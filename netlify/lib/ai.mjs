import { getGrantContext } from './grant-library.mjs';

// ---------------------------------------------------------------------------
// Two engines, two jobs.
//
//   Gemini  -> free preview. Runs on Google's free tier, writes a shorter
//              draft, and the visitor only sees the opening of it.
//   Claude  -> paying members. Longer, more carefully structured, full text.
//
// Nothing about the paid path silently falls back to the free model: if
// Claude fails for a paying customer we say so rather than quietly handing
// them the cheaper output they didn't pay for.
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [process.env.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'].filter(Boolean);
const CLAUDE_MODELS = [process.env.ANTHROPIC_MODEL, 'claude-sonnet-5', 'claude-haiku-4-5-20251001'].filter(Boolean);

export const MAX_RFP_CHARS = 24000;

function baseRules(requestType) {
  const context = getGrantContext(requestType);
  return `You are an experienced grant writer producing an application narrative on behalf of a nonprofit.

Hard rules you must never break:
- Never invent statistics, dates, dollar figures, partner names, or outcomes that the organization did not supply. If the evidence is thin, write about it qualitatively and honestly.
- Never claim an award, accreditation, or endorsement that was not provided.
- Do not use markdown, asterisks, bullet characters, or headings. Plain prose paragraphs only, ready to paste into an application form.
- Write in the organization's voice ("we"), calm and specific, never breathless or salesy.
- Mirror the funder's own language and stated priorities where the guidelines make that possible.

General grant-writing context for this request type. Use it to sharpen the argument, but never present it as this funder's stated policy:
${context}`;
}

function previewSystemPrompt(requestType) {
  return `${baseRules(requestType)}

Write roughly 300 words: a tight opening that says who the organization is and what it is asking for, one paragraph connecting the request to the funder's priorities, and one paragraph on the program itself. Do not write a closing ask — the narrative should read as the first part of a longer application.`;
}

function fullSystemPrompt(requestType) {
  return `${baseRules(requestType)}

Write a complete application narrative of 700 to 900 words, structured as flowing paragraphs in this order:
1. Who the organization is and exactly what is being requested.
2. The need being addressed, grounded in the community and population described.
3. How the request matches this funder's stated priorities, quoting their framing where the guidelines allow.
4. The program or project itself: what happens, who delivers it, who it reaches.
5. Evidence and track record, using only what the organization provided, described honestly.
6. How the money will be used and what it makes possible.
7. A short, direct closing ask naming the amount and purpose.`;
}

function userPrompt(input) {
  const rfp = String(input.rfpText || '').slice(0, MAX_RFP_CHARS);
  return `ORGANIZATION: ${input.orgName}
WHAT THEY DO: ${input.orgMission || 'Not provided — keep general rather than inventing detail.'}
PROGRAM OR PROJECT: ${input.progName || 'Not specified'}
REQUEST TYPE: ${input.requestType || 'Not specified / unclear'}
AMOUNT REQUESTED: ${input.amount || 'Not specified — refer to the request without naming a figure.'}
DEADLINE: ${input.deadline || 'Not specified'}
OUTCOMES OR EVIDENCE SO FAR: ${input.outcomes || 'Not provided — do not fabricate numbers.'}

FUNDER: ${input.funderName}
FUNDER GUIDELINES / RFP TEXT:
"""
${rfp}
"""`;
}

// --- Gemini (free preview) -------------------------------------------------

async function callGemini(system, user) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: 'The free preview is unavailable: GEMINI_API_KEY is not set on the server.' };
  }

  let lastError = 'Gemini did not respond.';

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 1400
            }
          })
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        lastError = data?.error?.message || `Gemini returned ${res.status}.`;
        // 404 / 400 usually means the model name is wrong for this key — try the next one.
        if (res.status === 404 || res.status === 400) continue;
        return { error: lastError };
      }

      const text = (data?.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || '')
        .join('')
        .trim();

      if (text) return { text, engine: `gemini:${model}` };
      lastError = 'Gemini returned an empty draft.';
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  return { error: lastError };
}

// --- Claude (paid full draft) ---------------------------------------------

async function callClaude(system, user) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { error: 'Full drafts are unavailable: ANTHROPIC_API_KEY is not set on the server.' };
  }

  let lastError = 'Claude did not respond.';

  for (const model of CLAUDE_MODELS) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 2400,
          temperature: 0.5,
          system,
          messages: [{ role: 'user', content: user }]
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        lastError = data?.error?.message || `Claude returned ${res.status}.`;
        if (res.status === 404) continue; // unknown model name, try the next
        return { error: lastError };
      }

      const text = (Array.isArray(data.content) ? data.content : [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      if (text) return { text, engine: `claude:${model}` };
      lastError = 'Claude returned an empty draft.';
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }

  return { error: lastError };
}

// --- Public API ------------------------------------------------------------

export async function generatePreview(input) {
  return callGemini(previewSystemPrompt(input.requestType), userPrompt(input));
}

export async function generateFull(input) {
  return callClaude(fullSystemPrompt(input.requestType), userPrompt(input));
}

// How much of a preview draft the visitor actually gets to read.
const PREVIEW_RATIO = 0.45;

export function truncateForPreview(text) {
  const clean = String(text || '').trim();
  const target = Math.max(320, Math.floor(clean.length * PREVIEW_RATIO));
  if (clean.length <= target) return clean;

  const window = clean.slice(0, target + 200);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('.\n'));
  const cut = lastStop > target * 0.6 ? lastStop + 1 : target;
  return clean.slice(0, cut).trim();
}
