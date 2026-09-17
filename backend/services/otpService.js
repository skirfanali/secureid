const crypto = require('crypto');
const challengesStore = require('../storage/challenges');

const OTP_LENGTH = Number(process.env.OTP_LENGTH || 6);
const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 165); // 2:45 to match the UI
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 3);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 25);

function generateNumericOtp(length = OTP_LENGTH) {
  // crypto.randomInt is CSPRNG-backed, unlike Math.random.
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(crypto.randomInt(min, max + 1));
}

function hashOtp(otp, salt) {
  return crypto.scryptSync(otp, salt, 64).toString('hex');
}

/**
 * Creates a brand-new OTP challenge, invalidating any previous un-consumed
 * one for the same user/channel/purpose. Returns { challenge, otp } — the
 * plaintext otp is ONLY for the simulated-delivery log line, never for the
 * HTTP response.
 */
function issueOtp({ userId, channel, purpose }) {
  challengesStore.invalidateExisting(userId, channel, purpose);
  const otp = generateNumericOtp();
  const salt = crypto.randomBytes(16).toString('hex');
  const otpHash = hashOtp(otp, salt);
  const challenge = challengesStore.createChallenge({
    userId,
    channel,
    purpose,
    otpHash,
    salt,
    ttlSeconds: OTP_TTL_SECONDS,
    maxAttempts: OTP_MAX_ATTEMPTS,
  });
  return { challenge, otp };
}

function simulateDelivery({ channel, destination, otp, purpose }) {
  const label = channel === 'email' ? 'SIMULATED EMAIL' : 'SIMULATED SMS';
  // eslint-disable-next-line no-console
  console.log(
    `\n[${label}] (${purpose})\nTo: ${destination}\nOTP: ${otp}\nExpires in ${OTP_TTL_SECONDS}s\n`
  );
}

/**
 * Result codes: 'ok' | 'not_found' | 'expired' | 'already_used' | 'max_attempts' | 'invalid'
 */
function verifyOtp({ challengeId, code }) {
  const challenge = challengesStore.getChallenge(challengeId);
  if (!challenge) return { result: 'not_found' };
  if (challenge.consumed) return { result: 'already_used' };
  if (Date.now() > challenge.expiresAt) return { result: 'expired', challenge };
  if (challenge.attempts >= challenge.maxAttempts) {
    return { result: 'max_attempts', challenge };
  }

  const candidateHash = hashOtp(String(code || ''), challenge.salt);
  const matches =
    candidateHash.length === challenge.otpHash.length &&
    crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(challenge.otpHash));

  if (!matches) {
    const updated = challengesStore.updateChallenge(challengeId, { attempts: challenge.attempts + 1 });
    const attemptsRemaining = Math.max(0, updated.maxAttempts - updated.attempts);
    if (attemptsRemaining === 0) {
      return { result: 'max_attempts', challenge: updated, attemptsRemaining: 0 };
    }
    return { result: 'invalid', challenge: updated, attemptsRemaining };
  }

  const updated = challengesStore.updateChallenge(challengeId, { consumed: true });
  return { result: 'ok', challenge: updated };
}

function canResend(challenge) {
  if (!challenge) return true;
  const elapsed = Date.now() - challenge.lastSentAt;
  return elapsed >= OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

function secondsUntilResend(challenge) {
  if (!challenge) return 0;
  const elapsed = Date.now() - challenge.lastSentAt;
  return Math.max(0, Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000));
}

function secondsUntilExpiry(challenge) {
  if (!challenge) return 0;
  return Math.max(0, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
}

/**
 * Whether OTPs may be echoed back in API responses instead of only the
 * server console — strictly a local/demo convenience, never for production.
 * Requires BOTH an explicit opt-in flag AND a non-production environment,
 * so it can't accidentally stay on after a real deployment.
 */
function debugExposureEnabled() {
  return process.env.DEBUG_EXPOSE_OTP === 'true' && process.env.NODE_ENV !== 'production';
}

module.exports = {
  issueOtp,
  simulateDelivery,
  verifyOtp,
  canResend,
  secondsUntilResend,
  secondsUntilExpiry,
  debugExposureEnabled,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
};
