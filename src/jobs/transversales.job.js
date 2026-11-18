const cron = require("node-cron");
const { Op } = require("sequelize");
const SolicitudPago = require("../domains/solicitudesPago/solicitudPago.model");
const EventoInstitucional = require("../domains/eventos/eventoInstitucional.model");
const ReembolsoCajaChica = require("../domains/cajaChica/reembolsoCajaChica.model");
const notificacionService = require("../domains/notificaciones/notificacion.service");
const { registrarAuditoria } = require("../domains/auditoria/auditoria.service");
const { runAsSystem } = require("../domains/auditoria/auditoria.context");
const recordatorios = require("../rules/recordatorios.rules");
const { fechaHoyISO, DEFAULT_TIMEZONE } = require("../utils/fechas");
const logger = require("../utils/logger");
const status = require("./status");

function listaIds(registros, max = 12) {
  const ids = registros.slice(0, max).map((r) => `#${r.id}`).join(", ");
  return registros.length > max ? `${ids}… (+${registros.length - max})` : ids;
}

async function recordatorioCorteMiercoles(bot, hoy) {
  if (!recordatorios.esMiercoles(hoy)) return 0;
  const pendientes = await SolicitudPago.findAll({
    where: { estado: { [Op.in]: ["pendiente", "pendiente_autorizacion_excepcional"] } },
    order: [["createdAt", "ASC"]],
  });
  let enviados = 0;
  const propietarios = new Map();
  for (const s of pendientes) {
    if (!propietarios.has(s.solicitanteTelegramId)) propietarios.set(s.solicitanteTelegramId, []);
    propietarios.get(s.solicitanteTelegramId).push(s);
  }
  for (const [telegramId, solicitudes] of propietarios) {
    const r = await notificacionService.enviarTelegram({
      bot,
      destinatarioTelegramId: telegramId,
      tipo: "recordatorio_corte_pagos",
      claveUnica: `corte-pagos:${hoy}:${telegramId}`,
      fechaObjetivo: hoy,
      mensaje:
        `⏰ Hoy miércoles es el corte para la programación de pagos del viernes. ` +
        `Tienes ${solicitudes.length} solicitud(es) aún sin completar/verificar: ${listaIds(solicitudes)}. ` +
        `Las que no queden completas hoy pasarán al siguiente ciclo.`,
    });
    if (r.enviado) enviados += 1;
  }
  const rc = await notificacionService.enviarPorRolUnaVez({
    bot,
    rol: "contadora",
    tipo: "recordatorio_corte_pagos",
    claveBase: `corte-pagos-contabilidad:${hoy}`,
    fechaObjetivo: hoy,
    mensaje:
      `⏰ Corte semanal de pagos: hoy miércoles. Hay ${pendientes.length} solicitud(es) pendientes de completar/verificar` +
      (pendientes.length ? `: ${listaIds(pendientes)}.` : "."),
  });
  return enviados + rc.enviados;
}

async function recordatorioViernesPago(bot, hoy) {
  if (!recordatorios.esViernes(hoy)) return 0;
  const pagos = await SolicitudPago.findAll({
    where: {
      fechaProgramadaPago: hoy,
      estado: { [Op.in]: ["verificada", "reporte_generado", "orden_transferencia", "aprobada"] },
    },
    order: [["id", "ASC"]],
  });
  if (!pagos.length) return 0;
  const mensaje =
    `💰 Día de pago: hay ${pagos.length} solicitud(es) programadas para hoy: ${listaIds(pagos)}. ` +
    `Revisa que hayan completado reporte, orden y aprobaciones antes de marcar el pago.`;
  const c = await notificacionService.enviarPorRolUnaVez({
    bot, rol: "colecturia", tipo: "recordatorio_dia_pago", claveBase: `dia-pago:${hoy}:colecturia`, fechaObjetivo: hoy, mensaje,
  });
  const a = await notificacionService.enviarPorRolUnaVez({
    bot, rol: "contadora", tipo: "recordatorio_dia_pago", claveBase: `dia-pago:${hoy}:contadora`, fechaObjetivo: hoy, mensaje,
  });
  return c.enviados + a.enviados;
}

async function recordatoriosCierres(bot, hoy) {
  const evalCierres = recordatorios.evaluarRecordatoriosCierres(hoy);
  let enviados = 0;
  if (evalCierres.recordarContable) {
    const texto = evalCierres.diasContable === 0 ? "hoy" : `en ${evalCierres.diasContable} día(s)`;
    const r = await notificacionService.enviarATodosUnaVez({
      bot,
      tipo: "recordatorio_cierre_contable",
      claveBase: `cierre-contable:${hoy}`,
      fechaObjetivo: evalCierres.cierreContable,
      mensaje:
        `📅 Recordatorio de cierre contable: el período cierra ${texto}, el ${evalCierres.cierreContable}. ` +
        `Asegura el envío y corrección de facturas/documentos dentro del plazo establecido.`,
    });
    enviados += r.enviados;
  }
  if (evalCierres.recordarCaja) {
    const texto = evalCierres.diasCaja === 0 ? "hoy" : `en ${evalCierres.diasCaja} día(s)`;
    const r = await notificacionService.enviarATodosUnaVez({
      bot,
      tipo: "recordatorio_caja_chica",
      claveBase: `cierre-caja:${hoy}`,
      fechaObjetivo: evalCierres.cierreCaja,
      mensaje:
        `🧾 Recordatorio de Caja Chica: el plazo de presentación vence ${texto}, el ${evalCierres.cierreCaja}. ` +
        `Lo presentado después se procesa en el siguiente período contable.`,
    });
    enviados += r.enviados;
  }
  return enviados;
}

async function recordatoriosEventos(bot, hoy) {
  const eventos = await EventoInstitucional.findAll({
    where: {
      fechaEvento: { [Op.gte]: hoy },
      estado: { [Op.in]: ["pendiente_revision", "observado", "aprobado_programacion"] },
    },
    order: [["fechaEvento", "ASC"]],
  });
  let enviados = 0;
  for (const e of eventos) {
    if (!recordatorios.debeRecordarEvento({ fechaReferencia: hoy, fechaEvento: e.fechaEvento, estado: e.estado })) continue;
    const dias = recordatorios.diasHasta(hoy, e.fechaEvento);
    const vinculadas = await SolicitudPago.count({ where: { eventoInstitucionalId: e.id } });
    let mensaje;
    if (e.estado === "aprobado_programacion" && vinculadas === 0) {
      mensaje = `📌 El evento #${e.id} (${e.nombre}) es el ${e.fechaEvento} (${dias} día(s)) y está aprobado, pero aún no tiene solicitudes de pago vinculadas. Usa /solicitudevento ${e.id} si corresponde.`;
    } else if (e.estado !== "aprobado_programacion") {
      mensaje = `⚠️ El evento #${e.id} (${e.nombre}) es el ${e.fechaEvento} (${dias} día(s)) y sigue en estado ${e.estado}. Revisa su planificación financiera.`;
    } else {
      continue;
    }
    const owner = await notificacionService.enviarTelegram({
      bot,
      destinatarioTelegramId: e.solicitanteTelegramId,
      tipo: "recordatorio_evento",
      claveUnica: `evento:${e.id}:${hoy}:${e.solicitanteTelegramId}`,
      entidad: "EventoInstitucional",
      entidadId: e.id,
      fechaObjetivo: e.fechaEvento,
      mensaje,
    });
    if (owner.enviado) enviados += 1;
    const c = await notificacionService.enviarPorRolUnaVez({
      bot,
      rol: "contadora",
      tipo: "recordatorio_evento",
      claveBase: `evento:${e.id}:${hoy}:contadora`,
      entidad: "EventoInstitucional",
      entidadId: e.id,
      fechaObjetivo: e.fechaEvento,
      mensaje,
    });
    enviados += c.enviados;
  }
  return enviados;
}

async function recordatorioCajaAprobada(bot, hoy) {
  const periodo = hoy.slice(0, 7);
  const pendientes = await ReembolsoCajaChica.findAll({
    where: { estado: "aprobado", periodoProcesamiento: { [Op.lte]: periodo } },
    order: [["createdAt", "ASC"]],
  });
  if (!pendientes.length) return 0;
  const r = await notificacionService.enviarPorRolUnaVez({
    bot,
    rol: "colecturia",
    tipo: "recordatorio_caja_chica",
    claveBase: `caja-aprobada:${hoy}`,
    fechaObjetivo: hoy,
    mensaje: `🧾 Hay ${pendientes.length} reembolso(s) de Caja Chica aprobados y disponibles para procesar: ${listaIds(pendientes)}.`,
  });
  return r.enviados;
}

async function ejecutarRecordatoriosTransversales(bot, hoy = fechaHoyISO()) {
  return runAsSystem(async () => {
    const resultado = {
      corte: await recordatorioCorteMiercoles(bot, hoy),
      pagos: await recordatorioViernesPago(bot, hoy),
      cierres: await recordatoriosCierres(bot, hoy),
      eventos: await recordatoriosEventos(bot, hoy),
      caja: await recordatorioCajaAprobada(bot, hoy),
    };
    const total = Object.values(resultado).reduce((a, b) => a + b, 0);
    if (total) {
      await registrarAuditoria({
        entidad: "Automatizacion",
        entidadId: hoy,
        accion: "RECORDATORIOS_DIARIOS",
        detalle: { ...resultado, total },
      });
    }
    return { ...resultado, total };
  }, { nombre: "Job recordatorios", rol: "sistema" });
}

function iniciarJobTransversal(bot) {
  const schedule = "10 8 * * *";
  status.registrarProgramado("recordatorios_transversales", schedule);
  const task = cron.schedule(schedule, async () => {
    const nombre = "recordatorios_transversales";
    status.registrarInicio(nombre, schedule);
    try {
      const resultado = await ejecutarRecordatoriosTransversales(bot);
      status.registrarExito(nombre, resultado);
      logger.info("Recordatorios transversales procesados", resultado);
    } catch (error) {
      status.registrarError(nombre, error);
      logger.error("Error en recordatorios transversales", { error: error.message, stack: error.stack });
    }
  }, { timezone: DEFAULT_TIMEZONE });
  logger.info("Job de recordatorios transversales iniciado", { schedule, timezone: DEFAULT_TIMEZONE });
  return task;
}

module.exports = {
  iniciarJobTransversal,
  ejecutarRecordatoriosTransversales,
  recordatorioCorteMiercoles,
  recordatorioViernesPago,
  recordatoriosCierres,
  recordatoriosEventos,
  recordatorioCajaAprobada,
};
