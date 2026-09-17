const crypto = require('crypto');

const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 60);
const SESSION_COOKIE_NAME = 'secureid_session';

// sessionId -> { userId, createdAt, expiresAt }
const sessions = new Map();

function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(sessionId, {
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MINUTES * 60 * 1000,
  });
  return sessionId;
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function destroySession(sessionId) {
  return sessions.delete(sessionId);
}

function cookieOptions() {
  // When the frontend and backend live on different domains (e.g. Vercel +
  // Render), the session cookie is "cross-site" from the browser's point of
  // view. Cross-site cookies require SameSite=None, which in turn requires
  // Secure (HTTPS-only) — browsers reject None without Secure. Locally,
  // both run on http://localhost, so SameSite=Lax (no HTTPS requirement)
  // keeps local development simple.
  const crossSite = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? 'none' : 'lax',
    maxAge: SESSION_TTL_MINUTES * 60 * 1000,
    path: '/',
  };
}

function activeSessionCount() {
  const now = Date.now();
  let count = 0;
  for (const s of sessions.values()) if (s.expiresAt > now) count++;
  return count;
}

module.exports = {
  createSession,
  getSession,
  destroySession,
  cookieOptions,
  activeSessionCount,
  SESSION_COOKIE_NAME,
};
