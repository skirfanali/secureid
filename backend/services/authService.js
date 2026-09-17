const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOGIN_LOCKOUT_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES || 5);

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: digits only, 7-15 digits (country code entered separately)
const MOBILE_RE = /^[0-9]{7,15}$/;

function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password || '')) errors.push('At least 1 uppercase letter');
  if (!/[0-9]/.test(password || '')) errors.push('At least 1 number');
  if (!/[^A-Za-z0-9]/.test(password || '')) errors.push('At least 1 special character');
  return { valid: errors.length === 0, errors };
}

/**
 * Mirrors the frontend's strength meter so "strong enough" is decided in one
 * place. Backend registration blocks anything below 'medium'.
 */
function passwordStrength(password) {
  if (!password) return 'weak';
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'medium';
  return 'strong';
}

function validateRegistrationInput({ fullName, email, mobile, password, termsAccepted }) {
  const errors = {};
  if (!fullName || !fullName.trim()) errors.fullName = 'Full name is required';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
  if (!mobile || !MOBILE_RE.test(mobile)) errors.mobile = 'Enter a valid mobile number';
  const pw = validatePassword(password);
  if (!pw.valid) errors.password = pw.errors;
  if (!termsAccepted) errors.terms = 'You must accept the Terms & Conditions';
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Returns { locked, remainingMs } */
function lockoutStatus(user) {
  if (!user.lockedUntil) return { locked: false, remainingMs: 0 };
  const remaining = user.lockedUntil - Date.now();
  if (remaining <= 0) return { locked: false, remainingMs: 0 };
  return { locked: true, remainingMs: remaining };
}

/** Call after a failed password check. Returns updated lockout info. */
function registerFailedAttempt(user, usersStorage) {
  const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
  const patch = { failedLoginAttempts };
  if (failedLoginAttempts >= LOGIN_MAX_ATTEMPTS) {
    patch.lockedUntil = Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000;
    patch.failedLoginAttempts = 0; // reset counter once locked
  }
  return usersStorage.updateUser(user.id, patch);
}

function clearFailedAttempts(user, usersStorage) {
  return usersStorage.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null });
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword,
  passwordStrength,
  validateRegistrationInput,
  lockoutStatus,
  registerFailedAttempt,
  clearFailedAttempts,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES,
};
