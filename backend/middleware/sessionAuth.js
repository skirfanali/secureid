const sessionService = require('../services/sessionService');
const users = require('../storage/users');

/** Attaches req.user if a valid session cookie is present; does not block the request. */
function attachUserFromSession(req, res, next) {
  const sessionId = req.cookies?.[sessionService.SESSION_COOKIE_NAME];
  const session = sessionService.getSession(sessionId);
  if (session) {
    req.user = users.findById(session.userId);
    req.sessionId = sessionId;
  }
  next();
}

/** Blocks the request unless a valid session is present. */
function requireSession(req, res, next) {
  const sessionId = req.cookies?.[sessionService.SESSION_COOKIE_NAME];
  const session = sessionService.getSession(sessionId);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Not authenticated', code: 'NO_SESSION' });
  }
  const user = users.findById(session.userId);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authenticated', code: 'NO_SESSION' });
  }
  req.user = user;
  req.sessionId = sessionId;
  next();
}

module.exports = { attachUserFromSession, requireSession };
