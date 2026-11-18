const config = require("../../config/env");
const TelegramUpdate = require("../../domains/runtime/telegramUpdate.model");
const logger = require("../../utils/logger");
const { leaseExpirado } = require("../../rules/runtime.rules");

function idempotenciaUpdatesMiddleware({ model = TelegramUpdate, now = () => new Date() } = {}) {
  return async (ctx, next) => {
    const updateId = ctx.update?.update_id;
    if (updateId === undefined || updateId === null) return next();

    const currentNow = now();
    let row;
    let created = false;

    try {
      [row, created] = await model.findOrCreate({
        where: { updateId },
        defaults: { updateId, status: "processing", attempts: 1, lockedAt: currentNow },
      });
    } catch (error) {
      logger.error("No fue posible registrar idempotencia de update", { updateId, error: error.message });
      throw error;
    }

    if (!created) {
      if (row.status === "completed") {
        logger.info("Update de Telegram duplicado omitido", { updateId });
        return;
      }

      if (row.status === "processing" && !leaseExpirado(row.lockedAt, config.telegram.updateLeaseSeconds, currentNow)) {
        logger.info("Update de Telegram ya está en procesamiento", { updateId });
        return;
      }

      await row.update({
        status: "processing",
        attempts: Number(row.attempts || 0) + 1,
        lockedAt: currentNow,
        lastError: null,
      });
    }

    try {
      await next();
      await row.update({ status: "completed", processedAt: now(), lastError: null });
    } catch (error) {
      await row.update({
        status: "failed",
        lastError: String(error.message || error).slice(0, 1000),
      });
      throw error;
    }
  };
}

module.exports = { idempotenciaUpdatesMiddleware, leaseExpirado };
