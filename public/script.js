/* Grantwright — client logic.
   Free previews come from Gemini; paid drafts come from Claude. */

const $ = (id) => document.getElementById(id);

const state = {
  user: null,
  member: false,
  plan: null,
  plans: [],
  selected: 'single',
  activeId: null,
  freeLimit: 3
};

const GUIDES = [
  { slug: 'how-to-write-a-grant-application', title: 'How to write a grant application', blurb: 'The seven sections nearly every application asks for, and what reviewers are actually looking for in each.' },
  { slug: 'general-operating-support-grants', title: 'Winning general operating support', blurb: 'Unrestricted money is judged on stability and governance, not program metrics. How to make that case.' },
  { slug: 'grant-writing-without-outcomes-data', title: 'Grant writing without outcomes data', blurb: 'What to write when you have no evaluation budget and no clean numbers to point at.' },
  { slug: 'reading-a-funder-rfp', title: 'How to read a funder RFP', blurb: 'The signals in a guidelines page that tell you whether you are even eligible before you spend a weekend.' },
  { slug: 'capacity-building-grants', title: 'Capacity building grant requests', blurb: 'Why growth framing loses and constraint framing wins.' },
  { slug: 'grant-budget-narrative', title: 'Writing the budget narrative', blurb: 'The section most small nonprofits rush, and the one finance reviewers read first.' }
];

// ---------------------------------------------------------------- helpers
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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

function showAlert(el, message) {
  el.textContent = message;
  el.classList.add('visible');
}
function hideAlert(el) {
  el.classList.remove('visible');
}
function busy(btn, label) {
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${esc(label)}`;
}
function idle(btn, label) {
  btn.disabled = false;
  btn.textContent = label || btn.dataset.label || 'Continue';
}

// ------------------------------------------------------------ local drafts
const KEY = 'grantwright_drafts_v3';

function loadDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveDrafts(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-100)));
  } catch {
    /* storage blocked — the server copy is authoritative */
  }
}
function upsert(entry) {
  const list = loadDrafts();
  const i = list.findIndex((e) => e.id === entry.id);
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.push(entry);
  saveDrafts(list);
  renderDrafts();
  return list.find((e) => e.id === entry.id);
}
const findDraft = (id) => loadDrafts().find((e) => e.id === id) || null;

// ---------------------------------------------------------------- pricing
function renderPlanPicker() {
  const picker = $('planPicker');
  picker.innerHTML = '';
  picker.style.gridTemplateColumns = `repeat(${Math.min(state.plans.length, 3)},1fr)`;
  state.plans.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'plan-option' + (p.id === state.selected ? ' selected' : '');
    b.innerHTML = `<span class="plan-label">${esc(p.label)}</span>
      <span class="plan-value">${esc(p.price)}<span>${esc(p.suffix)}</span></span>`;
    b.addEventListener('click', () => {
      state.selected = p.id;
      renderPlanPicker();
    });
    picker.appendChild(b);
  });
}

const PLAN_COPY = {
  single: ['One complete application narrative, start to finish', 'Edit, copy and download it', 'No subscription, nothing to cancel', 'Best if you apply a few times a year'],
  monthly: ['Unlimited full drafts', 'Rewrite any earlier preview free', 'Drafts synced to your account', 'Cancel any time']
};

function renderPricingCards() {
  const wrap = $('pricingCards');
  wrap.innerHTML = '';
  wrap.style.gridTemplateColumns = `repeat(${Math.min(state.plans.length, 3)},1fr)`;
  state.plans.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'card price-card' + (p.id === 'monthly' ? ' featured' : '');
    const bullets = (PLAN_COPY[p.id] || []).map((t) => `<li><span class="check">✓</span>${esc(t)}</li>`).join('');
    card.innerHTML = `
      <h3>${esc(p.label)}</h3>
      <div class="price-amount">${esc(p.price)}<span>${esc(p.suffix)}</span></div>
      <ul>${bullets}</ul>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = p.id === 'monthly' ? 'btn btn-primary' : 'btn btn-ghost';
    btn.textContent = state.member ? 'You have access' : 'Choose ' + p.label;
    btn.disabled = state.member;
    btn.addEventListener('click', () => {
      state.selected = p.id;
      renderPlanPicker();
      if (state.activeId) startCheckout(btn);
      else {
        document.getElementById('start').scrollIntoView();
        $('orgName').focus();
      }
    });
    card.appendChild(btn);
    wrap.appendChild(card);
  });
}

function renderGuides() {
  $('guideGrid').innerHTML = GUIDES.slice(0, 6)
    .map((g) => `<a class="guide-card" href="/guides/${g.slug}.html"><h3>${esc(g.title)}</h3><p>${esc(g.blurb)}</p></a>`)
    .join('');
  $('footerGuides').innerHTML = GUIDES.slice(0, 4)
    .map((g) => `<li><a href="/guides/${g.slug}.html">${esc(g.title)}</a></li>`)
    .join('');
}

// ------------------------------------------------------------------- form
const form = $('draftForm');
const rfp = $('rfpText');

$('toggleDetails').addEventListener('click', () => {
  const group = $('detailsGroup');
  const wasHidden = group.hasAttribute('hidden');
  group.toggleAttribute('hidden', !wasHidden);
  $('toggleDetails').textContent = wasHidden ? 'Hide program and org details' : 'Add program and org details (improves accuracy)';
});

const DETECT = [
  { kw: ['general operating', 'unrestricted', 'operating support'], value: 'General operating support' },
  { kw: ['capacity building', 'capacity-building', 'organizational capacity'], value: 'Capacity building' },
  { kw: ['capital campaign', 'equipment', 'renovation', 'construction'], value: 'Capital or equipment' },
  { kw: ['program support', 'project support', 'program grant'], value: 'Program or project support' }
];

rfp.addEventListener('input', () => {
  const text = rfp.value.trim().toLowerCase();
  const badge = $('detectBadge');
  if (text.length < 40) return hideAlert(badge);
  const hit = DETECT.find((d) => d.kw.some((k) => text.includes(k)));
  if (!hit) return hideAlert(badge);
  showAlert(badge, `Detected request type: ${hit.value}. Change it below if that's wrong.`);
  $('requestType').value = hit.value;
  if ($('detailsGroup').hasAttribute('hidden')) $('toggleDetails').click();
});

$('rfpFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1_000_000) return showAlert($('formError'), 'That file is too large. Paste the relevant sections instead.');
  rfp.value = (await file.text()).trim().slice(0, 24000);
  rfp.dispatchEvent(new Event('input'));
  $('uploadLabel').textContent = `Loaded: ${file.name}`;
});

// -------------------------------------------------------------- rendering
const output = $('draftOutput');

function renderPreview(entry) {
  output.textContent = entry.draft;
  output.contentEditable = 'false';
  $('docFade').hidden = false;
  $('docLabel').textContent = 'Draft preview';
  $('docChip').textContent = 'Preview';
  $('docChip').className = 'chip';
  $('lockedFoot').hidden = false;
  $('unlockedFoot').hidden = true;
  $('editHint').hidden = true;
  $('unlockBtn').textContent = state.member ? 'Write the full version' : 'Unlock this draft';
  $('planPicker').hidden = state.member;
  renderPlanPicker();
}

function renderFull(entry) {
  output.textContent = entry.draft;
  output.contentEditable = 'true';
  $('docFade').hidden = true;
  $('docLabel').textContent = 'Full draft — editable';
  $('docChip').textContent = 'Full';
  $('docChip').className = 'chip chip-blue';
  $('lockedFoot').hidden = true;
  $('unlockedFoot').hidden = false;
  $('unlockedFoot').style.display = 'flex';
  $('editHint').hidden = false;
}

function openDraft(entry) {
  state.activeId = entry.id;
  $('emptyState').hidden = true;
  $('draftCard').hidden = false;
  if (entry.unlocked) renderFull(entry);
  else renderPreview(entry);

  const points = entry.referencedPoints || [];
  $('contextCard').hidden = !points.length;
  $('contextList').innerHTML = points.map((p) => `<li style="margin-bottom:8px">${esc(p)}</li>`).join('');
  $('draftCard').scrollIntoView({ block: 'nearest' });
}

output.addEventListener('input', () => {
  if (output.contentEditable === 'true' && state.activeId) upsert({ id: state.activeId, draft: output.textContent });
});

// --------------------------------------------------------------- history
function renderDrafts() {
  const list = loadDrafts().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const box = $('draftsList');
  box.innerHTML = '';
  $('draftsEmpty').hidden = list.length > 0;

  list.forEach((entry) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'list-row';
    row.innerHTML = `<span>
        <span class="list-row-title">${esc(entry.orgName || 'Draft')} → ${esc(entry.funderName || '')}</span><br>
        <span class="list-row-meta">${new Date(entry.createdAt || Date.now()).toLocaleDateString()}</span>
      </span>
      <span class="chip ${entry.unlocked ? 'chip-blue' : ''}">${entry.unlocked ? 'Full' : 'Preview'}</span>`;
    row.addEventListener('click', () => {
      openDraft(findDraft(entry.id) || entry);
      document.getElementById('start').scrollIntoView();
    });
    box.appendChild(row);
  });
}

async function syncDrafts() {
  if (!state.user) return;
  try {
    const data = await api('/api/my-drafts', { method: 'POST' });
    (data.drafts || []).forEach((d) =>
      upsert({
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
    /* offline or logged out */
  }
}

// ------------------------------------------------------------- generation
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert($('formError'));

  const payload = {
    orgName: $('orgName').value.trim(),
    orgEmail: $('orgEmail').value.trim(),
    funderName: $('funderName').value.trim(),
    rfpText: rfp.value.trim(),
    orgMission: $('orgMission').value.trim(),
    requestType: $('requestType').value,
    progName: $('progName').value.trim(),
    amount: $('amount').value.trim(),
    deadline: $('deadline').value,
    outcomes: $('outcomes').value.trim()
  };

  if (!payload.orgName || !payload.orgEmail || !payload.funderName || !payload.rfpText) {
    return showAlert($('formError'), "Fill in your organization name, email, the funder's name, and their guidelines.");
  }

  const btn = $('generateBtn');
  busy(btn, 'Writing your draft…');
  try {
    const data = await api('/api/generate-draft', { method: 'POST', body: JSON.stringify(payload) });
    const entry = upsert({
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
      $('quotaHint').textContent = `${data.freePreviewsRemaining} free preview${data.freePreviewsRemaining === 1 ? '' : 's'} left for this email.`;
    }
    openDraft(entry);
  } catch (err) {
    showAlert($('formError'), err.message);
    if (err.data?.limitReached) document.getElementById('pricing').scrollIntoView();
  } finally {
    idle(btn, 'Generate my draft');
  }
});

// ---------------------------------------------------------------- payment
async function startCheckout(btn) {
  const label = btn.textContent;
  busy(btn, 'Opening checkout…');
  try {
    const entry = state.activeId ? findDraft(state.activeId) : null;
    const data = await api('/api/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({
        plan: state.selected,
        orderId: state.activeId || '',
        email: entry?.orgEmail || $('orgEmail').value.trim() || state.user || ''
      })
    });
    window.location.href = data.url;
  } catch (err) {
    idle(btn, label);
    showAlert($('resultError'), err.message);
  }
}

$('unlockBtn').addEventListener('click', async () => {
  const btn = $('unlockBtn');
  hideAlert($('resultError'));

  if (state.member && state.activeId) {
    busy(btn, 'Writing the full draft…');
    try {
      const data = await api('/api/upgrade-draft', { method: 'POST', body: JSON.stringify({ orderId: state.activeId }) });
      upsert({ id: data.order.id, draft: data.order.draft, unlocked: true });
      renderFull(findDraft(data.order.id));
    } catch (err) {
      showAlert($('resultError'), err.message);
    } finally {
      idle(btn, 'Write the full version');
    }
    return;
  }
  startCheckout(btn);
});

$('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.textContent);
    $('copyBtn').textContent = 'Copied';
    setTimeout(() => ($('copyBtn').textContent = 'Copy draft'), 1500);
  } catch {
    showAlert($('resultError'), 'Your browser blocked the clipboard. Select the text and copy it manually.');
  }
});

$('downloadBtn').addEventListener('click', () => {
  const entry = findDraft(state.activeId);
  const name = entry ? `${entry.orgName}-${entry.funderName}` : 'grant-draft';
  const url = URL.createObjectURL(new Blob([output.textContent], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ------------------------------------------------------------------- auth
document.querySelectorAll('.tab[data-panel]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-panel]').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('#account .panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab.dataset.panel));
  });
});
$('navAccount').addEventListener('click', () => $('tabAuth').click());

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
  state.member = !!data.member;
  state.plan = data.plan || null;
  if (Array.isArray(data.plans) && data.plans.length) state.plans = data.plans;
  if (data.freePreviewLimit) {
    state.freeLimit = data.freePreviewLimit;
    $('quotaValue').textContent = `${data.freePreviewLimit} per email`;
  }

  $('authCard').hidden = !!state.user;
  $('loggedInCard').hidden = !state.user;
  if (state.user) {
    $('loggedInEmail').textContent = state.user;
    $('planValue').textContent = state.member ? `Full access${state.plan ? ` (${state.plan})` : ''}` : 'Previews only';
    $('billingBtn').hidden = !(state.member && state.plan === 'monthly');
    if (!$('orgEmail').value) $('orgEmail').value = state.user;
  }

  if (!state.plans.some((p) => p.id === state.selected)) state.selected = state.plans[0]?.id || 'single';
  renderPricingCards();
  renderPlanPicker();
}

async function loadSession() {
  try {
    applySession(await api('/api/me'));
  } catch {
    applySession({ plans: state.plans });
  }
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert($('loginMsg'));
  const btn = $('loginBtn');
  busy(btn, 'Logging in…');
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPassword').value }) });
    await loadSession();
    await syncDrafts();
  } catch (err) {
    showAlert($('loginMsg'), err.message);
  } finally {
    idle(btn, 'Log in');
  }
});

$('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert($('signupMsg'));
  const btn = $('signupBtn');
  busy(btn, 'Creating account…');
  try {
    await api('/api/signup', { method: 'POST', body: JSON.stringify({ email: $('signupEmail').value.trim(), password: $('signupPassword').value }) });
    await loadSession();
    await syncDrafts();
  } catch (err) {
    showAlert($('signupMsg'), err.message);
  } finally {
    idle(btn, 'Create account');
  }
});

$('logoutBtn').addEventListener('click', async () => {
  const btn = $('logoutBtn');
  busy(btn, 'Logging out…');
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {
    /* clear locally regardless */
  }
  await loadSession();
  idle(btn, 'Log out');
});

$('billingBtn').addEventListener('click', async () => {
  const btn = $('billingBtn');
  busy(btn, 'Opening…');
  try {
    const data = await api('/api/billing-portal', { method: 'POST' });
    window.location.href = data.url;
  } catch (err) {
    idle(btn, 'Manage billing');
    showAlert($('resultError'), err.message);
  }
});

// ------------------------------------------------------- return from Stripe
async function handleReturn() {
  const params = new URLSearchParams(window.location.search);
  const paid = params.get('paid');
  const sessionId = params.get('session_id');
  if (!paid) return;

  window.history.replaceState({}, '', window.location.pathname);
  if (paid === 'false' || !sessionId) return;

  const btn = $('unlockBtn');
  busy(btn, 'Confirming payment…');
  try {
    const data = await api('/api/verify-payment', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
    if (!data.paid) {
      return showAlert($('resultError'), "We couldn't confirm that payment. If you were charged, email dustindjm@outlook.com.");
    }
    await loadSession();
    if (data.order) {
      upsert({
        id: data.order.id,
        orgName: data.order.orgName,
        funderName: data.order.funderName,
        createdAt: data.order.createdAt || Date.now(),
        draft: data.order.draft,
        referencedPoints: data.order.referencedPoints || [],
        unlocked: true
      });
      openDraft(findDraft(data.order.id));
      document.getElementById('start').scrollIntoView();
      if (data.upgradeError) showAlert($('resultError'), 'Payment went through, but the rewrite failed. Tap "Write the full version" to retry.');
    }
    await syncDrafts();
  } catch (err) {
    showAlert($('resultError'), err.message);
  } finally {
    idle(btn, 'Unlock this draft');
  }
}

// ------------------------------------------------- resume from email link
async function openFromLink() {
  const id = new URLSearchParams(window.location.search).get('draft');
  if (!id) return;
  window.history.replaceState({}, '', window.location.pathname);
  try {
    const local = findDraft(id);
    const { order } = await api(`/api/draft?id=${encodeURIComponent(id)}`);
    const entry = upsert({
      id: order.id,
      orgName: order.orgName,
      funderName: order.funderName,
      createdAt: order.createdAt,
      draft: local?.unlocked ? local.draft : order.draft,
      referencedPoints: order.referencedPoints || [],
      unlocked: !!order.unlocked || !!local?.unlocked
    });
    openDraft(entry);
    document.getElementById('start').scrollIntoView();
  } catch {
    /* expired or deleted — land on the form as usual */
  }
}

// ------------------------------------------------------------------- boot
(async function init() {
  state.plans = [
    { id: 'single', label: 'Single draft', price: '$79', suffix: ' once', mode: 'payment' },
    { id: 'monthly', label: 'Monthly', price: '$49', suffix: '/mo', mode: 'subscription' }
  ];
  renderGuides();
  renderPricingCards();
  renderPlanPicker();
  renderDrafts();

  await loadSession();
  await syncDrafts();
  await handleReturn();
  await openFromLink();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
