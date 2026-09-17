// Local development only. `backend/server.js` just builds and exports the
// Express app (no listening) so the exact same app object can be handed to
// Vercel's serverless runtime via api/index.js. This file is what actually
// binds a port when you run the app on your own machine.
//
// (server.js itself loads backend/.env by absolute path, so requiring it
// below already has environment variables in place before PORT is read.)
const app = require('./server');

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SecureID running at http://localhost:${PORT}`);
});
