
(function () {
  const state = {
    userId: null,
    email: '',
    mobile: '',
    countryCode: '+91',
    emailChallengeId: null,
    mobileChallengeId: null,
    totpChallengeExpirySeconds: 60, // give people a real minute to switch to their phone and scan
  };

  let emailOtpScreen = null;
  let mobileOtpScreen = null;
  let mfaVerificationScreen = null;

  /* ---------------------------- Registration form ---------------------------- */

  const form = document.getElementById('registerForm');
  const pwInput = document.getElementById('regPassword');
  const pwStrengthWrap = document.getElementById('pwStrength');
  const pwStrengthFill = document.getElementById('pwStrengthFill');
  const pwStrengthLabel = document.getElementById('pwStrengthLabel');
  const formErrorEl = document.getElementById('registerFormError');

  function clearFieldErrors() {
    document.querySelectorAll('#registerForm .field-error').forEach((el) => (el.textContent = ''));
    document.querySelectorAll('#registerForm input').forEach((el) => el.classList.remove('has-error'));
    formErrorEl.hidden = true;
    formErrorEl.textContent = '';
  }

  function setFieldError(name, message) {
    const el = document.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = Array.isArray(message) ? message[0] : message;
    const input = document.getElementById(`reg${name.charAt(0).toUpperCase()}${name.slice(1)}`);
    if (input) input.classList.add('has-error');
  }

  pwInput.addEventListener('input', () => {
    const value = pwInput.value;
    const rules = Validation.passwordRules(value);
    document.querySelectorAll('#pwRequirements li[data-rule]').forEach((li) => {
      li.classList.toggle('is-met', !!rules[li.dataset.rule]);
    });

    if (!value) {
      pwStrengthWrap.hidden = true;
      return;
    }
    pwStrengthWrap.hidden = false;
    const strength = Validation.passwordStrength(value);
    const pct = { weak: 33, medium: 66, strong: 100 }[strength];
    pwStrengthFill.style.width = `${pct}%`;
    pwStrengthFill.className = `pw-strength-fill ${strength}`;
    pwStrengthLabel.textContent = strength.charAt(0).toUpperCase() + strength.slice(1);
    pwStrengthLabel.className = `pw-strength-label ${strength}`;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const countryCode = document.getElementById('regCountryCode').value;
    const mobile = document.getElementById('regMobile').value.trim().replace(/\s+/g, '');
    const password = pwInput.value;
    const termsAccepted = document.getElementById('regTerms').checked;

    let hasError = false;
    if (!fullName) { setFieldError('fullName', 'Full name is required'); hasError = true; }
    if (!Validation.isValidEmail(email)) { setFieldError('email', 'Enter a valid email address'); hasError = true; }
    if (!Validation.isValidMobile(mobile)) { setFieldError('mobile', 'Enter a valid mobile number'); hasError = true; }
    if (!Validation.passwordIsValid(password)) { hasError = true; }
    if (!termsAccepted) { setFieldError('terms', 'You must accept the Terms & Conditions'); hasError = true; }
    if (hasError) return;

    const submitBtn = document.getElementById('registerSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';

    const { ok, data } = await Api.register({ fullName, email, mobile, countryCode, password, termsAccepted });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';

    if (!ok) {
      if (data && data.code === 'EMAIL_IN_USE') {
        setFieldError('email', data.message);
      } else if (data && data.errors) {
        Object.entries(data.errors).forEach(([field, msg]) => setFieldError(field, msg));
      } else {
        formErrorEl.hidden = false;
        formErrorEl.textContent = (data && data.message) || 'Something went wrong. Please try again.';
      }
      return;
    }

    state.userId = data.userId;
    state.email = email;
    state.mobile = mobile;
    state.countryCode = countryCode;
    state.emailChallengeId = data.challengeId;

    document.querySelector('[data-bind="emailDestination"]').textContent = email;
    Router.show('email-otp');
    startEmailOtpScreen(data.expiresIn);
    showDevOtpHint('email-otp', data.otp);
  });

  /* ---------------------------- Email OTP screen ---------------------------- */

  function startEmailOtpScreen(expiresIn) {
    if (!emailOtpScreen) {
      emailOtpScreen = OtpWidget.controlScreen('email-otp', {
        onSubmit: handleEmailOtpSubmit,
        onResend: handleEmailOtpResend,
      });
    }
    emailOtpScreen.reset({ ttlSeconds: expiresIn || 165, resendCooldownSeconds: 25 });
  }

  async function handleEmailOtpSubmit(code) {
    const { ok, data } = await Api.verifyEmailOtp({ userId: state.userId, challengeId: state.emailChallengeId, code });
    if (ok) {
      document.querySelector('[data-bind="mobileDestination"]').textContent = `${state.countryCode} ${state.mobile}`;
      Router.show('mobile-otp');
      await sendInitialMobileOtp();
      return;
    }
    if (data && data.code === 'MAX_ATTEMPTS') {
      emailOtpScreen.showMaxAttemptsState();
    } else if (data && data.code === 'OTP_EXPIRED') {
      emailOtpScreen.showExpiredState();
    } else {
      emailOtpScreen.showInvalidCode((data && data.message) || 'Incorrect code. Please try again.');
    }
  }

  async function handleEmailOtpResend() {
    const { ok, data } = await Api.sendEmailOtp(state.userId);
    if (ok) {
      state.emailChallengeId = data.challengeId;
      startEmailOtpScreen(data.expiresIn);
      showDevOtpHint('email-otp', data.otp);
    }
  }

  /* ---------------------------- Mobile OTP screen ---------------------------- */

  async function sendInitialMobileOtp() {
    const { ok, data } = await Api.sendSmsOtp(state.userId);
    if (ok) {
      state.mobileChallengeId = data.challengeId;
      startMobileOtpScreen(data.expiresIn);
      showDevOtpHint('mobile-otp', data.otp);
    }
  }

  function startMobileOtpScreen(expiresIn) {
    if (!mobileOtpScreen) {
      mobileOtpScreen = OtpWidget.controlScreen('mobile-otp', {
        onSubmit: handleMobileOtpSubmit,
        onResend: handleMobileOtpResend,
      });
    }
    mobileOtpScreen.reset({ ttlSeconds: expiresIn || 165, resendCooldownSeconds: 25 });
  }

  async function handleMobileOtpSubmit(code) {
    const { ok, data } = await Api.verifySmsOtp({ userId: state.userId, challengeId: state.mobileChallengeId, code });
    if (ok) {
      Router.show('mfa-setup');
      return;
    }
    if (data && data.code === 'MAX_ATTEMPTS') {
      mobileOtpScreen.showMaxAttemptsState();
    } else if (data && data.code === 'OTP_EXPIRED') {
      mobileOtpScreen.showExpiredState();
    } else {
      mobileOtpScreen.showInvalidCode((data && data.message) || 'Incorrect code. Please try again.');
    }
  }

  async function handleMobileOtpResend() {
    const { ok, data } = await Api.sendSmsOtp(state.userId);
    if (ok) {
      state.mobileChallengeId = data.challengeId;
      startMobileOtpScreen(data.expiresIn);
      showDevOtpHint('mobile-otp', data.otp);
    }
  }

  /* ---------------------------- MFA method selection ---------------------------- */

  const mfaContinueBtn = document.getElementById('mfaContinueBtn');
  const mfaSelectError = document.getElementById('mfaSelectError');

  mfaContinueBtn.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="mfaMethod"]:checked');
    if (!selected) return;
    mfaSelectError.hidden = true;

    mfaContinueBtn.disabled = true;
    const { ok, data } = await Api.mfaSelect({ userId: state.userId, method: selected.value });
    mfaContinueBtn.disabled = false;

    if (!ok) {
      mfaSelectError.hidden = false;
      mfaSelectError.textContent = (data && data.message) || 'Could not set MFA method. Please try again.';
      return;
    }

    if (data.requiresSetup) {
      await startAuthenticatorSetup();
    } else {
      Router.show('registration-success');
    }
  });

  /* ---------------------------- Authenticator (TOTP) setup ---------------------------- */

  const setupKeyDisplay = document.getElementById('setupKeyDisplay');
  const showSetupKeyBtn = document.getElementById('showSetupKeyBtn');
  let currentSetupKey = '';

  showSetupKeyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setupKeyDisplay.hidden = !setupKeyDisplay.hidden;
    setupKeyDisplay.textContent = currentSetupKey;
  });

  async function startAuthenticatorSetup() {
    const { ok, data } = await Api.totpInit(state.userId);
    if (!ok) return;
    document.getElementById('totpQrImage').src = data.qrCodeDataUrl;
    currentSetupKey = data.setupKey;
    setupKeyDisplay.hidden = true;
    Router.show('authenticator-setup');
    OtpWidget.startCountdown('totp-setup-expiry', '[data-otp-countdown="totp-setup"]', state.totpChallengeExpirySeconds, () => {
      // Only reachable while still ON this screen (the countdown is
      // stopped the moment the person clicks Continue) — safe to
      // regenerate since nothing has been confirmed against this secret
      // yet.
      startAuthenticatorSetup();
    });
  }

  document.getElementById('authSetupContinueBtn').addEventListener('click', () => {
    // Stop the QR's background refresh timer now that we're leaving this
    // screen — otherwise it can silently regenerate a brand-new secret
    // (invalidating whatever was just scanned) while the person is busy
    // typing in the 6-digit code on the next screen.
    OtpWidget.stopCountdown('totp-setup-expiry');
    Router.show('mfa-verification');
    if (!mfaVerificationScreen) {
      mfaVerificationScreen = OtpWidget.controlScreen('mfa-verification', {
        onSubmit: handleTotpVerifySubmit,
        onResend: startAuthenticatorSetup,
      });
    }
    mfaVerificationScreen.reset({ ttlSeconds: state.totpChallengeExpirySeconds, resendCooldownSeconds: 25 });
  });

  document.getElementById('cantAccessAppLink').addEventListener('click', () => startAuthenticatorSetup());

  async function handleTotpVerifySubmit(code) {
    const { ok, data } = await Api.totpVerify({ userId: state.userId, code });
    if (ok) {
      Router.show('registration-success');
      return;
    }
    mfaVerificationScreen.showInvalidCode((data && data.message) || 'Invalid code. Please try again.');
  }

  /* ---------------------------- Reset on fresh visit ---------------------------- */

  document.addEventListener('screen:enter', (e) => {
    if (e.detail.screen === 'register-details') {
      form.reset();
      clearFieldErrors();
      pwStrengthWrap.hidden = true;
      document.querySelectorAll('#pwRequirements li').forEach((li) => li.classList.remove('is-met'));
      state.userId = null;
      state.emailChallengeId = null;
      state.mobileChallengeId = null;
      showDevOtpHint('email-otp', null);
      showDevOtpHint('mobile-otp', null);
    }
  });
})();
