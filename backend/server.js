// Load backend/.env by an absolute path (via __dirname) rather than the
// default cwd-relative lookup — this file now gets started from the repo
// root (`npm start` → backend/local.js), not from inside backend/, so a
// cwd-relative dotenv.config() would silently miss backend/.env. On
// Vercel there's no .env file at all (env vars come from the dashboard),
// so this is a harmless no-op there.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const otpRoutes = require('./routes/otp');
const mfaRoutes = require('./routes/mfa');
const protectedRoutes = require('./routes/protected');
const debugRoutes = require('./routes/debug');

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  // The app now serves the frontend itself, so the normal case is a
  // same-origin request (the browser's address bar matches this server's
  // own host:port) — that should always be allowed no matter what port
  // it's running on, without needing FRONTEND_URL configured to match.
  // FRONTEND_URL is only consulted for genuinely cross-origin requests,
  // e.g. when the frontend is deployed separately (see README).
  const requestOrigin = req.headers.origin;
  let sameOrigin = false;
  if (requestOrigin) {
    try {
      sameOrigin = new URL(requestOrigin).host === req.headers.host;
    } catch {
      sameOrigin = false;
    }
  }

  cors({
    origin(origin, callback) {
      if (!origin || sameOrigin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true, // required so the session cookie is sent/received cross-origin
  })(req, res, next);
});
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api', authRoutes);
app.use('/api', otpRoutes);
app.use('/api', mfaRoutes);
app.use('/api', protectedRoutes);
app.use('/api', debugRoutes);

// Serve the frontend directly so the whole app runs from a single command
// and a single origin (localhost:PORT) — no separate dev server, no CORS,
// no configuring API_BASE_URL. This is purely a local-convenience layer;
// the deployment docs still cover deploying frontend/ and backend/
// separately (e.g. Vercel + a Node host) when that's what you want instead.
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Central error handler — keeps stack traces out of responses.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Origin not allowed', code: 'CORS_DENIED' });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// No app.listen() here — this file only builds and exports the Express
// app. Starting the HTTP server is the job of whoever consumes this
// export: backend/local.js for local development (`npm start`), or
// api/index.js for Vercel, which hands the exported app straight to
// Vercel's Node serverless runtime instead of binding a port.
module.exports = app;
