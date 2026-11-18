const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signSession(payload, secret) {
  if (!secret) throw new Error('Session secret requerido');
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySession(token, secret, allowedRoles = [], nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!token || !secret) return null;
  const [encoded, signature] = String(token).split('.');
  if (!encoded || !signature) return null;

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= nowSeconds) return null;
    if (allowedRoles.length && !allowedRoles.includes(payload.role)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = { signSession, verifySession };
