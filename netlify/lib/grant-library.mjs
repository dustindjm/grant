const GRANT_LIBRARY = {
  'General operating support': [
    "General operating requests are usually judged on organizational stability, leadership and track record rather than one program's metrics, so financial health and governance carry real weight.",
    'Funders considering unrestricted money often want to see how the organization plans and prioritizes spending, not only what the money will directly buy.'
  ],
  'Program or project support': [
    'Program requests are strongest when they name a clear outcome tied to the amount asked for, even when the measurement is informal.',
    "Reviewers want to see how the project fits the organization's broader mission, not just that it is a good idea on its own."
  ],
  'Capacity building': [
    'Capacity requests land better when tied to a specific limitation the organization is hitting right now, rather than framed as general growth.',
    'It helps to name what becomes possible afterward that is not possible today.'
  ],
  'Capital or equipment': [
    'Capital requests normally need an itemized cost and a plain statement of what the item or space lets the organization do.',
    'Matching funds or other committed money strengthens a capital case, because funders rarely want to be the only source.'
  ],
  'Not specified / unclear': [
    "When the request type is not stated, matching the tone and priorities in the funder's own guidelines is more reliable than guessing at a category."
  ]
};

export function getGrantPoints(requestType) {
  return GRANT_LIBRARY[requestType] || GRANT_LIBRARY['Not specified / unclear'];
}

export function getGrantContext(requestType) {
  const points = getGrantPoints(requestType);
  if (!points.length) return '';
  return points.map((p) => `- ${p}`).join('\n');
}
