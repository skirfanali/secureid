const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const ISSUER = 'SecureID';

// Give a little clock-drift tolerance (1 step each way ~ 30s) without
// making the code valid for longer than the UI's stated window.
authenticator.options = { window: 1, step: 30 };

function generateSecret() {
  return authenticator.generateSecret();
}

function buildOtpAuthUri(secret, email) {
  return authenticator.keyuri(email, ISSUER, secret);
}

async function generateQrCodeDataUrl(otpAuthUri) {
  return QRCode.toDataURL(otpAuthUri);
}

function verifyToken(token, secret) {
  try {
    return authenticator.verify({ token: String(token || ''), secret });
  } catch {
    return false;
  }
}

module.exports = { generateSecret, buildOtpAuthUri, generateQrCodeDataUrl, verifyToken, ISSUER };
