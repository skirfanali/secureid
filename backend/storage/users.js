/**
 * In-memory user store.
 *
 * Kept deliberately simple (two Maps) so it can be swapped for a real
 * database later without touching the services that consume it — every
 * exported function here is the "repository" boundary. Nothing outside
 * this file should reach into the Maps directly.
 *
 * User shape:
 * {
 *   id, fullName, email, mobile, countryCode,
 *   passwordHash,
 *   emailVerified, mobileVerified,
 *   mfaEnabled, mfaMethod,            // 'authenticator' | 'sms' | 'email'
 *   totpSecret,                       // base32 secret, set once authenticator MFA is enabled
 *   failedLoginAttempts, lockedUntil, // account lockout tracking
 *   createdAt
 * }
 */

const { v4: uuid } = require('uuid');

const usersById = new Map();
const usersByEmail = new Map(); // lowercase email -> id

function createUser({ fullName, email, mobile, countryCode, passwordHash }) {
  const id = uuid();
  const user = {
    id,
    fullName,
    email,
    mobile,
    countryCode,
    passwordHash,
    emailVerified: false,
    mobileVerified: false,
    mfaEnabled: false,
    mfaMethod: null,
    totpSecret: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString(),
  };
  usersById.set(id, user);
  usersByEmail.set(email.toLowerCase(), id);
  return user;
}

function findById(id) {
  return usersById.get(id) || null;
}

function findByEmail(email) {
  if (!email) return null;
  const id = usersByEmail.get(String(email).toLowerCase());
  return id ? usersById.get(id) : null;
}

function updateUser(id, patch) {
  const user = usersById.get(id);
  if (!user) return null;
  Object.assign(user, patch);
  usersById.set(id, user);
  return user;
}

function deleteUser(id) {
  const user = usersById.get(id);
  if (!user) return false;
  usersByEmail.delete(user.email.toLowerCase());
  usersById.delete(id);
  return true;
}

/** Strip fields that must never leave the backend (password hash, TOTP secret, etc). */
function toPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    mobile: user.mobile,
    countryCode: user.countryCode,
    emailVerified: user.emailVerified,
    mobileVerified: user.mobileVerified,
    mfaEnabled: user.mfaEnabled,
    mfaMethod: user.mfaMethod,
  };
}

function listAll() {
  return Array.from(usersById.values());
}

module.exports = { createUser, findById, findByEmail, updateUser, deleteUser, toPublic, listAll };
