const { Op } = require('sequelize');
const SolicitudPago = require('../domains/solicitudesPago/solicitudPago.model');
const Comprobante = require('../domains/comprobantes/comprobante.model');
const Proveedor = require('../domains/proveedores/proveedor.model');
const EventoInstitucional = require('../domains/eventos/eventoInstitucional.model');
const ReembolsoCajaChica = require('../domains/cajaChica/reembolsoCajaChica.model');
const RolPagoDocentes = require('../domains/docentes/rolPago.model');
const FacturaDocente = require('../domains/docentes/facturaDocente.model');
const Docente = require('../domains/docentes/docente.model');
const AnalisisIA = require('../domains/ia/analisisIA.model');
const AuditoriaEvento = require('../domains/auditoria/auditoriaEvento.model');
const Notificacion = require('../domains/notificaciones/notificacion.model');
const TelegramUpdate = require('../domains/runtime/telegramUpdate.model');
const { generarResumenOperativo } = require('../domains/reportes/reporteOperativo.service');
const { normalizarPeriodo, limitesPeriodoDateOnly, limitesPeriodoUtcEcuador } = require('../rules/reportes.rules');
const jobStatus = require('../jobs/status');
const { getRuntimeState } = require('../config/runtimeState');

function pageArgs(input = {}) {
  const page = Math.max(1, Number.parseInt(input.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(5, Number.parseInt(input.limit || '25', 10) || 25));
  return { page, limit, offset: (page - 1) * limit };
}

function paged({ count, rows }, page, limit) {
  return {
    items: rows,
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.max(1, Math.ceil(count / limit)),
    },
  };
}

function textSearch(search, fields) {
  const value = String(search || '').trim();
  if (!value) return null;
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.like]: `%${value}%` } })) };
}

function datePeriod(period, field, kind = 'dateonly') {
  if (!period) return {};
  const p = normalizarPeriodo(period);
  if (kind === 'timestamp') {
    const { inicio, finExclusivo } = limitesPeriodoUtcEcuador(p);
    return { [field]: { [Op.gte]: inicio, [Op.lt]: finExclusivo } };
  }
  const { inicio, finExclusivo } = limitesPeriodoDateOnly(p);
  return { [field]: { [Op.gte]: inicio, [Op.lt]: finExclusivo } };
}

function cleanDecimal(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

async function latestIaFor(entidadTipo, ids) {
  if (!ids.length) return new Map();
  const rows = await AnalisisIA.findAll({
    where: { entidadTipo, entidadId: { [Op.in]: ids }, tipoAnalisis: 'documento' },
    order: [['createdAt', 'DESC']],
  });
  const map = new Map();
  for (const row of rows) {
    const r = plain(row);
    if (!map.has(Number(r.entidadId))) {
      map.set(Number(r.entidadId), {
        id: r.id,
        estado: r.estado,
        confianza: cleanDecimal(r.confianza),
        recomendacion: r.recomendacion,
        alertas: Array.isArray(r.alertas) ? r.alertas.length : 0,
        proveedor: r.proveedor,
        modelo: r.modelo,
        createdAt: r.createdAt,
      });
    }
  }
  return map;
}

async function overview(periodInput) {
  const period = normalizarPeriodo(periodInput);
  const report = await generarResumenOperativo(period);
  const utc = limitesPeriodoUtcEcuador(period);

  const [iaTotal, iaErrores, iaRevisar, proveedores, auditorias, notifFallidas, updatesFallidos] = await Promise.all([
    AnalisisIA.count({ where: { createdAt: { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo } } }),
    AnalisisIA.count({ where: { createdAt: { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo }, estado: 'error' } }),
    AnalisisIA.count({ where: { createdAt: { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo }, recomendacion: 'revisar' } }),
    Proveedor.count(),
    AuditoriaEvento.count({ where: { createdAt: { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo } } }),
    Notificacion.count({ where: { creadoEn: { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo }, estado: 'error' } }),
    TelegramUpdate.count({ where: { createdAt: { [Op.gte]: utc.inicio, [Op.lt]: utc.finExclusivo }, status: 'failed' } }),
  ]);

  return {
    ...report,
    ia: { total: iaTotal, errores: iaErrores, revisar: iaRevisar },
    maestros: { proveedores },
    trazabilidad: { auditorias },
    operacion: { ...report.operacion, notificacionesFallidas: notifFallidas, telegramUpdatesFallidos: updatesFallidos },
  };
}

async function solicitudes(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = { ...datePeriod(params.period, 'fechaSolicitud') };
  if (params.estado) where.estado = params.estado;
  if (params.tipo) where.tipo = params.tipo;
  const search = textSearch(params.search, ['solicitanteNombre', 'justificacion', 'motivoRechazo']);
  if (search) Object.assign(where, search);

  const result = await SolicitudPago.findAndCountAll({
    where,
    attributes: [
      'id', 'tipo', 'estado', 'fechaSolicitud', 'fechaDesembolsoRequerida', 'fechaCompleta',
      'fechaProgramadaPago', 'alcanzoCorteSemanal', 'motivoReprogramacion', 'justificacion',
      'montoAproximado', 'solicitanteNombre', 'autorizacionExcepcional',
      'autorizadoExcepcionalPorNombre', 'fechaAutorizacionExcepcional',
      'aprobadoCoordinadorGeneral', 'aprobadoCashManagement', 'eventoInstitucionalId',
      'createdAt', 'updatedAt',
    ],
    order: [['id', 'DESC']],
    offset,
    limit,
  });

  const ids = result.rows.map((r) => r.id);
  const docs = ids.length ? await Comprobante.findAll({
    where: { solicitudPagoId: { [Op.in]: ids } },
    attributes: ['solicitudPagoId', 'estadoValidacion', 'documentacionCompleta', 'reconocidoParaPago'],
  }) : [];
  const docsBySolicitud = new Map();
  for (const d0 of docs) {
    const d = plain(d0);
    const k = Number(d.solicitudPagoId);
    const agg = docsBySolicitud.get(k) || { total: 0, validados: 0, pendientes: 0 };
    agg.total += 1;
    if (d.estadoValidacion === 'validado') agg.validados += 1;
    if (['pendiente_revision', 'pendiente_liquidacion', 'correccion_requerida'].includes(d.estadoValidacion)) agg.pendientes += 1;
    docsBySolicitud.set(k, agg);
  }

  result.rows = result.rows.map((row) => {
    const r = plain(row);
    return { ...r, montoAproximado: cleanDecimal(r.montoAproximado), documentos: docsBySolicitud.get(r.id) || { total: 0, validados: 0, pendientes: 0 } };
  });
  return paged(result, page, limit);
}

async function comprobantes(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = { ...datePeriod(params.period, 'fechaEnvio') };
  if (params.estado) where.estadoValidacion = params.estado;
  if (params.tipo) where.tipo = params.tipo;
  if (params.solicitudId) where.solicitudPagoId = Number(params.solicitudId);
  const search = textSearch(params.search, ['solicitanteNombre', 'proveedorCedula', 'observacionValidacion', 'motivoNoReconocimiento']);
  if (search) Object.assign(where, search);

  const result = await Comprobante.findAndCountAll({
    where,
    attributes: [
      'id', 'solicitudPagoId', 'tipo', 'fechaCompra', 'fechaEnvio', 'cumplePoliticaAutomatica',
      'reconocidoParaPago', 'documentacionCompleta', 'cumplePlazoEnvio', 'cumpleCierreContable',
      'fechaLimiteCierre', 'motivoNoReconocimiento', 'estadoValidacion', 'observacionValidacion',
      'validadoPorNombre', 'fechaValidacion', 'esCompraTarjetaInstitucional', 'esCompraInternet',
      'solicitanteNombre', 'createdAt', 'updatedAt',
    ],
    order: [['id', 'DESC']],
    offset,
    limit,
  });

  const ids = result.rows.map((r) => r.id);
  const iaMap = await latestIaFor('comprobante', ids);
  result.rows = result.rows.map((row) => ({ ...plain(row), ia: iaMap.get(row.id) || null }));
  return paged(result, page, limit);
}

async function eventos(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = { ...datePeriod(params.period, 'fechaPresentacion') };
  if (params.estado) where.estado = params.estado;
  const search = textSearch(params.search, ['nombre', 'unidadOrganizadora', 'solicitanteNombre', 'descripcion']);
  if (search) Object.assign(where, search);
  const result = await EventoInstitucional.findAndCountAll({
    where,
    attributes: ['id', 'tipo', 'nombre', 'unidadOrganizadora', 'fechaPresentacion', 'fechaEvento', 'montoEstimado', 'diasAnticipacion', 'cumpleAnticipacion', 'estado', 'observacionRevision', 'revisadoPorNombre', 'solicitanteNombre', 'createdAt'],
    order: [['id', 'DESC']], offset, limit,
  });
  result.rows = result.rows.map((row) => { const r = plain(row); return { ...r, montoEstimado: cleanDecimal(r.montoEstimado) }; });
  return paged(result, page, limit);
}

async function cajaChica(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = {};
  if (params.period) where.periodoPresentacion = normalizarPeriodo(params.period);
  if (params.estado) where.estado = params.estado;
  const search = textSearch(params.search, ['descripcion', 'solicitanteNombre', 'observacionRevision']);
  if (search) Object.assign(where, search);
  const result = await ReembolsoCajaChica.findAndCountAll({
    where,
    attributes: ['id', 'descripcion', 'montoTotal', 'fechaPresentacion', 'fechaLimite', 'periodoPresentacion', 'periodoProcesamiento', 'dentroPlazo', 'diferido', 'motivoDiferimiento', 'estado', 'revisadoPorNombre', 'fechaReembolso', 'solicitanteNombre', 'createdAt'],
    order: [['id', 'DESC']], offset, limit,
  });
  result.rows = result.rows.map((row) => { const r = plain(row); return { ...r, montoTotal: cleanDecimal(r.montoTotal) }; });
  return paged(result, page, limit);
}

async function docentes(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const roleWhere = params.period ? { periodo: normalizarPeriodo(params.period) } : {};
  const roles = await RolPagoDocentes.findAll({ where: roleWhere, order: [['id', 'DESC']], limit: 50 });
  const rolIds = roles.map((r) => r.id);
  const facturaWhere = rolIds.length ? { rolPagoId: { [Op.in]: rolIds } } : { rolPagoId: -1 };
  if (params.estado) facturaWhere.estado = params.estado;
  const facturas = await FacturaDocente.findAndCountAll({ where: facturaWhere, order: [['id', 'DESC']], offset, limit });
  const cedulas = [...new Set(facturas.rows.map((f) => f.docenteCedula))];
  const docentesRows = cedulas.length ? await Docente.findAll({ where: { cedula: { [Op.in]: cedulas } }, attributes: ['cedula', 'nombre', 'correoElectronico', 'gradoProfesional'] }) : [];
  const docenteMap = new Map(docentesRows.map((d) => [d.cedula, plain(d)]));
  const iaMap = await latestIaFor('factura_docente', facturas.rows.map((r) => r.id));

  return {
    roles: roles.map((r) => plain(r)),
    facturas: paged({ count: facturas.count, rows: facturas.rows.map((row) => {
      const f = plain(row);
      return {
        id: f.id, rolPagoId: f.rolPagoId, docenteCedula: f.docenteCedula,
        docente: docenteMap.get(f.docenteCedula) || null,
        conceptoSolicitado: f.conceptoSolicitado, montoSolicitado: cleanDecimal(f.montoSolicitado),
        fechaSolicitudFactura: f.fechaSolicitudFactura, fechaLimiteFactura: f.fechaLimiteFactura,
        fechaRecepcionFactura: f.fechaRecepcionFactura, numeroFactura: f.numeroFactura,
        montoFactura: cleanDecimal(f.montoFactura), conceptoCoincide: f.conceptoCoincide,
        montoCoincide: f.montoCoincide, elegiblePagoFinSemestre: f.elegiblePagoFinSemestre,
        correoEstado: f.correoEstado, estado: f.estado, observacion: f.observacion,
        pagadaEnCierreSemestre: f.pagadaEnCierreSemestre, createdAt: f.createdAt,
        ia: iaMap.get(f.id) || null,
      };
    }) }, page, limit),
  };
}

async function iaAnalisis(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = { ...datePeriod(params.period, 'createdAt', 'timestamp') };
  if (params.estado) where.estado = params.estado;
  if (params.recomendacion) where.recomendacion = params.recomendacion;
  if (params.entidadTipo) where.entidadTipo = params.entidadTipo;
  const result = await AnalisisIA.findAndCountAll({
    where,
    attributes: ['id', 'entidadTipo', 'entidadId', 'tipoAnalisis', 'proveedor', 'modelo', 'estado', 'confianza', 'recomendacion', 'alertas', 'error', 'actorNombre', 'createdAt'],
    order: [['id', 'DESC']], offset, limit,
  });
  result.rows = result.rows.map((row) => { const r = plain(row); return { ...r, confianza: cleanDecimal(r.confianza), alertasCount: Array.isArray(r.alertas) ? r.alertas.length : 0 }; });
  return paged(result, page, limit);
}

async function auditoria(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = { ...datePeriod(params.period, 'createdAt', 'timestamp') };
  if (params.entidad) where.entidad = params.entidad;
  if (params.origen) where.origen = params.origen;
  const search = textSearch(params.search, ['accion', 'actorNombre', 'actorRol', 'entidad', 'entidadId']);
  if (search) Object.assign(where, search);
  const result = await AuditoriaEvento.findAndCountAll({
    where,
    attributes: ['id', 'entidad', 'entidadId', 'accion', 'estadoAnterior', 'estadoNuevo', 'actorNombre', 'actorRol', 'origen', 'detalle', 'createdAt'],
    order: [['id', 'DESC']], offset, limit,
  });
  result.rows = result.rows.map(plain);
  return paged(result, page, limit);
}

async function proveedores(params = {}) {
  const { page, limit, offset } = pageArgs(params);
  const where = {};
  const search = textSearch(params.search, ['nombreTitularCuenta', 'rucCedula', 'institucionFinanciera', 'correoElectronico']);
  if (search) Object.assign(where, search);
  const result = await Proveedor.findAndCountAll({
    where,
    attributes: ['id', 'nombreTitularCuenta', 'rucCedula', 'institucionFinanciera', 'tipoCuenta', 'correoElectronico', 'createdAt'],
    order: [['id', 'DESC']], offset, limit,
  });
  result.rows = result.rows.map(plain);
  return paged(result, page, limit);
}

async function systemStatus() {
  const runtime = getRuntimeState();
  return {
    runtime,
    jobs: jobStatus.obtenerEstados(),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  overview,
  solicitudes,
  comprobantes,
  eventos,
  cajaChica,
  docentes,
  iaAnalisis,
  auditoria,
  proveedores,
  systemStatus,
};
