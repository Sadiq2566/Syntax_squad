// ─────────────────────────────────────────────────────────────────
//  Aligno.ai — api.js
//  Thin API client wrapper.  Imported via <script src="api.js">
//  Falls back to localStorage when the server is unreachable,
//  so the app still works when run directly from the filesystem.
// ─────────────────────────────────────────────────────────────────

const API_BASE = '/api';

// ─── Token helpers ────────────────────────────────────────────────
function getToken()          { return localStorage.getItem('aligno_token'); }
function setToken(tok)       { localStorage.setItem('aligno_token', tok); }
function removeToken()       { localStorage.removeItem('aligno_token'); }

// ─── Core fetch wrapper ───────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'API error'), { status: res.status, data });
  return data;
}

// ─── Auth ─────────────────────────────────────────────────────────
const AuthAPI = {
  async register(payload) {
    const data = await apiFetch('/auth/register', { method: 'POST', body: payload });
    setToken(data.token);
    localStorage.setItem('aligno_current', JSON.stringify(data.user));
    return data.user;
  },

  async login(email, password) {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    localStorage.setItem('aligno_current', JSON.stringify(data.user));
    return data.user;
  },

  async me() {
    const data = await apiFetch('/auth/me');
    localStorage.setItem('aligno_current', JSON.stringify(data.user));
    return data.user;
  },

  logout() {
    removeToken();
    localStorage.removeItem('aligno_current');
  },
};

// ─── Sessions ─────────────────────────────────────────────────────
const SessionsAPI = {
  async save(session) {
    return apiFetch('/sessions', { method: 'POST', body: session });
  },

  async list(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const data = await apiFetch('/sessions' + (qs ? '?' + qs : ''));
    return data.sessions;
  },

  async stats(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch('/sessions/stats' + (qs ? '?' + qs : ''));
  },

  async remove(id) {
    return apiFetch(`/sessions/${id}`, { method: 'DELETE' });
  },
};

// ─── Server reachability check ────────────────────────────────────
// Sets window.API_ONLINE = true/false once on load.
// The rest of the app reads this to decide whether to use the API
// or fall back to localStorage transparently.
window.API_ONLINE = false;
window.apiReady = (async function probeServer() {
  try {
    await fetch(API_BASE + '/health', { signal: AbortSignal.timeout(2000) });
    window.API_ONLINE = true;
    console.log('✅ Backend connected →', API_BASE);
  } catch {
    console.warn('⚠️  Backend not reachable — using localStorage fallback');
  }
})();
