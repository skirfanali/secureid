/**
 * Login flow: login-default -> [login-choose-method] -> login-otp | login-totp
 * -> dashboard. Also wires the post-login dashboard (session /api/me demo,
 * JWT issuance + protected-endpoint demo, logout).
 */
(function () {
  const state = {
    userId: null,
    availableMethods: [],
    selectedMethod: null,
    otpChallengeId: null,
  };

  let loginOtpScreen = null;
  let loginTotpScreen = null;

  /* ---------------------------- Login form ---------------------------- */

  const form = document.getElementById('loginForm');
  const formErrorEl = document.getElementById('loginFormError');
  const submitBtn = document.getElementById('loginSubmitBtn');

  function showFormError(message) {
    formErrorEl.hidden = false;
    formErrorEl.textContent = message;
    document.getElementById('loginEmail').classList.add('has-error');
    document.getElementById('loginPassword').classList.add('has-error');
  }

  function clearFormError() {
    formErrorEl.hidden = true;
    formErrorEl.textContent = '';
    document.getElementById('loginEmail').classList.remove('has-error');
    document.getElementById('loginPassword').classList.remove('has-error');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError();

    const emailOrUsername = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    const { ok, data } = await Api.login({ emailOrUsername, password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Login';

    if (!ok) {
      if (data && data.code === 'ACCOUNT_LOCKED') {
        const mins = Math.ceil((data.retryAfterSeconds || 0) / 60);
        showFormError(`Too many failed attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
      } else {
        showFormError((data && data.message) || 'Invalid email or password. Please try again.');
      }
      return;
    }

    if (!data.mfaRequired) {
      document.dispatchEvent(new CustomEvent('dashboard:load', { detail: { user: data.user } }));
      Router.show('dashboard');
      return;
    }

    state.userId = data.userId;
    state.availableMethods = data.availableMethods || [];
    renderMfaMethodOptions();
    Router.show('login-choose-method');
  });

  /* ---------------------------- MFA method selection ---------------------------- */

  const METHOD_META = {
    email: {
      label: 'Email OTP',
      helper: 'Receive a code on your email',
      icon: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 6h16v12H4z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    },
    sms: {
      label: 'SMS OTP',
      helper: 'Receive a code on your mobile',
      icon: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="6" y="2" width="12" height="20" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    },
    authenticator: {
      label: 'Authenticator App',
      helper: 'Use code from authenticator app',
      icon: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    },
  };

  function renderMfaMethodOptions() {
    const container = document.getElementById('loginMfaOptions');
    container.innerHTML = '';
    state.availableMethods.forEach((method, idx) => {
      const meta = METHOD_META[method];
      if (!meta) return;
      const label = document.createElement('label');
      label.className = 'mfa-option';
      label.innerHTML = `
        <input type="radio" name="loginMfaMethod" value="${method}" ${idx === 0 ? 'checked' : ''} />
        <span class="mfa-option-icon">${meta.icon}</span>
        <span class="mfa-option-text"><strong>${meta.label}</strong><small>${meta.helper}</small></span>
        <span class="mfa-option-radio"></span>
      `;
      container.appendChild(label);
    });
  }

  document.getElementById('loginMfaContinueBtn').addEventListener('click', async () => {
    const selected = document.querySelector('input[name="loginMfaMethod"]:checked');
    if (!selected) return;
    state.selectedMethod = selected.value;

    if (state.selectedMethod === 'authenticator') {
      Router.show('login-totp');
      if (!loginTotpScreen) {
        loginTotpScreen = OtpWidget.controlScreen('login-totp', { onSubmit: handleLoginTotpSubmit });
      }
      loginTotpScreen.hideAllBanners();
      loginTotpScreen.widget.clear();
      return;
    }

    await sendLoginOtp(state.selectedMethod);
  });

  /* ---------------------------- Login OTP (email/sms) ---------------------------- */

  async function sendLoginOtp(method) {
    const { ok, data } = await Api.sendLoginOtp({ userId: state.userId, method });
    if (!ok) return;
    state.otpChallengeId = data.challengeId;

    const isEmail = method === 'email';
    document.getElementById('loginOtpBadge').className = `icon-badge center-badge ${isEmail ? 'icon-badge--blue' : 'icon-badge--green'}`;
    document.getElementById('loginOtpTitle').textContent = isEmail ? 'Email Verification' : 'Mobile Verification';
    document.querySelector('[data-bind="loginOtpDestination"]').textContent = data.destination || '';

    Router.show('login-otp');
    if (!loginOtpScreen) {
      loginOtpScreen = OtpWidget.controlScreen('login-otp', {
        onSubmit: handleLoginOtpSubmit,
        onResend: () => sendLoginOtp(state.selectedMethod),
      });
    }
    loginOtpScreen.reset({ ttlSeconds: data.expiresIn || 165, resendCooldownSeconds: data.resendCooldown || 25 });
    showDevOtpHint('login-otp', data.otp);
  }

  async function handleLoginOtpSubmit(code) {
    const { ok, data } = await Api.verifyLoginOtp({ userId: state.userId, challengeId: state.otpChallengeId, code });
    if (ok) {
      document.dispatchEvent(new CustomEvent('dashboard:load', { detail: { user: data.user } }));
      Router.show('dashboard');
      return;
    }
    if (data && data.code === 'MAX_ATTEMPTS') {
      loginOtpScreen.showMaxAttemptsState();
    } else if (data && data.code === 'OTP_EXPIRED') {
      loginOtpScreen.showExpiredState();
    } else {
      loginOtpScreen.showInvalidCode((data && data.message) || 'Incorrect code. Please try again.');
    }
  }

  /* ---------------------------- Login authenticator (TOTP) ---------------------------- */

  async function handleLoginTotpSubmit(code) {
    const { ok, data } = await Api.verifyLoginTotp({ userId: state.userId, code });
    if (ok) {
      document.dispatchEvent(new CustomEvent('dashboard:load', { detail: { user: data.user } }));
      Router.show('dashboard');
      return;
    }
    loginTotpScreen.showInvalidCode((data && data.message) || 'Invalid code. Please try again.');
  }

  /* ---------------------------- Dashboard (session + JWT demo) ---------------------------- */

  document.addEventListener('dashboard:load', async (e) => {
    const user = e.detail && e.detail.user;
    document.getElementById('dashboardWelcome').textContent = user ? `Welcome back, ${user.fullName}!` : 'Welcome back!';
    const { ok, data } = await Api.me();
    document.getElementById('sessionInfo').textContent = ok
      ? JSON.stringify(data, null, 2)
      : 'Could not load session.';
    document.getElementById('jwtInfo').textContent = '';
  });

  document.getElementById('getTokenBtn').addEventListener('click', async () => {
    const jwtInfo = document.getElementById('jwtInfo');
    const { ok, data } = await Api.getToken();
    if (ok) {
      window.__secureIdJwt = data.token;
      jwtInfo.textContent = `Token issued (expires in ${data.expiresIn}):\n${data.token}`;
    } else {
      jwtInfo.textContent = 'Failed to issue token.';
    }
  });

  document.getElementById('callProtectedBtn').addEventListener('click', async () => {
    const jwtInfo = document.getElementById('jwtInfo');
    if (!window.__secureIdJwt) {
      jwtInfo.textContent = 'Get a JWT first.';
      return;
    }
    const { ok, data } = await Api.protectedResource(window.__secureIdJwt);
    jwtInfo.textContent = `GET /api/protected -> ${ok ? 'success' : 'failed'}\n${JSON.stringify(data, null, 2)}`;
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await Api.logout();
    window.__secureIdJwt = null;
    form.reset();
    Router.show('login-default');
  });

  /* ---------------------------- Reset on fresh visit ---------------------------- */

  document.addEventListener('screen:enter', (e) => {
    if (e.detail.screen === 'login-default') {
      form.reset();
      clearFormError();
      state.userId = null;
      state.otpChallengeId = null;
      showDevOtpHint('login-otp', null);
    }
  });
})();
