import { escapeHtml } from './http.mjs';

export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to) {
    console.log('[email] skipped (no RESEND_API_KEY or no recipient):', subject);
    return { skipped: true };
  }

  const from = process.env.EMAIL_FROM || 'Grantwright <onboarding@resend.dev>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html })
    });
    if (!res.ok) {
      console.error('[email] Resend error:', await res.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] send failed:', err?.message);
    return { sent: false };
  }
}

export function draftEmailHtml(order) {
  return `<div style="font-family:Georgia,serif;max-width:640px;">
  <p>Your full draft for <strong>${escapeHtml(order.funderName)}</strong> is ready and unlocked in your account.</p>
  <p>Every future draft you generate with this email unlocks automatically — no repeat checkout.</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;">
  <div style="white-space:pre-wrap;font-size:15px;line-height:1.65;">${escapeHtml(order.draft)}</div>
</div>`;
}
