const express = require('express');
const router = express.Router();

const users = require('../storage/users');
const otpService = require('../services/otpService');
const challengesStore = require('../storage/challenges');

/**
 * Shared handler for "send/resend an OTP" on a given channel + purpose.
 * `resolveDestination` picks email vs mobile from the user record.
 */
function sendOtpHandler(channel, purpose, resolveDestination) {
  return (req, res) => {
    const { userId } = req.body || {};
    const user = users.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });

    const { challenge, otp } = otpService.issueOtp({ userId: user.id, channel, purpose });
    otpService.simulateDelivery({ channel, destination: resolveDestination(user), otp, purpose });

    res.json({
      success: true,
      challengeId: challenge.challengeId,
      expiresIn: otpService.secondsUntilExpiry(challenge),
      resendCooldown: otpService.OTP_RESEND_COOLDOWN_SECONDS,
      maxAttempts: otpService.OTP_MAX_ATTEMPTS,
      ...(otpService.debugExposureEnabled() ? { otp } : {}),
    });
  };
}

function verifyOtpResult(result, res) {
  switch (result.result) {
    case 'ok':
      return true;
    case 'not_found':
      res.status(404).json({ success: false, message: 'Verification session not found. Please request a new code.', code: 'CHALLENGE_NOT_FOUND' });
      return false;
    case 'already_used':
      res.status(400).json({ success: false, message: 'This code has already been used. Please request a new code.', code: 'ALREADY_USED' });
      return false;
    case 'expired':
      res.status(400).json({ success: false, message: 'This code has expired.', code: 'OTP_EXPIRED' });
      return false;
    case 'max_attempts':
      res.status(429).json({ success: false, message: 'Maximum attempts reached. Please request a new code.', code: 'MAX_ATTEMPTS', attemptsRemaining: 0 });
      return false;
    case 'invalid':
      res.status(400).json({
        success: false,
        message: `Incorrect code. Please try again. You have ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} left.`,
        code: 'INVALID_OTP',
        attemptsRemaining: result.attemptsRemaining,
      });
      return false;
    default:
      res.status(500).json({ success: false, message: 'Unexpected error verifying code', code: 'UNKNOWN' });
      return false;
  }
}

/* ---------------------- Registration: Email OTP -------------------- */

router.post('/send-email-otp', sendOtpHandler('email', 'registration-email', (u) => u.email));

router.post('/verify-email-otp', (req, res) => {
  const { userId, challengeId, code } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });

  const challenge = challengesStore.getChallenge(challengeId);
  if (challenge && challenge.userId !== userId) {
    return res.status(400).json({ success: false, message: 'Verification session mismatch', code: 'CHALLENGE_MISMATCH' });
  }

  const result = otpService.verifyOtp({ challengeId, code });
  if (!verifyOtpResult(result, res)) return;

  users.updateUser(userId, { emailVerified: true });
  res.json({ success: true, message: 'Email verified', emailVerified: true });
});

/* ---------------------- Registration: SMS OTP ----------------------- */

router.post('/send-sms-otp', sendOtpHandler('sms', 'registration-sms', (u) => `${u.countryCode} ${u.mobile}`));

router.post('/verify-sms-otp', (req, res) => {
  const { userId, challengeId, code } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });

  const challenge = challengesStore.getChallenge(challengeId);
  if (challenge && challenge.userId !== userId) {
    return res.status(400).json({ success: false, message: 'Verification session mismatch', code: 'CHALLENGE_MISMATCH' });
  }

  const result = otpService.verifyOtp({ challengeId, code });
  if (!verifyOtpResult(result, res)) return;

  users.updateUser(userId, { mobileVerified: true });
  res.json({ success: true, message: 'Mobile verified', mobileVerified: true });
});

/* ---------------------------- Login OTP ------------------------------ */

router.post('/send-login-otp', (req, res) => {
  const { userId, method } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });
  if (method !== 'email' && method !== 'sms') {
    return res.status(400).json({ success: false, message: 'Unsupported method for OTP delivery', code: 'INVALID_METHOD' });
  }

  const destination = method === 'email' ? user.email : `${user.countryCode} ${user.mobile}`;
  const { challenge, otp } = otpService.issueOtp({ userId: user.id, channel: method, purpose: 'login' });
  otpService.simulateDelivery({ channel: method, destination, otp, purpose: 'login' });

  res.json({
    success: true,
    challengeId: challenge.challengeId,
    method,
    destination,
    expiresIn: otpService.secondsUntilExpiry(challenge),
    resendCooldown: otpService.OTP_RESEND_COOLDOWN_SECONDS,
    maxAttempts: otpService.OTP_MAX_ATTEMPTS,
    ...(otpService.debugExposureEnabled() ? { otp } : {}),
  });
});

router.post('/verify-login-otp', (req, res) => {
  const { userId, challengeId, code } = req.body || {};
  const user = users.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found', code: 'USER_NOT_FOUND' });

  const challenge = challengesStore.getChallenge(challengeId);
  if (challenge && challenge.userId !== userId) {
    return res.status(400).json({ success: false, message: 'Verification session mismatch', code: 'CHALLENGE_MISMATCH' });
  }

  const result = otpService.verifyOtp({ challengeId, code });
  if (!verifyOtpResult(result, res)) return;

  // Signal to the route layer (handled in auth.js style) — but session
  // creation for login lives here to keep the OTP + session-issuance atomic.
  const sessionService = require('../services/sessionService');
  const sessionId = sessionService.createSession(user.id);
  res.cookie(sessionService.SESSION_COOKIE_NAME, sessionId, sessionService.cookieOptions());

  res.json({ success: true, message: 'Login successful', user: users.toPublic(user) });
});

module.exports = router;
