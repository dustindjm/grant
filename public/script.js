/* Grantwright — client logic
   Free previews come from Gemini via /api/generate-draft.
   Paying members get the full Claude draft from the same endpoint. */

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  isMember: false,
  plan: null,
  plans: [],
  selectedPlan: 'monthly',
  activeId: null,
  freeLimit: 3
};

// ---------------------------------------------------------------- navigation
const navButtons = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.app-screen');
const TAB_TITLES = { new: 'Grantwright', history: 'My drafts', pricing: 'Pricing', help: 'Help', account: 'Account' };

function switchTab(tab) {
  const target = $('screen-' + tab);
  if (!target) return;
  screens.forEach((s) => s.classList.remove('active'));
  target.classList.add('active');
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('appBarTitle').textContent = TAB_TITLES[tab] || 'Grantwright';
  document.querySelector('.app-content').scrollTop = 0;
}
navButtons.forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

// ------------------------------------------------------------------ helpers
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Try again.');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function showError(el, message) {
  el.textContent = message;
  el.classList.add('visible');
}
function clearError(el) {
  el.classList.remove('visible');
}

function busy(button, label) {
  button.dataset.originalLabel = button.dataset.originalLabel || button.textContent;
  button.disabled = true;
  button.innerHTML = `<span class="spinner-inline"></span>${escapeHtml(label)}`;
}
function idle(button, label) {
  button.disabled = false;
  button.textContent = label || button.dataset.originalLabel || 'Continue';
}

// -------------------------------------------------------------- local drafts
const HISTORY_KEY = 'grantwright_history_v2';

function loadHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(-100)));
  } catch {
    /* storage full or blocked — the server copy is the real one */
  }
}
function upsertEntry(entry) {
  const entries = loadHistory();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = { ...entries[idx], ...entry };
  else entries.push(entry);
  saveHistory(entries);
  renderHistory();
  return entry;
}
function findEntry(id) {
  return loadHistory().find((e) => e.id === id) || null;
}

// ------------------------------------------------------------------- pricing
function renderPlanPicker() {
  const picker = $('planPicker');
  picker.innerHTML = '';
  state.plans.forEach((plan) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'plan-option' + (plan.id === state.selectedPlan ? ' selected' : '');
    btn.innerHTML = `<span class="plan-name">${escapeHtml(plan.label)}</span>
      <span class="plan-price">${escapeHtml(plan.price)}<span class="plan-suffix">${escapeHtml(plan.suffix)}</span></span>`;
    btn.addEventListener('click', () => {
      state.selectedPlan = plan.id;
      renderPlanPicker();
    });
    picker.appendChild(btn);
  });
}

function renderPricingCards() {
  const wrap = $('pricingCards');
  wrap.innerHTML = '';
  state.plans.forEach((plan, i) => {
    const card = document.createElement('div');
    card.className = 'pricing-card' + (i === 0 ? ' featured' : '');
    card.innerHTML = `
      <h3>${escapeHtml(plan.label)}</h3>
      <div class="big-price">${escapeHtml(plan.price)}<span>${escapeHtml(plan.suffix)}</span></div>
      <p>${plan.mode === 'subscription' ? 'Unlimited full drafts while your plan is active. Cancel anytime.' : 'Pay once. Unlimited full drafts, no renewal.'}</p>
      <button type="button" class="btn-primary">${state.isMember ? 'You already have access' : 'Choose ' + escapeHtml(plan.label)}</button>
    `;
    const button = card.querySelector('button');
    button.disabled = state.isMember;
    button.addEventListener('click', () => {
      state.selectedPlan = plan.id;
      startCheckout(button);
    });
    wrap.appendChild(card);
  });
}

// -------------------------------------------------------------- form helpers
const form = $('draftForm');
const errorMsg = $('errorMsg');
const resultError = $('resultError');
const detailsGroup = $('detailsGroup');
const toggleDetails = $('toggleDetails');
const rfpTextArea = $('rfpText');
const requestTypeSelect = $('requestType');
const requestTypeBadge = $('requestTypeBadge');

function showFormScreen() {
  $('introCard').hidden = false;
  form.hidden = false;
  $('outputSection').hidden = true;
  clearError(resultError);
}
function showResultScreen() {
  $('introCard').hidden = true;
  form.hidden = true;
  $('outputSection').hidden = false;
}
$('backToFormBtn').addEventListener('click', showFormScreen);

toggleDetails.addEventListener('click', () => {
  const hidden = detailsGroup.hasAttribute('hidden');
  detailsGroup.toggleAttribute('hidden', !hidden);
  toggleDetails.textContent = hidden ? 'Hide program and org details' : 'Add program and org details (improves accuracy)';
});

const REQUEST_TYPE_KEYWORDS = [
  { match: ['general operating', 'unrestricted', 'operating support'], value: 'General operating support' },
  { match: ['capacity building', 'capacity-building', 'organizational capacity', 'infrastructure'], value: 'Capacity building' },
  { match: ['capital campaign', 'equipment', 'renovation', 'construction', 'capital request'], value: 'Capital or equipment' },
  { match: ['program support', 'project support', 'program grant', 'project grant'], value: 'Program or project support' }
];

rfpTextArea.addEventListener('input', () => {
  const text = rfpTextArea.value.trim().toLowerCase();
  if (text.length < 40) {
    requestTypeBadge.hidden = true;
    return;
  }
  const hit = REQUEST_TYPE_KEYWORDS.find((entry) => entry.match.some((kw) => text.includes(kw)));
  if (!hit) {
    requestTypeBadge.hidden = true;
    return;
  }
  requestTypeBadge.hidden = false;
  requestTypeBadge.textContent = `Detected request type: ${hit.value}. Change it below if that's wrong.`;
  requestTypeSelect.value = hit.value;
  if (detailsGroup.hasAttribute('hidden')) {
    detailsGroup.removeAttribute('hidden');
    toggleDetails.textContent = 'Hide program and org details';
  }
});

$('rfpFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1_000_000) {
    showError(errorMsg, 'That file is too large. Paste the relevant sections instead.');
    return;
  }
  const text = await file.text();
  rfpTextArea.value = text.trim().slice(0, 24000);
  rfpTextArea.dispatchEvent(new Event('input'));
  $('uploadLabel').textContent = `Loaded: ${file.name}`;
});

// ----------------------------------------------------------------- rendering
const draftOutput = $('draftOutput');
const docFade = $('docFade');

function renderPreview(entry) {
  draftOutput.textContent = entry.draft;
  draftOutput.contentEditable = 'false';
  draftOutput.classList.remove('unlocked');
  docFade.classList.remove('hidden');
  $('docHeadLabel').textContent = 'Draft preview';
  $('lockedFoot').hidden = false;
  $('unlockedFoot').hidden = true;
  $('editHint').hidden = true;
  $('unlockBtn').textContent = state.isMember ? 'Write the full version' : 'Unlock full drafts';
  renderPlanPicker();
  $('planPicker').hidden = state.isMember;
}

function renderFull(entry) {
  draftOutput.textContent = entry.draft;
  draftOutput.contentEditable = 'true';
  draftOutput.classList.add('unlocked');
  docFade.classList.add('hidden');
  $('docHeadLabel').textContent = 'Full draft — editable';
  $('lockedFoot').hidden = true;
  $('unlockedFoot').hidden = false;
  $('editHint').hidden = false;
}

function renderContext(points) {
  const box = $('contextBox');
  if (!points || !points.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $('contextList').innerHTML = points.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
}

function openEntry(entry) {
  state.activeId = entry.id;
  switchTab('new');
  if (entry.unlocked) renderFull(entry);
  else renderPreview(entry);
  renderContext(entry.referencedPoints);
  showResultScreen();
}

draftOutput.addEventListener('input', () => {
  if (!draftOutput.classList.contains('unlocked') || !state.activeId) return;
  upsertEntry({ id: state.activeId, draft: draftOutput.textContent });
});

// ------------------------------------------------------------------- history
function renderHistory() {
  const entries = loadHistory().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const list = $('historyList');
  const empty = $('historyEmpty');
  list.innerHTML = '';

  if (!entries.length) {
    empty.classList.add('visible');
    return;
  }
  empty.classList.remove('visible');

  entries.forEach((entry) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-item-left">
        <span class="history-item-title">${escapeHtml(entry.orgName || 'Draft')} — ${escapeHtml(entry.funderName || '')}</span>
        <span class="history-item-meta">${new Date(entry.createdAt || Date.now()).toLocaleDateString()}</span>
      </span>
      <span class="history-status ${entry.unlocked ? 'unlocked' : 'locked'}">${entry.unlocked ? 'Full' : 'Preview'}</span>`;
    item.addEventListener('click', () => openEntry(findEntry(entry.id) || entry));
    list.appendChild(item);
  });
}

async function syncServerDrafts() {
  if (!state.user) return;
  try {
    const data = await api('/api/my-drafts');
    (data.drafts || []).forEach((d) =>
      upsertEntry({
        id: d.id,
        orgName: d.orgName,
        funderName: d.funderName,
        createdAt: d.createdAt,
        draft: d.draft,
        referencedPoints: d.referencedPoints || [],
        unlocked: !!d.unlocked
      })
    );
  } catch {
    /* not logged in, or offline — local history still works */
  }
}

// ------------------------------------------------------------ generate draft
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError(errorMsg);

  const payload = {
    orgName: $('orgName').value.trim(),
    orgEmail: $('orgEmail').value.trim(),
    funderName: $('funderName').value.trim(),
    rfpText: rfpTextArea.value.trim(),
    orgMission: $('orgMission').value.trim(),
    requestType: requestTypeSelect.value,
    progName: $('progName').value.trim(),
    amount: $('amount').value.trim(),
    deadline: $('deadline').value,
    outcomes: $('outcomes').value.trim(),
    plan: state.selectedPlan
  };

  if (!payload.orgName || !payload.orgEmail || !payload.funderName || !payload.rfpText) {
    showError(errorMsg, "Fill in your organization name, email, the funder's name, and their guidelines.");
    return;
  }

  const button = $('generateBtn');
  busy(button, 'Writing your draft…');

  try {
    const data = await api('/api/generate-draft', { method: 'POST', body: JSON.stringify(payload) });

    const entry = upsertEntry({
      id: data.id,
      orgName: payload.orgName,
      funderName: payload.funderName,
      orgEmail: payload.orgEmail,
      createdAt: Date.now(),
      draft: data.draft,
      referencedPoints: data.referencedPoints || [],
      unlocked: !!data.unlocked
    });

    if (typeof data.freePreviewsRemaining === 'number') {
      $('freeQuotaHint').textContent = `${data.freePreviewsRemaining} free preview${data.freePreviewsRemaining === 1 ? '' : 's'} left for this email.`;
    }

    openEntry(entry);
  } catch (err) {
    if (err.data?.limitReached) {
      showError(errorMsg, err.message);
      switchTab('pricing');
    } else {
      showError(errorMsg, err.message);
    }
  } finally {
    idle(button, 'Generate my draft');
  }
});

// ------------------------------------------------------------------ checkout
async function startCheckout(button) {
  const original = button.textContent;
  busy(button, 'Opening checkout…');
  try {
    const entry = state.activeId ? findEntry(state.activeId) : null;
    if (state.activeId) sessionStorage.setItem('gw_pending_order', state.activeId);

    const data = await api('/api/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({
        plan: state.selectedPlan,
        orderId: state.activeId || '',
        email: entry?.orgEmail || $('orgEmail').value.trim() || state.user || ''
      })
    });
    window.location.href = data.url;
  } catch (err) {
    idle(button, original);
    showError(resultError, err.message);
  }
}

$('unlockBtn').addEventListener('click', async () => {
  const button = $('unlockBtn');
  clearError(resultError);

  // Already paid but looking at an old preview? Rewrite it with Claude instead
  // of charging again.
  if (state.isMember && state.activeId) {
    busy(button, 'Writing the full draft…');
    try {
      const data = await api('/api/upgrade-draft', { method: 'POST', body: JSON.stringify({ orderId: state.activeId }) });
      const entry = upsertEntry({ id: data.order.id, draft: data.order.draft, unlocked: true });
      renderFull({ ...findEntry(entry.id), draft: data.order.draft });
    } catch (err) {
      showError(resultError, err.message);
    } finally {
      idle(button, 'Write the full version');
    }
    return;
  }

  startCheckout(button);
});

$('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(draftOutput.textContent);
    $('copyBtn').textContent = 'Copied';
    setTimeout(() => ($('copyBtn').textContent = 'Copy draft'), 1500);
  } catch {
    showError(resultError, 'Your browser blocked the clipboard. Select the text and copy it manually.');
  }
});

$('downloadBtn').addEventListener('click', () => {
  const entry = findEntry(state.activeId);
  const name = entry ? `${entry.orgName}-${entry.funderName}` : 'grant-draft';
  const blob = new Blob([draftOutput.textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------------- auth
$('goToAccountBtn').addEventListener('click', () => switchTab('account'));

$('authTabLogin').addEventListener('click', () => {
  $('authTabLogin').classList.add('active');
  $('authTabSignup').classList.remove('active');
  $('loginForm').hidden = false;
  $('signupForm').hidden = true;
});
$('authTabSignup').addEventListener('click', () => {
  $('authTabSignup').classList.add('active');
  $('authTabLogin').classList.remove('active');
  $('signupForm').hidden = false;
  $('loginForm').hidden = true;
});

function applySession(data) {
  state.user = data.email || null;
  state.isMember = !!data.member;
  state.plan = data.plan || null;
  if (Array.isArray(data.plans) && data.plans.length) state.plans = data.plans;
  if (data.freePreviewLimit) state.freeLimit = data.freePreviewLimit;

  $('memberBadge').hidden = !state.isMember;
  $('authCard').hidden = !!state.user;
  $('loggedInCard').hidden = !state.user;
  $('loginPrompt').hidden = !!state.user;

  if (state.user) {
    $('loggedInEmail').textContent = state.user;
    $('planLine').textContent = state.isMember
      ? `Full access active${state.plan ? ` (${state.plan})` : ''}.`
      : 'No paid plan yet. Previews only.';
    $('manageBillingBtn').hidden = !(state.isMember && state.plan === 'monthly');
    if (!$('orgEmail').value) $('orgEmail').value = state.user;
  }

  renderPricingCards();
  renderPlanPicker();
}

async function loadSession() {
  try {
    applySession(await api('/api/me'));
  } catch {
    applySession({ loggedIn: false, plans: state.plans });
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError($('loginMsg'));
  const button = $('loginSubmitBtn');
  busy(button, 'Logging in…');
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPassword').value })
    });
    await loadSession();
    await syncServerDrafts();
  } catch (err) {
    showError($('loginMsg'), err.message);
  } finally {
    idle(button, 'Log in');
  }
});

$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError($('signupMsg'));
  const button = $('signupSubmitBtn');
  busy(button, 'Creating account…');
  try {
    await api('/api/signup', {
      method: 'POST',
      body: JSON.stringify({ email: $('signupEmail').value.trim(), password: $('signupPassword').value })
    });
    await loadSession();
    await syncServerDrafts();
  } catch (err) {
    showError($('signupMsg'), err.message);
  } finally {
    idle(button, 'Create account');
  }
});

$('logoutBtn').addEventListener('click', async () => {
  const button = $('logoutBtn');
  busy(button, 'Logging out…');
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {
    /* log out locally regardless */
  }
  await loadSession();
  idle(button, 'Log out');
});

$('manageBillingBtn').addEventListener('click', async () => {
  const button = $('manageBillingBtn');
  busy(button, 'Opening…');
  try {
    const data = await api('/api/billing-portal', { method: 'POST' });
    window.location.href = data.url;
  } catch (err) {
    idle(button, 'Manage billing');
    alert(err.message);
  }
});

// -------------------------------------------------------- return from Stripe
async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid');
  const sessionId = params.get('session_id');
  const pendingId = sessionStorage.getItem('gw_pending_order');
  if (!paid) return;

  window.history.replaceState({}, '', window.location.pathname);

  if (paid === 'false') {
    sessionStorage.removeItem('gw_pending_order');
    const entry = pendingId ? findEntry(pendingId) : null;
    if (entry) openEntry(entry);
    return;
  }

  if (!sessionId) return;

  const button = $('unlockBtn');
  busy(button, 'Confirming payment…');
  try {
    const data = await api('/api/verify-payment', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });

    if (!data.paid) {
      showError(resultError, "We couldn't confirm that payment. If you were charged, email hello@grantwright.co.");
      return;
    }

    await loadSession();

    if (data.order) {
      const entry = upsertEntry({
        id: data.order.id,
        orgName: data.order.orgName,
        funderName: data.order.funderName,
        createdAt: data.order.createdAt || Date.now(),
        draft: data.order.draft,
        referencedPoints: data.order.referencedPoints || [],
        unlocked: true
      });
      openEntry(findEntry(entry.id));
      if (data.upgradeError) {
        showError(resultError, 'Payment went through, but the full rewrite failed. Tap "Write the full version" to retry.');
      }
    } else {
      switchTab('new');
      showFormScreen();
    }
    await syncServerDrafts();
  } catch (err) {
    showError(resultError, err.message);
  } finally {
    idle(button, 'Unlock full drafts');
    sessionStorage.removeItem('gw_pending_order');
  }
}

// ---------------------------------------------------------------- boot-up
(async function init() {
  state.plans = [
    { id: 'monthly', label: 'Monthly', price: '$49', suffix: '/mo', mode: 'subscription' },
    { id: 'lifetime', label: 'Lifetime', price: '$399', suffix: ' once', mode: 'payment' }
  ];
  renderPlanPicker();
  renderPricingCards();
  renderHistory();

  await loadSession();
  await syncServerDrafts();
  await handlePaymentReturn();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
