const cron = require("node-cron");
const { Op } = require("sequelize");
const BotSession = require("../domains/runtime/botSession.model");
const TelegramUpdate = require("../domains/runtime/telegramUpdate.model");
const config = require("../config/env");
const logger = require("../utils/logger");
const { DEFAULT_TIMEZONE } = require("../utils/fechas");
const jobStatus = require("./status");

async function limpiarRuntime() {
  const now = new Date();
  const retentionMs = config.telegram.updateRetentionDays * 24 * 60 * 60 * 1000;
  const updatesBefore = new Date(now.getTime() - retentionMs);

  const sesiones = await BotSession.destroy({ where: { expiresAt: { [Op.lt]: now } } });
  const updates = await TelegramUpdate.destroy({
    where: {
      updatedAt: { [Op.lt]: updatesBefore },
      status: { [Op.in]: ["completed", "failed"] },
    },
  });

  logger.info("Limpieza de runtime completada", { sesionesEliminadas: sesiones, updatesEliminados: updates });
  return { sesiones, updates };
}

function iniciarJobRuntime() {
  const nombre = "limpieza_runtime";
  const schedule = "30 3 * * *";
  jobStatus.registrarProgramado(nombre, schedule);

  const job = cron.schedule(schedule, async () => {
    jobStatus.registrarInicio(nombre, schedule);
    try {
      const result = await limpiarRuntime();
      jobStatus.registrarExito(nombre, result);
    } catch (error) {
      logger.error("Error en limpieza de runtime", { error: error.message });
      jobStatus.registrarError(nombre, error);
    }
  }, { timezone: DEFAULT_TIMEZONE });

  return [job];
}

module.exports = { iniciarJobRuntime, limpiarRuntime };
