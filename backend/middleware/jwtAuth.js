const jwtService = require('../services/jwtService');
const users = require('../storage/users');

function requireJwt(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Missing bearer token', code: 'NO_TOKEN' });
  }

  const { valid, payload, error } = jwtService.verifyToken(token);
  if (!valid) {
    const code = error === 'expired' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return res.status(401).json({ success: false, message: 'Invalid or expired token', code });
  }

  const user = users.findById(payload.sub);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
  }

  req.user = user;
  req.jwtPayload = payload;
  next();
}

module.exports = { requireJwt };
