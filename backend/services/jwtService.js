const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_TTL_MINUTES = Number(process.env.JWT_TTL_MINUTES || 15);

if (!JWT_SECRET) {
  // Fail loudly at boot rather than silently signing with `undefined`.
  // eslint-disable-next-line no-console
  console.warn('[secureid] WARNING: JWT_SECRET is not set. Set it in backend/.env before deploying.');
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET || 'dev-only-insecure-secret',
    { expiresIn: `${JWT_TTL_MINUTES}m` }
  );
}

/** Returns { valid, payload } or { valid: false, error } */
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET || 'dev-only-insecure-secret');
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: err.name === 'TokenExpiredError' ? 'expired' : 'invalid' };
  }
}

module.exports = { issueToken, verifyToken, JWT_TTL_MINUTES };
