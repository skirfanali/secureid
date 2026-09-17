// Vercel serverless function entry point. This does NOT duplicate any
// routes or logic — it simply hands Vercel's Node runtime the exact same
// Express app used locally (backend/server.js is the single source of
// truth for all routes, middleware, auth, OTP, MFA, sessions, and JWTs).
//
// On Vercel, requests are routed here by vercel.json's rewrite for
// /api/(.*) — the app itself still does its own internal routing
// (app.use('/api', authRoutes) etc.) exactly as it does locally.
//
// (No dotenv call needed here — Vercel injects environment variables
// directly into process.env; there's no .env file in a deployment.)
const app = require('../backend/server');

module.exports = app;
