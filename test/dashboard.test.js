const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { signSession, verifySession } = require('../src/dashboard/session');

const root = path.join(__dirname, '..');
const secret = '0123456789abcdef0123456789abcdef0123456789abcdef';
const allowed = ['contadora', 'director_general'];

test('sesión web firmada se verifica y detecta manipulación', () => {
  const now = 1_800_000_000;
  const token = signSession({ sub: '1712345678', role: 'contadora', exp: now + 3600 }, secret);
  const session = verifySession(token, secret, allowed, now);
  assert.equal(session.sub, '1712345678');
  assert.equal(session.role, 'contadora');
  assert.equal(verifySession(`${token}x`, secret, allowed, now), null);
});

test('sesión expirada o rol no permitido es rechazada', () => {
  const now = 1_800_000_000;
  const expired = signSession({ sub: '1', role: 'contadora', exp: now - 1 }, secret);
  const requester = signSession({ sub: '2', role: 'solicitante', exp: now + 3600 }, secret);
  assert.equal(verifySession(expired, secret, allowed, now), null);
  assert.equal(verifySession(requester, secret, allowed, now), null);
});

test('dashboard mantiene endpoints de consulta en modo solo lectura', () => {
  const source = fs.readFileSync(path.join(root, 'src/dashboard/router.js'), 'utf8');
  assert.match(source, /api\.get\('\/solicitudes'/);
  assert.match(source, /api\.get\('\/comprobantes'/);
  assert.match(source, /api\.get\('\/eventos'/);
  assert.match(source, /api\.get\('\/caja-chica'/);
  assert.match(source, /api\.get\('\/docentes'/);
  assert.match(source, /api\.get\('\/ia'/);
  assert.match(source, /api\.get\('\/auditoria'/);
  assert.doesNotMatch(source, /api\.(put|patch|delete)\(/);
});

test('dashboard publica interfaz web sin dependencias externas', () => {
  const html = fs.readFileSync(path.join(root, 'src/dashboard/public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'src/dashboard/public/app.js'), 'utf8');
  assert.match(html, /Dashboard de Pagos/);
  assert.match(html, /Solicitudes/);
  assert.match(html, /IA documental/);
  assert.match(js, /\/api\/dashboard/);
  assert.doesNotMatch(html, /https:\/\//);
});

test('configuración de dashboard existe con secreto, duración y roles', () => {
  const source = fs.readFileSync(path.join(root, 'src/config/env.js'), 'utf8');
  assert.match(source, /DASHBOARD_ENABLED/);
  assert.match(source, /DASHBOARD_SESSION_SECRET/);
  assert.match(source, /DASHBOARD_SESSION_HOURS/);
  assert.match(source, /DASHBOARD_ALLOWED_ROLES/);
  assert.match(source, /sessionSecret\.length < 32/);
});
