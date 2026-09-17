const express = require('express');
const router = express.Router();

const users = require('../storage/users');
const totpService = require('../services/totpService');
const sessionService = require('../services/sessionService');

// Pending TOTP secrets, keyed by userId, while the user is mid-setup and
// hasn't yet proven possession of the authenticator app.
const pendingTotpSecrets = new Map();

/* ---------------------------------------------------------------- */
/* POST /api/mfa/select  — registration: choose SMS / Email / Authenticator */
/* ---------------------------------------------------------------- */
router.post('/mfa/select', (req, res) => {
  const { userId, method } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
  if (!user.emailVerified || !user.mobileVerified) {
    return res.status(400).json({ success: false, message: 'Verify email and mobile before enabling MFA', code: 'NOT_VERIFIED' });
  }
  if (!['authenticator', 'sms', 'email'].includes(method)) {
    return res.status(400).json({ success: false, message: 'Invalid MFA method', code: 'INVALID_METHOD' });
  }

  if (method === 'sms' || method === 'email') {
    // Email/mobile were already proven during registration, so no extra
    // challenge is needed — enable MFA immediately.
    users.updateUser(userId, { mfaEnabled: true, mfaMethod: method });
    return res.json({ success: true, mfaEnabled: true, method, requiresSetup: false });
  }

  // Authenticator needs an extra setup + verification step before it's enabled.
  return res.json({ success: true, method, requiresSetup: true });
});

/* ---------------------------------------------------------------- */
/* POST /api/mfa/totp/init — generate secret + QR for authenticator setup */
/* ---------------------------------------------------------------- */
router.post('/mfa/totp/init', async (req, res) => {
  const { userId } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });

  const secret = totpService.generateSecret();
  pendingTotpSecrets.set(userId, { secret, issuedAt: Date.now() });

  const otpAuthUri = totpService.buildOtpAuthUri(secret, user.email);
  const qrCodeDataUrl = await totpService.generateQrCodeDataUrl(otpAuthUri);

  res.json({ success: true, qrCodeDataUrl, setupKey: secret });
});

/* ---------------------------------------------------------------- */
/* POST /api/mfa/totp/verify — confirm the 6-digit code during REGISTRATION setup */
/* ---------------------------------------------------------------- */
router.post('/mfa/totp/verify', (req, res) => {
  const { userId, code } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });

  const pending = pendingTotpSecrets.get(userId);
  if (!pending) {
    return res.status(400).json({ success: false, message: 'No authenticator setup in progress. Please restart setup.', code: 'NO_PENDING_SETUP' });
  }

  const ok = totpService.verifyToken(code, pending.secret);
  if (!ok) {
    return res.status(400).json({ success: false, message: 'Invalid code. Please try again.', code: 'INVALID_TOTP' });
  }

  users.updateUser(userId, { mfaEnabled: true, mfaMethod: 'authenticator', totpSecret: pending.secret });
  pendingTotpSecrets.delete(userId);

  res.json({ success: true, mfaEnabled: true, method: 'authenticator' });
});

/* ---------------------------------------------------------------- */
/* POST /api/verify-login-totp — verify authenticator code during LOGIN  */
/* ---------------------------------------------------------------- */
router.post('/verify-login-totp', (req, res) => {
  const { userId, code } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
  if (!user.totpSecret) {
    return res.status(400).json({ success: false, message: 'Authenticator app is not set up for this account.', code: 'NO_TOTP_SECRET' });
  }

  const ok = totpService.verifyToken(code, user.totpSecret);
  if (!ok) {
    return res.status(400).json({ success: false, message: 'Invalid code. Please try again.', code: 'INVALID_TOTP' });
  }

  const sessionId = sessionService.createSession(user.id);
  res.cookie(sessionService.SESSION_COOKIE_NAME, sessionId, sessionService.cookieOptions());
  res.json({ success: true, message: 'Login successful', user: users.toPublic(user) });
});

module.exports = router;
