const express = require('express');
const router = express.Router();

const users = require('../storage/users');
const challengesStore = require('../storage/challenges');
const sessionService = require('../services/sessionService');
const otpService = require('../services/otpService');

/**
 * GET /api/debug/state
 *
 * A read-only window into the in-memory store — everything this app
 * currently "remembers": registered users, active sessions, and pending
 * OTP challenges. Local/demo convenience ONLY, gated by the same
 * DEBUG_EXPOSE_OTP flag as the OTP-in-response feature (off by default,
 * and hard-blocked whenever NODE_ENV=production — see backend/.env.example).
 *
 * When the flag is off, this route pretends not to exist (404) rather than
 * returning a 403, so it doesn't even reveal that a debug mode exists.
 */
router.get('/debug/state', (req, res) => {
  if (!otpService.debugExposureEnabled()) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  const now = Date.now();

  const usersOut = users.listAll().map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    mobile: `${u.countryCode} ${u.mobile}`,
    emailVerified: u.emailVerified,
    mobileVerified: u.mobileVerified,
    mfaEnabled: u.mfaEnabled,
    mfaMethod: u.mfaMethod,
    failedLoginAttempts: u.failedLoginAttempts,
    lockedUntil: u.lockedUntil ? new Date(u.lockedUntil).toISOString() : null,
    createdAt: u.createdAt,
    // Deliberately omitted even in dev mode: passwordHash, totpSecret.
  }));

  const challengesOut = challengesStore.listAll().map((c) => ({
    challengeId: c.challengeId,
    userId: c.userId,
    channel: c.channel,
    purpose: c.purpose,
    consumed: c.consumed,
    attempts: `${c.attempts}/${c.maxAttempts}`,
    expiresInSeconds: Math.max(0, Math.round((c.expiresAt - now) / 1000)),
    // Deliberately omitted: otpHash, salt — hashes aren't secret but there's
    // no reason to show them here either.
  }));

  res.json({
    success: true,
    note: 'Dev-only snapshot of in-memory data. Resets whenever the server restarts.',
    users: usersOut,
    pendingOtpChallenges: challengesOut,
    activeSessionCount: sessionService.activeSessionCount(),
  });
});

module.exports = router;
