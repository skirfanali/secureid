/**
 * Core app shell: API client, screen router, and UI wiring that's shared
 * across registration and login (password toggles, step indicator, back
 * button, navigation links marked with [data-nav]).
 */

// Backend base URL. Defaults to a same-origin relative path, which is
// correct when the backend serves the frontend directly (the simple,
// recommended way to run this locally — see README "Quick start"). If you
// run the frontend on its own dev server instead, set
// `window.SECUREID_API_BASE_URL` in a <script> tag before this file loads.
const API_BASE_URL = window.SECUREID_API_BASE_URL || '/api';

const Api = (() => {
  async function request(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // send/receive the HttpOnly session cookie
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }

  return {
    register: (payload) => request('/register', { method: 'POST', body: payload }),
    sendEmailOtp: (userId) => request('/send-email-otp', { method: 'POST', body: { userId } }),
    verifyEmailOtp: (payload) => request('/verify-email-otp', { method: 'POST', body: payload }),
    sendSmsOtp: (userId) => request('/send-sms-otp', { method: 'POST', body: { userId } }),
    verifySmsOtp: (payload) => request('/verify-sms-otp', { method: 'POST', body: payload }),
    mfaSelect: (payload) => request('/mfa/select', { method: 'POST', body: payload }),
    totpInit: (userId) => request('/mfa/totp/init', { method: 'POST', body: { userId } }),
    totpVerify: (payload) => request('/mfa/totp/verify', { method: 'POST', body: payload }),

    login: (payload) => request('/login', { method: 'POST', body: payload }),
    sendLoginOtp: (payload) => request('/send-login-otp', { method: 'POST', body: payload }),
    verifyLoginOtp: (payload) => request('/verify-login-otp', { method: 'POST', body: payload }),
    verifyLoginTotp: (payload) => request('/verify-login-totp', { method: 'POST', body: payload }),

    me: () => request('/me'),
    logout: () => request('/logout', { method: 'POST' }),
    getToken: () => request('/token', { method: 'POST' }),
    protectedResource: (token) =>
      fetch(`${API_BASE_URL}/protected`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => null) })),
  };
})();

/* ---------------------------------------------------------------- */
/* Screen router                                                      */
/* ---------------------------------------------------------------- */
const Router = (() => {
  const history = [];
  let current = null;

  const REGISTRATION_STEPS = {
    'register-details': 1,
    'email-otp': 2,
    'mobile-otp': 3,
    'mfa-setup': 4,
    'authenticator-setup': 4,
    'mfa-verification': 4,
    'registration-success': 5,
  };

  const REGISTRATION_SCREENS = new Set(Object.keys(REGISTRATION_STEPS));

  function show(screenName, { pushHistory = true } = {}) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('is-active'));
    const target = document.querySelector(`[data-screen="${screenName}"]`);
    if (!target) {
      // eslint-disable-next-line no-console
      console.error(`Unknown screen: ${screenName}`);
      return;
    }
    target.classList.add('is-active');

    if (pushHistory) history.push(screenName);
    current = screenName;

    updateStepIndicator(screenName);
    updateBackButton(screenName);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function updateStepIndicator(screenName) {
    const indicator = document.getElementById('stepIndicator');
    if (REGISTRATION_SCREENS.has(screenName)) {
      indicator.hidden = false;
      const activeStep = REGISTRATION_STEPS[screenName];
      indicator.querySelectorAll('.step-dot').forEach((dot) => {
        const step = Number(dot.dataset.step);
        dot.classList.toggle('is-active', step === activeStep);
        dot.classList.toggle('is-done', step < activeStep);
      });
    } else {
      indicator.hidden = true;
    }
  }

  function updateBackButton(screenName) {
    const btn = document.getElementById('globalBackBtn');
    const noBackScreens = new Set(['register-details', 'login-default', 'registration-success', 'dashboard']);
    btn.hidden = noBackScreens.has(screenName);
  }

  function back() {
    if (history.length > 1) {
      history.pop(); // discard current
      const prev = history.pop(); // this becomes current again via show()
      show(prev);
    }
  }

  function current_() {
    return current;
  }

  return { show, back, current: current_ };
})();

/* ---------------------------------------------------------------- */
/* Shared UI wiring                                                   */
/* ---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // [data-nav] links navigate to a screen and reset that screen's local state
  // via a custom event, so registration.js/login.js can hook in.
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const screen = el.getAttribute('data-nav');
      document.dispatchEvent(new CustomEvent('screen:enter', { detail: { screen } }));
      Router.show(screen);
    });
  });

  document.querySelectorAll('[data-nav-back]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const screen = el.getAttribute('data-nav-back');
      document.dispatchEvent(new CustomEvent('screen:enter', { detail: { screen } }));
      Router.show(screen);
    });
  });

  document.getElementById('globalBackBtn').addEventListener('click', () => Router.back());

  // Password show/hide toggles
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-password'));
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.classList.toggle('is-visible', isPassword);
      btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });

  // Kick off the app on the login screen (auth check first, in case a
  // session cookie already exists — e.g. the user refreshed the page).
  bootstrap();
});

async function bootstrap() {
  try {
    const { ok, data } = await Api.me();
    if (ok && data && data.authenticated) {
      document.dispatchEvent(new CustomEvent('dashboard:load', { detail: { user: data.user } }));
      Router.show('dashboard');
      return;
    }
  } catch (err) {
    // Backend unreachable (not started yet, wrong port, network hiccup, etc).
    // Never leave the page blank — fall through to the login screen and
    // surface a clear, dismissible hint instead of a silent freeze.
    // eslint-disable-next-line no-console
    console.error('Could not reach the backend at ' + API_BASE_URL, err);
    showBackendUnreachableBanner();
  }
  Router.show('login-default');
}

/**
 * Shows the OTP code inline on an OTP screen — only ever populated when the
 * backend's DEBUG_EXPOSE_OTP dev flag is on (see backend/.env.example).
 * In normal/production mode the backend never sends `otp` in the response,
 * so this stays hidden and the person checks the server log instead.
 */
function showDevOtpHint(groupKey, otp) {
  const el = document.querySelector(`[data-dev-otp-hint="${groupKey}"]`);
  if (!el) return;
  if (otp) {
    el.hidden = false;
    el.innerHTML = `Dev mode — code: <strong>${otp}</strong>`;
  } else {
    el.hidden = true;
    el.textContent = '';
  }
}

function showBackendUnreachableBanner() {
  if (document.getElementById('backendOfflineBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'backendOfflineBanner';
  banner.className = 'backend-offline-banner';
  banner.innerHTML = `Can't reach the backend at <code>${API_BASE_URL}</code>. Make sure it's running (<code>cd backend && npm start</code>), then <button type="button" id="retryBackendBtn">retry</button>.`;
  document.body.prepend(banner);
  document.getElementById('retryBackendBtn').addEventListener('click', () => {
    banner.remove();
    bootstrap();
  });
}
