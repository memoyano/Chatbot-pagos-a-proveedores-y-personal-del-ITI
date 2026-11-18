const cron = require("node-cron");
const { Op } = require("sequelize");
const Notificacion = require("../domains/notificaciones/notificacion.model");
const TelegramUpdate = require("../domains/runtime/telegramUpdate.model");
const notificacionService = require("../domains/notificaciones/notificacion.service");
const { fechaHoyISO, DEFAULT_TIMEZONE } = require("../utils/fechas");
const { evaluarSaludOperativa, mensajeSaludOperativa } = require("../rules/operacion.rules");
const status = require("./status");
const logger = require("../utils/logger");

function hace24Horas(ahora = new Date()) {
  return new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
}

async function revisarSaludOperativa(bot, ahora = new Date()) {
  const desde = hace24Horas(ahora);
  const [notificacionesFallidas, telegramUpdatesFallidos] = await Promise.all([
    Notificacion.count({ where: { estado: "error", creadoEn: { [Op.gte]: desde } } }),
    TelegramUpdate.count({ where: { status: "failed", updatedAt: { [Op.gte]: desde } } }),
  ]);

  const resultado = evaluarSaludOperativa({
    notificacionesFallidas,
    telegramUpdatesFallidos,
    jobs: status.obtenerEstados().filter((j) => j.nombre !== "salud_operativa"),
  });
  if (!resultado.alertar) return { ...resultado, enviados: 0 };

  const hoy = fechaHoyISO(DEFAULT_TIMEZONE, ahora);
  const mensaje = mensajeSaludOperativa(resultado);
  let enviados = 0;
  for (const rol of ["contadora", "director_general"]) {
    const r = await notificacionService.enviarPorRolUnaVez({
      bot,
      rol,
      tipo: "alerta_operativa",
      claveBase: `salud-operativa:${hoy}:${rol}`,
      fechaObjetivo: hoy,
      mensaje,
    });
    enviados += r.enviados;
  }
  return { ...resultado, enviados };
}

function iniciarJobOperacion(bot) {
  const schedule = "20 * * * *";
  const nombre = "salud_operativa";
  status.registrarProgramado(nombre, schedule);
  const task = cron.schedule(schedule, async () => {
    status.registrarInicio(nombre, schedule);
    try {
      const resultado = await revisarSaludOperativa(bot);
      status.registrarExito(nombre, resultado);
      if (resultado.alertar) logger.warn("Salud operativa requiere atención", resultado);
    } catch (error) {
      status.registrarError(nombre, error);
      logger.error("Error en job de salud operativa", { error: error.message, stack: error.stack });
    }
  }, { timezone: DEFAULT_TIMEZONE });
  logger.info("Job de salud operativa iniciado", { schedule, timezone: DEFAULT_TIMEZONE });
  return task;
}

module.exports = { hace24Horas, revisarSaludOperativa, iniciarJobOperacion };
