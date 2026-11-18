const { runWithActor } = require("../../domains/auditoria/auditoria.context");
const { registrarAuditoria } = require("../../domains/auditoria/auditoria.service");
const { nombreComando } = require("../../domains/auditoria/auditoria.utils");

function auditoriaMiddleware() {
  return async (ctx, next) => {
    const usuario = ctx.state.usuario;
    if (!usuario || !ctx.from) return next();

    const actor = {
      telegramId: String(ctx.from.id),
      nombre: usuario.nombre,
      rol: usuario.rol,
      origen: "telegram",
    };

    return runWithActor(actor, async () => {
      const comando = nombreComando(ctx.message?.text);
      if (comando) {
        await registrarAuditoria({
          entidad: "Bot",
          entidadId: comando,
          accion: "COMANDO",
          detalle: { comando: `/${comando}` },
        });
      }
      return next();
    });
  };
}

module.exports = { auditoriaMiddleware };
