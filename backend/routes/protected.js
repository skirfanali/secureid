const express = require('express');
const router = express.Router();

const { requireJwt } = require('../middleware/jwtAuth');
const users = require('../storage/users');

/**
 * GET /api/protected
 * Purely for demonstrating the JWT flow end-to-end: requires a valid
 * `Authorization: Bearer <token>` header issued by POST /api/token.
 * Independent of the session cookie used elsewhere in the app.
 */
router.get('/protected', requireJwt, (req, res) => {
  res.json({
    success: true,
    message: 'You accessed a JWT-protected resource.',
    user: users.toPublic(req.user),
    tokenSubject: req.jwtPayload.sub,
  });
});

module.exports = router;
