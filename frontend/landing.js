// ─────────────────────────────────────────────────────────────────
//  Aligno.ai Landing Page — landing.js
//  Auth modal (login + 4-step signup)
//  Uses backend API when available, falls back to localStorage.
// ─────────────────────────────────────────────────────────────────

// ─── Modal open / close ──────────────────────────────────────────
const overlay      = document.getElementById('modal-overlay');
const panelLogin   = document.getElementById('panel-login');
const panelSignup  = document.getElementById('panel-signup');
const modalClose   = document.getElementById('modal-close');

function openModal(panel) {
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (panel === 'login') {
    panelLogin.classList.remove('hidden');
    panelSignup.classList.add('hidden');
  } else {
    panelSignup.classList.remove('hidden');
    panelLogin.classList.add('hidden');
    resetSignupForm();
  }
}

function closeModal() {
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// Open triggers
['nav-login'].forEach(id => document.getElementById(id).addEventListener('click', () => openModal('login')));
['nav-signup','hero-signup','cta-signup'].forEach(id => document.getElementById(id).addEventListener('click', () => openModal('signup')));
document.getElementById('hero-demo').addEventListener('click', () => openModal('signup'));

// Switch between panels
document.getElementById('switch-to-signup').addEventListener('click', () => openModal('signup'));
document.getElementById('switch-to-login').addEventListener('click',  () => openModal('login'));

// ─── Password toggle visibility ──────────────────────────────────
document.querySelectorAll('.toggle-pw').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    input.type      = isHidden ? 'text' : 'password';
    btn.textContent = isHidden ? 'Hide' : 'Show';
  });
});

// ─── Password strength meter ─────────────────────────────────────
const pwInput  = document.getElementById('su-password');
const pwFill   = document.getElementById('pw-bar-fill');
const pwLabel  = document.getElementById('pw-label');

pwInput.addEventListener('input', () => {
  const v = pwInput.value;
  let score = 0;
  if (v.length >= 8)             score++;
  if (/[A-Z]/.test(v))           score++;
  if (/[0-9]/.test(v))           score++;
  if (/[^A-Za-z0-9]/.test(v))    score++;

  const levels = [
    { w: '0%',   color: 'transparent', label: '' },
    { w: '25%',  color: '#ef4444',     label: 'Weak' },
    { w: '50%',  color: '#f97316',     label: 'Fair' },
    { w: '75%',  color: '#eab308',     label: 'Good' },
    { w: '100%', color: '#22c55e',     label: 'Strong' },
  ];
  const lvl = levels[score] || levels[0];
  pwFill.style.width      = lvl.w;
  pwFill.style.background = lvl.color;
  pwLabel.textContent     = lvl.label;
  pwLabel.style.color     = lvl.color;
});

// ─── Fitness level card selection ────────────────────────────────
document.querySelectorAll('.level-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.level-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
  });
});

// ─── Days per week picker ─────────────────────────────────────────
let selectedDays = null;
document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDays = parseInt(btn.dataset.val, 10);
  });
});

// ─── Has-injury toggle ────────────────────────────────────────────
const injuryDetails = document.getElementById('injury-details');
document.querySelectorAll('input[name="has-injury"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.value === 'yes') {
      injuryDetails.classList.remove('hidden');
    } else {
      injuryDetails.classList.add('hidden');
    }
  });
});

// ─── Body-part multi-select ───────────────────────────────────────
const selectedParts = new Set();
document.querySelectorAll('.bp-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const part = btn.dataset.part;
    if (selectedParts.has(part)) {
      selectedParts.delete(part);
      btn.classList.remove('active');
    } else {
      selectedParts.add(part);
      btn.classList.add('active');
    }
  });
});

// ─── Multi-step signup state ──────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 4;

const steps     = () => document.querySelectorAll('.signup-step');
const stepDots  = () => document.querySelectorAll('.step-dot');
const stepLines = () => document.querySelectorAll('.step-line');
const btnBack   = document.getElementById('btn-back');
const btnNext   = document.getElementById('btn-next');

function goToStep(n) {
  // Hide all steps
  steps().forEach((s, i) => {
    s.classList.toggle('hidden', i + 1 !== n);
  });

  // Update dots
  stepDots().forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 < n)  dot.classList.add('done');
    if (i + 1 === n) dot.classList.add('active');
    // Replace number with checkmark if done
    dot.innerHTML = i + 1 < n ? '✓' : `<span>${i + 1}</span>`;
  });

  // Update lines
  stepLines().forEach((line, i) => {
    line.classList.toggle('done', i + 1 < n);
  });

  btnBack.style.visibility = n === 1 ? 'hidden' : 'visible';
  btnNext.textContent      = n === TOTAL_STEPS ? 'Create Account 🎉' : 'Continue →';
  currentStep = n;
}

function resetSignupForm() {
  currentStep = 1;
  goToStep(1);
  // Clear field errors
  document.querySelectorAll('.field-err').forEach(e => e.textContent = '');
  document.querySelectorAll('.field input, .field select, .field textarea').forEach(el => el.classList.remove('error'));
  // Reset password strength
  pwFill.style.width = '0%';
  pwLabel.textContent = '';
  // Reset injury
  injuryDetails.classList.add('hidden');
  document.querySelector('input[name="has-injury"][value="no"]').checked = true;
  selectedParts.clear();
  document.querySelectorAll('.bp-btn').forEach(b => b.classList.remove('active'));
  // Reset level
  document.querySelectorAll('.level-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('input[name="fitness-level"]').forEach(r => r.checked = false);
  // Reset days
  selectedDays = null;
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
}

// ─── Step validation ──────────────────────────────────────────────
function clearErr(id)       { const e = document.getElementById(id); if (e) e.textContent = ''; }
function showErr(id, msg)   { const e = document.getElementById(id); if (e) { e.textContent = msg; } }
function markError(id)      { const el = document.getElementById(id); if (el) el.classList.add('error'); }
function clearError(id)     { const el = document.getElementById(id); if (el) el.classList.remove('error'); }

function validateStep(n) {
  let valid = true;

  if (n === 1) {
    // Name
    const name = document.getElementById('su-name').value.trim();
    clearErr('err-su-name'); clearError('su-name');
    if (!name) { showErr('err-su-name', 'Name is required'); markError('su-name'); valid = false; }

    // Email
    const email = document.getElementById('su-email').value.trim();
    clearErr('err-su-email'); clearError('su-email');
    if (!email) { showErr('err-su-email', 'Email is required'); markError('su-email'); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr('err-su-email', 'Enter a valid email'); markError('su-email'); valid = false; }
    else if (!window.API_ONLINE && emailExists(email)) { showErr('err-su-email', 'An account with this email already exists'); markError('su-email'); valid = false; }

    // Password
    const pw = document.getElementById('su-password').value;
    clearErr('err-su-password'); clearError('su-password');
    if (!pw) { showErr('err-su-password', 'Password is required'); markError('su-password'); valid = false; }
    else if (pw.length < 8) { showErr('err-su-password', 'Password must be at least 8 characters'); markError('su-password'); valid = false; }
  }

  if (n === 2) {
    const age = document.getElementById('su-age').value;
    clearErr('err-su-age'); clearError('su-age');
    if (!age || age < 10 || age > 100) { showErr('err-su-age', 'Enter a valid age (10–100)'); markError('su-age'); valid = false; }

    const sex = document.getElementById('su-sex').value;
    clearErr('err-su-sex'); clearError('su-sex');
    if (!sex) { showErr('err-su-sex', 'Please select'); markError('su-sex'); valid = false; }

    const h = document.getElementById('su-height').value;
    clearErr('err-su-height'); clearError('su-height');
    if (!h || h < 50 || h > 250) { showErr('err-su-height', 'Enter height in cm (50–250)'); markError('su-height'); valid = false; }

    const w = document.getElementById('su-weight').value;
    clearErr('err-su-weight'); clearError('su-weight');
    if (!w || w < 20 || w > 300) { showErr('err-su-weight', 'Enter weight in kg (20–300)'); markError('su-weight'); valid = false; }

    const goal = document.getElementById('su-goal').value;
    clearErr('err-su-goal'); clearError('su-goal');
    if (!goal) { showErr('err-su-goal', 'Please select a goal'); markError('su-goal'); valid = false; }
  }

  if (n === 3) {
    const level = document.querySelector('input[name="fitness-level"]:checked');
    clearErr('err-su-level');
    if (!level) { showErr('err-su-level', 'Please select your fitness level'); valid = false; }

    clearErr('err-su-days');
    if (!selectedDays) { showErr('err-su-days', 'Please select how many days per week'); valid = false; }
  }

  if (n === 4) {
    const hasInjury = document.querySelector('input[name="has-injury"]:checked')?.value === 'yes';
    if (hasInjury) {
      clearErr('err-body-parts');
      if (selectedParts.size === 0) {
        showErr('err-body-parts', 'Please select at least one affected body part');
        valid = false;
      }
    }
  }

  return valid;
}

// ─── Step navigation ──────────────────────────────────────────────
btnNext.addEventListener('click', () => {
  if (!validateStep(currentStep)) return;

  if (currentStep < TOTAL_STEPS) {
    goToStep(currentStep + 1);
  } else {
    // Final step — create account
    createAccount();
  }
});

btnBack.addEventListener('click', () => {
  if (currentStep > 1) goToStep(currentStep - 1);
});

// ─── localStorage helpers ─────────────────────────────────────────
function getUsers()              { return JSON.parse(localStorage.getItem('aligno_users') || '[]'); }
function saveUsers(users)        { localStorage.setItem('aligno_users', JSON.stringify(users)); }
function setCurrentUser(user)    { localStorage.setItem('aligno_current', JSON.stringify(user)); }
function getCurrentUser()        { return JSON.parse(localStorage.getItem('aligno_current') || 'null'); }
function emailExists(email)      { return getUsers().some(u => u.email.toLowerCase() === email.toLowerCase()); }

// ─── Create Account ───────────────────────────────────────────────
async function createAccount() {
  const hasInjury  = document.querySelector('input[name="has-injury"]:checked')?.value === 'yes';
  const injuryType = document.getElementById('su-injury-type')?.value || '';
  const injurySev  = document.querySelector('input[name="injury-severity"]:checked')?.value || '';
  const injuryNotes = document.getElementById('su-injury-notes')?.value.trim() || '';

  const name     = document.getElementById('su-name').value.trim();
  const email    = document.getElementById('su-email').value.trim().toLowerCase();
  const password = document.getElementById('su-password').value;
  const age      = parseInt(document.getElementById('su-age').value, 10);
  const level    = document.querySelector('input[name="fitness-level"]:checked').value;
  const goal     = document.getElementById('su-goal').value;
  const injuries = hasInjury ? Array.from(selectedParts) : [];

  // Disable the button to prevent double-submit
  btnNext.disabled = true;
  btnNext.textContent = 'Creating…';

  if (window.API_ONLINE) {
    try {
      const user = await AuthAPI.register({
        name, email, password, age,
        fitnessLevel: level,
        goals:        [goal],
        injuries,
      });
      showSuccessAndRedirect(user.name);
    } catch (err) {
      btnNext.disabled = false;
      btnNext.textContent = 'Create Account 🎉';
      const errBox = document.createElement('p');
      errBox.style.cssText = 'color:#ef4444;font-size:13px;margin-top:8px;text-align:center';
      errBox.textContent = err.data?.error || 'Registration failed. Please try again.';
      document.querySelector('.signup-step:not(.hidden)')?.appendChild(errBox);
    }
  } else {
    // localStorage fallback
    if (emailExists(email)) {
      btnNext.disabled = false;
      btnNext.textContent = 'Create Account 🎉';
      showErr('err-su-email', 'An account with this email already exists');
      markError('su-email');
      goToStep(1);
      return;
    }
    const user = {
      id:          Date.now().toString(),
      name, email,
      password:    btoa(password),
      age,
      sex:         document.getElementById('su-sex').value,
      height:      parseFloat(document.getElementById('su-height').value),
      weight:      parseFloat(document.getElementById('su-weight').value),
      goal,
      level,
      daysPerWeek: selectedDays,
      hasInjury,
      injury: hasInjury ? { bodyParts: Array.from(selectedParts), type: injuryType, severity: injurySev, notes: injuryNotes } : null,
      createdAt: new Date().toISOString(),
    };
    const users = getUsers();
    users.push(user);
    saveUsers(users);
    setCurrentUser(user);
    showSuccessAndRedirect(user.name);
  }
}

// ─── Success screen before redirect ──────────────────────────────
function showSuccessAndRedirect(name) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div style="text-align:center;padding:24px 0;">
      <div style="font-size:64px;margin-bottom:16px;">🎉</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">Welcome, ${escHtml(name)}!</h2>
      <p style="color:var(--muted);font-size:14px;margin-bottom:28px;">Your profile is set up. Taking you to your AI coach…</p>
      <div style="width:48px;height:48px;border:3px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto;"></div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;
  setTimeout(() => { window.location.href = 'index.html'; }, 2000);
}

// ─── Login form ───────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();

  const email    = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;
  const errBox   = document.getElementById('login-error');
  const submitBtn = document.querySelector('#form-login [type=submit]') ||
                    document.querySelector('#panel-login button[type=submit]');

  // Clear previous errors
  clearErr('err-login-email');   clearError('login-email');
  clearErr('err-login-password');clearError('login-password');
  errBox.classList.add('hidden');

  let valid = true;
  if (!email)    { showErr('err-login-email',    'Email is required'); markError('login-email'); valid = false; }
  if (!password) { showErr('err-login-password', 'Password is required'); markError('login-password'); valid = false; }
  if (!valid) return;

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in…'; }

  if (window.API_ONLINE) {
    try {
      const user = await AuthAPI.login(email, password);
      showLoginSuccessAndRedirect(user.name);
    } catch (err) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
      errBox.textContent = err.data?.error || 'Incorrect email or password. Please try again.';
      errBox.classList.remove('hidden');
    }
  } else {
    // localStorage fallback
    const users = getUsers();
    const user  = users.find(u => u.email === email && atob(u.password) === password);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
    if (!user) {
      errBox.textContent = 'Incorrect email or password. Please try again.';
      errBox.classList.remove('hidden');
      return;
    }
    setCurrentUser(user);
    showLoginSuccessAndRedirect(user.name);
  }
});

function showLoginSuccessAndRedirect(name) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div style="text-align:center;padding:24px 0;">
      <div style="font-size:64px;margin-bottom:16px;">👋</div>
      <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">Welcome back, ${escHtml(name)}!</h2>
      <p style="color:var(--muted);font-size:14px;margin-bottom:28px;">Loading your AI coach…</p>
      <div style="width:48px;height:48px;border:3px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto;"></div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;
  setTimeout(() => { window.location.href = 'index.html'; }, 1800);
}

// ─── Navbar scroll effect ─────────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.style.borderBottomColor = window.scrollY > 20 ? 'var(--border)' : 'transparent';
}, { passive: true });

// ─── Hamburger (mobile nav) ───────────────────────────────────────
document.getElementById('nav-hamburger').addEventListener('click', () => {
  const links = document.querySelector('.nav-links');
  links.style.display = links.style.display === 'flex' ? 'none' : 'flex';
  links.style.flexDirection = 'column';
  links.style.position = 'absolute';
  links.style.top = '64px';
  links.style.left = '0';
  links.style.right = '0';
  links.style.background = 'var(--surface)';
  links.style.padding = '16px 32px';
  links.style.borderBottom = '1px solid var(--border)';
  links.style.gap = '16px';
  links.style.zIndex = '99';
});

// ─── Redirect if already logged in ───────────────────────────────
(function checkAuth() {
  const user = getCurrentUser();
  if (user) {
    const actions = document.querySelector('.nav-actions');
    actions.innerHTML = `
      <span style="font-size:13px;color:var(--muted);">👋 ${escHtml(user.name.split(' ')[0])}</span>
      <button class="btn-ghost" onclick="window.location.href='dashboard.html'">📊 Dashboard</button>
      <button class="btn-primary" onclick="window.location.href='index.html'">🏋️ Open Coach</button>
      <button class="btn-ghost" id="btn-logout">Log Out</button>
    `;
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (window.API_ONLINE) AuthAPI.logout(); else localStorage.removeItem('aligno_current');
      location.reload();
    });
  }
})();

// ─── Utility ──────────────────────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
