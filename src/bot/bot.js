const { Telegraf, session } = require("telegraf");
const config = require("../config/env");
const logger = require("../utils/logger");
const { authMiddleware } = require("./middlewares/auth.middleware");
const { auditoriaMiddleware } = require("./middlewares/auditoria.middleware");
const { idempotenciaUpdatesMiddleware } = require("./middlewares/idempotencia.middleware");
const { createSequelizeSessionStore } = require("../domains/runtime/sessionStore");

const bot = new Telegraf(config.telegram.botToken);

bot.use(idempotenciaUpdatesMiddleware());
bot.use(session({
  defaultSession: () => ({ flow: null, step: null, data: {}, usuario: null }),
  store: createSequelizeSessionStore({ ttlHours: config.session.ttlHours }),
}));

bot.use((ctx, next) => {
  logger.debug("Update de Telegram recibido", {
    updateId: ctx.update?.update_id,
    fromId: ctx.from?.id ? String(ctx.from.id) : null,
    updateType: ctx.updateType,
  });
  return next();
});

bot.use(authMiddleware());

bot.use(auditoriaMiddleware());

bot.catch((error, ctx) => {
  logger.error("Error procesando update de Telegram", {
    updateId: ctx?.update?.update_id,
    fromId: ctx?.from?.id ? String(ctx.from.id) : null,
    error: error.message,
  });

  if (config.telegram.mode === "webhook") throw error;
});

module.exports = bot;
