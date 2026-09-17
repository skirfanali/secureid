const express = require('express');
const router = express.Router();

const users = require('../storage/users');
const authService = require('../services/authService');
const otpService = require('../services/otpService');
const sessionService = require('../services/sessionService');
const jwtService = require('../services/jwtService');
const totpService = require('../services/totpService');
const { requireSession } = require('../middleware/sessionAuth');

/* ------------------------------------------------------------------ */
/* POST /api/register                                                  */
/* ------------------------------------------------------------------ */
router.post('/register', async (req, res) => {
  const { fullName, email, mobile, countryCode = '+91', password, termsAccepted } = req.body || {};

  const { valid, errors } = authService.validateRegistrationInput({
    fullName,
    email,
    mobile,
    password,
    termsAccepted,
  });
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Invalid registration data', code: 'VALIDATION_ERROR', errors });
  }

  if (authService.passwordStrength(password) === 'weak') {
    return res.status(400).json({
      success: false,
      message: 'Password does not meet the minimum strength requirement',
      code: 'WEAK_PASSWORD',
    });
  }

  if (users.findByEmail(email)) {
    // Deliberately generic — don't confirm which field collided beyond "email in use".
    return res.status(409).json({ success: false, message: 'An account with this email already exists', code: 'EMAIL_IN_USE' });
  }

  const passwordHash = await authService.hashPassword(password);
  const user = users.createUser({ fullName, email, mobile, countryCode, passwordHash });

  const { challenge, otp } = otpService.issueOtp({ userId: user.id, channel: 'email', purpose: 'registration-email' });
  otpService.simulateDelivery({ channel: 'email', destination: email, otp, purpose: 'registration-email' });

  return res.status(201).json({
    success: true,
    message: 'Account created. Verify your email to continue.',
    userId: user.id,
    challengeId: challenge.challengeId,
    expiresIn: otpService.secondsUntilExpiry(challenge),
    ...(otpService.debugExposureEnabled() ? { otp } : {}),
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/login                                                     */
/* ------------------------------------------------------------------ */
router.post('/login', async (req, res) => {
  const { emailOrUsername, password } = req.body || {};
  const user = users.findByEmail(emailOrUsername);

  // Generic failure message regardless of which check fails, so we never
  // reveal whether the email exists.
  const genericFail = () =>
    res.status(401).json({ success: false, message: 'Invalid email or password. Please try again.', code: 'INVALID_CREDENTIALS' });

  if (!user) return genericFail();

  const { locked, remainingMs } = authService.lockoutStatus(user);
  if (locked) {
    return res.status(423).json({
      success: false,
      message: 'Too many failed attempts. Your account is temporarily locked.',
      code: 'ACCOUNT_LOCKED',
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
    });
  }

  const passwordOk = await authService.verifyPassword(password || '', user.passwordHash);
  if (!passwordOk) {
    const updated = authService.registerFailedAttempt(user, users);
    if (updated.lockedUntil) {
      return res.status(423).json({
        success: false,
        message: 'Too many failed attempts. Your account is temporarily locked.',
        code: 'ACCOUNT_LOCKED',
        retryAfterSeconds: Math.ceil((updated.lockedUntil - Date.now()) / 1000),
      });
    }
    return genericFail();
  }

  authService.clearFailedAttempts(user, users);

  if (!user.mfaEnabled) {
    // No MFA configured (shouldn't normally happen since registration enforces it) — sign in directly.
    const sessionId = sessionService.createSession(user.id);
    res.cookie(sessionService.SESSION_COOKIE_NAME, sessionId, sessionService.cookieOptions());
    return res.json({ success: true, mfaRequired: false, user: users.toPublic(user) });
  }

  const availableMethods = ['email', 'sms'];
  if (user.mfaMethod === 'authenticator' && user.totpSecret) availableMethods.push('authenticator');

  return res.json({
    success: true,
    mfaRequired: true,
    userId: user.id,
    availableMethods,
    defaultMethod: user.mfaMethod,
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/me                                                         */
/* ------------------------------------------------------------------ */
router.get('/me', requireSession, (req, res) => {
  res.json({ authenticated: true, user: users.toPublic(req.user) });
});

/* ------------------------------------------------------------------ */
/* POST /api/logout                                                    */
/* ------------------------------------------------------------------ */
router.post('/logout', (req, res) => {
  const sessionId = req.cookies?.[sessionService.SESSION_COOKIE_NAME];
  if (sessionId) sessionService.destroySession(sessionId);
  res.clearCookie(sessionService.SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Logged out' });
});

/* ------------------------------------------------------------------ */
/* POST /api/token  — issue a short-lived JWT for an already-authenticated */
/* session, demonstrating JWT auth as a separate mechanism from sessions. */
/* ------------------------------------------------------------------ */
router.post('/token', requireSession, (req, res) => {
  const token = jwtService.issueToken(req.user);
  res.json({ success: true, token, expiresIn: `${jwtService.JWT_TTL_MINUTES}m`, tokenType: 'Bearer' });
});

module.exports = router;
