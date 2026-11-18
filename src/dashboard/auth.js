const crypto = require('crypto');
const config = require('../config/env');
const authService = require('../domains/autenticacion/auth.service');
const ErpReplica = require('../domains/erp/erpReplica.model');
const logger = require('../utils/logger');
const { signSession, verifySession } = require('./session');

const COOKIE_NAME = 'iti_dashboard_session';
const WEB_PREFIX = 'web:';

const attempts = new Map();

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function sign(payload) {
  return signSession(payload, config.dashboard.sessionSecret);
}

function verify(token) {
  return verifySession(token, config.dashboard.sessionSecret, config.dashboard.allowedRoles);
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx > 0) acc[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
      return acc;
    }, {});
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verify(cookies[COOKIE_NAME]);
}

function cookieHeader(token) {
  const maxAge = config.dashboard.sessionHours * 60 * 60;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function dashboardAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ status: 'error', code: 'DASHBOARD_UNAUTHORIZED', requestId: req.requestId });
  }
  req.dashboardUser = session;
  return next();
}

function rateLimitKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function canRequestOtp(req) {
  const key = rateLimitKey(req);
  const windowMs = 15 * 60 * 1000;
  const limit = 5;
  const now = Date.now();
  const entry = attempts.get(key) || { startedAt: now, count: 0 };
  if (now - entry.startedAt > windowMs) {
    attempts.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  attempts.set(key, entry);
  return true;
}

async function requestOtp(req, res) {
  if (!canRequestOtp(req)) {
    return res.status(429).json({ status: 'error', code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Intenta nuevamente en unos minutos.' });
  }

  const cedulaRuc = String(req.body?.cedulaRuc || '').trim();
  if (!/^\d{6,20}$/.test(cedulaRuc)) {
    return res.status(400).json({ status: 'error', code: 'INVALID_ID', message: 'Ingresa una cédula o RUC válido.' });
  }

  const persona = await authService.buscarEnErp(cedulaRuc);
  if (!persona || !config.dashboard.allowedRoles.includes(persona.rol)) {
    return res.status(403).json({ status: 'error', code: 'DASHBOARD_ROLE_NOT_ALLOWED', message: 'Tu usuario no tiene acceso al dashboard.' });
  }

  const challengeId = crypto.randomUUID();
  const telegramId = `${WEB_PREFIX}${challengeId}`;
  const result = await authService.generarYEnviarOtp({
    telegramId,
    cedulaRuc: persona.cedulaRuc,
    nombre: persona.nombre,
    correoElectronico: persona.correoElectronico,
  });

  return res.json({
    status: 'ok',
    challengeId,
    correoEnmascarado: result.correoEnmascarado,
    expiresInMinutes: authService.OTP_TTL_MINUTOS,
  });
}

async function verifyOtp(req, res) {
  const challengeId = String(req.body?.challengeId || '').trim();
  const otp = String(req.body?.otp || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ status: 'error', code: 'INVALID_OTP_REQUEST', message: 'Código o sesión inválidos.' });
  }

  const validation = await authService.validarOtp({
    telegramId: `${WEB_PREFIX}${challengeId}`,
    otpIngresado: otp,
  });

  if (!validation.valido) {
    return res.status(401).json({ status: 'error', code: 'OTP_INVALID', message: validation.motivo });
  }

  const persona = await ErpReplica.findByPk(validation.cedulaRuc);
  if (!persona || !persona.activo || !config.dashboard.allowedRoles.includes(persona.rol)) {
    return res.status(403).json({ status: 'error', code: 'DASHBOARD_ROLE_NOT_ALLOWED', message: 'Tu usuario no tiene acceso al dashboard.' });
  }

  const iat = nowSec();
  const exp = iat + config.dashboard.sessionHours * 60 * 60;
  const token = sign({
    sub: persona.cedulaRuc,
    name: persona.nombre,
    email: persona.correoElectronico,
    role: persona.rol,
    iat,
    exp,
  });

  res.setHeader('Set-Cookie', cookieHeader(token));
  logger.info('Inicio de sesión dashboard', { cedulaRuc: persona.cedulaRuc, rol: persona.rol });
  return res.json({ status: 'ok', user: { nombre: persona.nombre, rol: persona.rol } });
}

function logout(_req, res) {
  res.setHeader('Set-Cookie', clearCookieHeader());
  return res.json({ status: 'ok' });
}

module.exports = {
  COOKIE_NAME,
  getSession,
  dashboardAuth,
  requestOtp,
  verifyOtp,
  logout,
  sign,
  verify,
};
