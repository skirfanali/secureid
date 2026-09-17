/**
 * In-memory OTP challenge store, used for both registration OTPs
 * (email/SMS) and login MFA OTPs (email/SMS). Authenticator (TOTP) codes
 * don't need a challenge record since they're verified against the
 * user's stored secret directly.
 *
 * Challenge shape:
 * {
 *   challengeId, userId, channel,   // 'email' | 'sms'
 *   purpose,                        // 'registration-email' | 'registration-sms' | 'login'
 *   otpHash, salt,
 *   expiresAt,                      // epoch ms
 *   attempts, maxAttempts,
 *   consumed,                       // true once successfully verified
 *   lastSentAt                      // epoch ms, used for resend cooldown
 * }
 */

const { v4: uuid } = require('uuid');

const challenges = new Map();

function createChallenge({ userId, channel, purpose, otpHash, salt, ttlSeconds, maxAttempts }) {
  const challengeId = uuid();
  const now = Date.now();
  const challenge = {
    challengeId,
    userId,
    channel,
    purpose,
    otpHash,
    salt,
    expiresAt: now + ttlSeconds * 1000,
    attempts: 0,
    maxAttempts,
    consumed: false,
    lastSentAt: now,
  };
  challenges.set(challengeId, challenge);
  return challenge;
}

function getChallenge(challengeId) {
  return challenges.get(challengeId) || null;
}

function updateChallenge(challengeId, patch) {
  const challenge = challenges.get(challengeId);
  if (!challenge) return null;
  Object.assign(challenge, patch);
  challenges.set(challengeId, challenge);
  return challenge;
}

function deleteChallenge(challengeId) {
  return challenges.delete(challengeId);
}

/** Invalidate any prior un-consumed challenges for this user/channel/purpose so only one is ever live. */
function invalidateExisting(userId, channel, purpose) {
  for (const [id, c] of challenges.entries()) {
    if (c.userId === userId && c.channel === channel && c.purpose === purpose && !c.consumed) {
      challenges.delete(id);
    }
  }
}

function listAll() {
  return Array.from(challenges.values());
}

module.exports = { createChallenge, getChallenge, updateChallenge, deleteChallenge, invalidateExisting, listAll };
