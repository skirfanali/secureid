# SecureID — IAM Authentication & Registration

## ⚠️ How to run this (read this part first)

This app has **two pieces**: a static frontend (HTML/CSS/JS) and a **Node.js
backend** that does all the real work (passwords, OTPs, sessions, JWTs).
The frontend is useless on its own — every button calls the backend.

**Do not** open `frontend/index.html` directly, and **do not** use a plain
static server like VS Code's "Live Server" extension, `npx serve`, or
`python -m http.server` on this project. Those only serve files — they have
no idea what `/api/register` is, so every request will 404, exactly like a
static server would.

**The only correct way to run it locally:**

```bash
npm install
cp backend/.env.example backend/.env
npm start
```

Then open **http://localhost:4001**. That single Node process serves both
the frontend and the API from one port — nothing else needs to run.

Or just double-click **`start.sh`** (Mac/Linux) or **`start.bat`**
(Windows) in the project root — they do the above for you.

**To deploy it for real, see [§12 Vercel deployment](#12-vercel-deployment)
below** — the whole app (frontend + backend) deploys as a single Vercel
project.

---


A full-stack demo Identity & Access Management (IAM) app: multi-step registration
with email/SMS OTP verification and MFA (Authenticator/SMS/Email), login with
MFA challenge + account lockout, server-side sessions, and a separate JWT
flow for API access.

> Built to match the supplied `Registration Screens.png` / `Login Screens.png`
> reference designs, both mobile and web layouts.

---


## 1. Project description

SecureID is a reference implementation of a modern authentication journey:

- **Registration:** account details → email OTP → mobile OTP → MFA setup
  (Authenticator App / SMS / Email) → authenticator QR + TOTP verification
  (if chosen) → success screen.
- **Login:** credentials → MFA method choice → OTP or TOTP verification →
  authenticated session.
- **Session model:** an HttpOnly, server-side session cookie for the web app,
  plus an independent short-lived JWT flow (`POST /api/token` +
  `GET /api/protected`) to demonstrate bearer-token API access.

## 2. Features

- Registration with live password-strength meter and backend-enforced
  minimum strength.
- Email OTP and SMS OTP (simulated delivery, logged to the backend console),
  each with expiry, limited attempts, resend cooldown, and single-use
  invalidation.
- MFA setup with three selectable methods: Authenticator App (TOTP,
  RFC 6238, server-verified), SMS, or Email.
- Login with generic "invalid credentials" messaging (never reveals which
  field was wrong), MFA challenge, and temporary account lockout after
  repeated failures.
- Server-side sessions via HttpOnly/Secure/SameSite cookies — no
  `localStorage`/`sessionStorage` for auth.
- Separate JWT issuance + validation flow protecting `GET /api/protected`.
- Fully responsive UI (mobile + desktop) matching the supplied screenshots.

## 3. Technology stack

- **Frontend:** plain HTML, CSS, JavaScript (no framework/build step).
- **Backend:** Node.js + Express.
- **Auth/crypto:** bcryptjs (password hashing), Node `crypto` (OTP hashing,
  CSPRNG OTP generation), `otplib` (TOTP) + `qrcode` (QR rendering),
  `jsonwebtoken` (JWT).
- **Storage:** in-memory (Maps) for this assignment — structured behind a
  small repository layer (`storage/`) so it can be swapped for a real
  database without touching routes/services.

## 4. Folder structure

```text
secureid/
├── api/
│   └── index.js               # Vercel serverless entry — re-exports backend/server.js, no logic of its own
│
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js            # API client + screen router + shared UI wiring
│   │   ├── validation.js      # client-side field/password validation
│   │   ├── otp.js             # reusable OTP-box widget + screen controller
│   │   ├── registration.js    # registration flow
│   │   └── login.js           # login flow + post-login dashboard demo
│   └── assets/
│
├── backend/
│   ├── server.js       # builds + exports the Express app (no app.listen() here)
│   ├── local.js        # local-dev only: starts server.js on a real port
│   ├── package.json
│   ├── .env.example
│   ├── routes/        auth.js, otp.js, mfa.js, protected.js, debug.js
│   ├── services/      authService, otpService, totpService, sessionService, jwtService
│   ├── middleware/    sessionAuth.js, jwtAuth.js
│   └── storage/       users.js, challenges.js  (in-memory)
│
├── package.json        # root — what Vercel (and `npm start`) actually installs/runs
├── vercel.json          # routes /api/* to the function, everything else to /frontend
├── README.md
└── .gitignore
```

`backend/server.js` is the single source of truth for every route, piece of
middleware, and auth mechanism. Both `backend/local.js` (local dev) and
`api/index.js` (Vercel) just import that same app and hand it to whichever
runtime they're running under — nothing is duplicated between them.

## 5. Installation & quick start

The backend serves the frontend directly, so you only need **one** terminal
and **one** URL — no separate frontend dev server, no CORS setup.

```bash
git clone <this-repo>
cd secureid
npm install
cp backend/.env.example backend/.env
npm start
```

Then open **http://localhost:4001** in your browser. That's it — registration,
login, MFA, everything runs from that one page. Watch the terminal for the
`[SIMULATED EMAIL]` / `[SIMULATED SMS]` OTP codes while testing.

If the page ever shows a yellow "can't reach the backend" banner, it means
`npm start` isn't running (or crashed) — start/restart it and click **retry**.

`npm install` at the repo root installs everything both `backend/local.js`
(local dev) and `api/index.js` (Vercel) need — there's no separate install
step inside `backend/`.

## 6. Environment variables

Set in `backend/.env` for local development (copy `backend/.env.example`).
For Vercel, set the same variable **names** as real values under
**Vercel Dashboard → Project → Settings → Environment Variables** — Vercel
doesn't read `.env` files (they're git-ignored and never uploaded).

| Variable | Purpose |
|---|---|
| `PORT` | Local-only — port `backend/local.js` listens on (default 4001). Not used/needed on Vercel. |
| `FRONTEND_URL` | Only matters for genuinely cross-origin setups. Not needed for the single-Vercel-project deployment (frontend + API share one domain, detected as same-origin automatically). |
| `SESSION_SECRET` | Reserved for future signed-cookie use |
| `JWT_SECRET` | Secret used to sign/verify JWTs — **required, set a strong random value in Vercel** |
| `SESSION_TTL_MINUTES` | Session lifetime (default 60) |
| `JWT_TTL_MINUTES` | JWT lifetime (default 15) |
| `OTP_LENGTH` | OTP digit length (default 6) |
| `OTP_TTL_SECONDS` | OTP validity window (default 165 = 2:45, matches the UI) |
| `OTP_MAX_ATTEMPTS` | Attempts allowed per OTP challenge (default 3) |
| `OTP_RESEND_COOLDOWN_SECONDS` | Cooldown before resend is allowed (default 25) |
| `LOGIN_MAX_ATTEMPTS` | Failed logins before lockout (default 5) |
| `LOGIN_LOCKOUT_MINUTES` | Lockout duration (default 5) |
| `NODE_ENV` | Set to `production` in Vercel — switches session cookies to `Secure; SameSite=None` (required over HTTPS) and hard-disables `DEBUG_EXPOSE_OTP` no matter what it's set to |
| `DEBUG_EXPOSE_OTP` | Local-only convenience — echoes OTP codes in API responses for testing. Leave unset in Vercel. |

Never commit a real `.env` — it's git-ignored.

## 7. API documentation

All endpoints are under `/api`. JSON in, JSON out.

**Registration**
- `POST /api/register` — `{fullName, email, mobile, countryCode, password, termsAccepted}` → creates the user, sends the first email OTP.
- `POST /api/send-email-otp` — `{userId}` → (re)issues an email OTP.
- `POST /api/verify-email-otp` — `{userId, challengeId, code}`
- `POST /api/send-sms-otp` — `{userId}` → (re)issues a mobile OTP.
- `POST /api/verify-sms-otp` — `{userId, challengeId, code}`
- `POST /api/mfa/select` — `{userId, method}` (`authenticator` | `sms` | `email`)
- `POST /api/mfa/totp/init` — `{userId}` → `{qrCodeDataUrl, setupKey}`
- `POST /api/mfa/totp/verify` — `{userId, code}` → enables authenticator MFA

**Login**
- `POST /api/login` — `{emailOrUsername, password}` → either signs in directly (no MFA) or returns `{mfaRequired: true, userId, availableMethods}`
- `POST /api/send-login-otp` — `{userId, method}` (`email` | `sms`)
- `POST /api/verify-login-otp` — `{userId, challengeId, code}` → creates session
- `POST /api/verify-login-totp` — `{userId, code}` → creates session

**Session & JWT**
- `GET /api/me` — session-authenticated → `{authenticated, user}`
- `POST /api/logout` — invalidates the session, clears the cookie
- `POST /api/token` — session-authenticated → issues a short-lived JWT
- `GET /api/protected` — `Authorization: Bearer <jwt>` required

Error responses follow `{success: false, message, code, ...extra}` with an
appropriate HTTP status (400/401/404/409/423/429).

## 8. How OTP simulation works

OTPs are generated server-side with a CSPRNG (`crypto.randomInt`), hashed
with `crypto.scryptSync` before storage (never stored or returned in plain
text), and "delivered" by logging to the backend console:

```text
[SIMULATED EMAIL] (registration-email)
To: priya.sharma@email.com
OTP: 482913
Expires in 165s
```

To test a flow, watch the backend terminal output for the printed code and
enter it in the UI.

## 9. How session authentication works

On successful login (after MFA), the backend creates a server-side session
record (in-memory) and sets an HttpOnly, SameSite=Lax cookie (`Secure` is
added automatically when `NODE_ENV=production`) containing only an opaque
session ID — no user data or secrets live in the cookie itself.
`GET /api/me` and `POST /api/token` require this cookie via the
`requireSession` middleware. `POST /api/logout` deletes the session
server-side and clears the cookie, so the old session ID can't be reused.

## 10. How JWT authentication works

`POST /api/token` (itself session-protected) issues a short-lived
(`JWT_TTL_MINUTES`, default 15m) HS256 JWT signed with `JWT_SECRET`,
containing the user ID and email as claims. `GET /api/protected` requires
`Authorization: Bearer <token>`; the `requireJwt` middleware verifies the
signature and expiry and rejects anything invalid or expired. This is
intentionally independent of the session cookie, to demonstrate both
mechanisms end-to-end.

## 11. Testing instructions

### Registration

1. Fill in the registration form; watch the password-strength meter and
   requirement checklist update live.
2. Submit — the backend logs the email OTP to its console. Enter it
   (try a wrong code first to see the attempts-remaining message).
3. Repeat for the mobile OTP.
4. Choose an MFA method:
   - **SMS/Email:** MFA is enabled immediately (channel already verified).
   - **Authenticator App:** scan the QR (or copy the setup key) into
     Google Authenticator/Authy, then enter the live 6-digit code.
5. Confirm the success screen, then continue to login.

### Login

1. Try an invalid password a few times to see the generic error, then five
   times in a row to trigger the temporary lockout.
2. Log in correctly, choose an MFA method, complete the OTP/TOTP challenge.
3. On the resulting dashboard, use the buttons to call `GET /api/me`,
   issue a JWT, and call `GET /api/protected` with it.
4. Log out and confirm `GET /api/me` is rejected afterward.

## 12. Vercel deployment

The whole app — frontend and backend — deploys as **one Vercel project**,
served from one domain. No separate frontend host, no separate backend
host.

**How it works:** `api/index.js` exposes the existing Express app
(`backend/server.js`) as a Vercel serverless function. `vercel.json` routes
`/api/*` requests to that function and everything else to the static files
under `frontend/`. The frontend already calls the API via a relative
`/api` path, so once both are on the same domain, everything just works —
no CORS configuration needed, no build step.

### Steps

1. **Push to GitHub** (make sure `backend/.env` is *not* included — check
   with `git status`; `.gitignore` already excludes it).
2. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import
   that repo.
3. Framework Preset: **Other**. Root Directory: **`.`** (the repo root —
   don't point it at `frontend/` or `backend/`). Build Command: leave
   empty/default (`vercel.json` handles routing; there's no build step).
   Install Command: `npm install` (default).
4. Under **Environment Variables**, add real values for at least:
   - `JWT_SECRET` — a long random string (generate one locally:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `SESSION_SECRET` — another random string, same way
   - `NODE_ENV` = `production`
   
   (`PORT`, `FRONTEND_URL`, and `DEBUG_EXPOSE_OTP` are not needed here —
   see the table in §6.)
5. **Deploy.** You'll get a URL like `https://secureid-yourname.vercel.app`.

### Post-deployment testing checklist

Open your deployed URL and verify, in order:

- [ ] `GET /` loads the SecureID UI (not a blank page or 404)
- [ ] CSS is styled correctly (not unstyled HTML) — confirms `/css/*` routing
- [ ] Browser devtools → Network tab shows `/js/app.js` etc. loading with
      HTTP 200 — confirms `/js/*` routing
- [ ] `GET /api/health` returns `{"status":"ok"}`
- [ ] Registering an account succeeds (`POST /api/register`)
- [ ] Because `DEBUG_EXPOSE_OTP` is unset in Vercel, OTPs won't show in the
      UI — open your **Vercel Dashboard → your project → Logs** tab to read
      the `[SIMULATED EMAIL]`/`[SIMULATED SMS]` lines instead, same idea as
      the local terminal
- [ ] Completing email OTP, mobile OTP, and an MFA method reaches the
      success screen
- [ ] Logging in, completing MFA, and reaching the dashboard works
- [ ] Dashboard's `/api/me` button shows your session
- [ ] Dashboard's "Get JWT" + "Call /api/protected" buttons both succeed
- [ ] Logout, then confirm `/api/me` is rejected afterward
- [ ] 5 wrong-password attempts trigger the lockout message

### A real limitation you should know about (not a bug I can fix by changing code)

This app's storage is in-memory (`Map`s in `backend/storage/`) — that's an
intentional, explicit choice for this assignment/demo, not an oversight.
On Vercel, each serverless function invocation *can* run on a fresh,
separate instance with its own empty memory — there's no guarantee two
requests hit the same running process. In practice, Vercel does keep a
function instance "warm" and reuses it for a stretch of consecutive
requests, so a normal register → verify OTP → login sequence done shortly
after another will usually work — but:

- **Data is not durable.** Everyone's accounts, sessions, and pending OTPs
  can vanish at any time (a deploy, a period of inactivity causing a cold
  start, Vercel recycling the instance, or simply enough concurrent traffic
  that a request lands on a different instance).
- This is **normal and expected** for this architecture, not a
  misconfiguration — the assignment's own guidelines explicitly call this
  out (§20 in the original spec) rather than requiring a database.
- **If you need data to actually persist** between requests reliably,
  that requires swapping the in-memory `Map`s in `backend/storage/` for a
  real external store (e.g. Vercel KV / Upstash Redis for sessions and OTP
  challenges, a Postgres database for users) — a real architecture change,
  not a config tweak, and intentionally out of scope for this deployment
  pass per the instructions given.

### Functionality that needed no changes at all

Everything else about the app — password hashing, OTP generation/hashing/
expiry/attempts, TOTP/authenticator setup, session cookies, JWT issuance
and validation, all API routes and their logic, the entire frontend UI and
flow — is completely untouched. Only five things changed, all purely about
*how the process starts and how requests get routed*, never *what the app
does*: `server.js` no longer calls `app.listen()` itself (moved to the new
`backend/local.js`), a new `api/index.js` re-exports that same app for
Vercel, dotenv now loads `backend/.env` by an absolute path instead of a
cwd-relative one (needed once `npm start` runs from the repo root instead
of from inside `backend/`), plus the new root `package.json` and
`vercel.json`.

## 13. Assumptions made

- In-memory storage is acceptable for this assignment (per the guidelines);
  the `storage/` layer isolates this so a real database can be swapped in
  later without touching routes or services.
- At login, the MFA method-selection screen offers Email OTP and SMS OTP
  regardless of which method was registered (since both channels are
  already verified), plus Authenticator App only if that's the method the
  user actually set up — matching the three-option UI in the login
  screenshots while staying consistent with what each user can actually
  complete.
- "Continue with Google" on the login screen is a visual element only (per
  the assignment's note that Google OAuth wasn't a stated requirement).
- The registration step indicator collapses steps 3 ("mobile") is folded
  into the numbering scheme shown in the screenshots (1 Details, 2 Email,
  3 Mobile, 4 MFA, 5 Success).

## 14. Differences between written guidelines and screenshots

None found requiring a tradeoff — the screenshots and the written guidelines
described the same flow and states; where the written guidelines were less
specific (e.g. exact MFA option copy, error wording), the screenshots were
used as the source of truth per the brief.
