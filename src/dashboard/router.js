const path = require('path');
const express = require('express');
const config = require('../config/env');
const logger = require('../utils/logger');
const { getSession, dashboardAuth, requestOtp, verifyOtp, logout } = require('./auth');
const service = require('./dashboard.service');

const publicDir = path.join(__dirname, 'public');

function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function dashboardHeaders(_req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
}

function apiHandler(fn) {
  return async (req, res, next) => {
    try {
      const data = await fn(req.query || {}, req);
      return res.json({ status: 'ok', ...data });
    } catch (error) {
      if (/Período inválido/.test(error.message)) {
        return res.status(400).json({ status: 'error', code: 'INVALID_PERIOD', message: error.message, requestId: req.requestId });
      }
      logger.error('Error API dashboard', { requestId: req.requestId, path: req.path, error: error.message });
      return next(error);
    }
  };
}

function registerDashboard(app) {
  if (!config.dashboard.enabled) return;

  const api = express.Router();
  api.use(noStore);

  api.post('/auth/request-otp', requestOtp);
  api.post('/auth/verify-otp', verifyOtp);
  api.post('/auth/logout', logout);
  api.get('/auth/me', (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ status: 'error', code: 'DASHBOARD_UNAUTHORIZED' });
    return res.json({ status: 'ok', user: { cedulaRuc: session.sub, nombre: session.name, correoElectronico: session.email, rol: session.role, exp: session.exp } });
  });

  api.use(dashboardAuth);
  api.get('/overview', apiHandler(async (q) => ({ overview: await service.overview(q.period) })));
  api.get('/solicitudes', apiHandler(async (q) => await service.solicitudes(q)));
  api.get('/comprobantes', apiHandler(async (q) => await service.comprobantes(q)));
  api.get('/eventos', apiHandler(async (q) => await service.eventos(q)));
  api.get('/caja-chica', apiHandler(async (q) => await service.cajaChica(q)));
  api.get('/docentes', apiHandler(async (q) => ({ data: await service.docentes(q) })));
  api.get('/ia', apiHandler(async (q) => await service.iaAnalisis(q)));
  api.get('/auditoria', apiHandler(async (q) => await service.auditoria(q)));
  api.get('/proveedores', apiHandler(async (q) => await service.proveedores(q)));
  api.get('/system', apiHandler(async () => ({ system: await service.systemStatus() })));

  app.use('/api/dashboard', api);
  app.use('/dashboard', dashboardHeaders, express.static(publicDir, {
    index: false,
    maxAge: config.server.env === 'production' ? '1h' : 0,
    etag: true,
    redirect: false,
  }));
  app.get('/dashboard', dashboardHeaders, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
  app.get('/dashboard/', dashboardHeaders, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

module.exports = { registerDashboard };
