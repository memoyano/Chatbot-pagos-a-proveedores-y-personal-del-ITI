const solicitudService = require("../../domains/solicitudesPago/solicitudPago.service");
const { requireRol } = require("../middlewares/auth.middleware");
const { notificarPorRol, notificarATelegramId } = require("../../utils/notificaciones");
const { fechaHoyISO } = require("../../utils/fechas");
const { ROLES_AUTORIDAD_EXCEPCIONAL } = require("../../config/roles");

function extraerId(ctx) {
  const partes = ctx.message.text.trim().split(/\s+/);
  const id = Number(partes[1]);
  return Number.isInteger(id) ? id : null;
}

function extraerMotivoDesdeTercerParametro(ctx) {
  return ctx.message.text.trim().split(/\s+/).slice(2).join(" ").trim();
}

function responderError(ctx, comando) {
  return ctx.reply(`Uso correcto: ${comando} <número de solicitud>\nEj: ${comando} 12`);
}

function registerAprobacionPagoFlow(bot) {
  // La política indica autorización por "Autoridades de la Institución", sin cargo concreto.
  bot.command(
    "autorizarexcepcional",
    requireRol(...ROLES_AUTORIDAD_EXCEPCIONAL),
    async (ctx) => {
      const id = extraerId(ctx);
      if (!id) return responderError(ctx, "/autorizarexcepcional");

      const { solicitud, error } = await solicitudService.resolverAutorizacionExcepcional(id, {
        autorizado: true,
        autoridadTelegramId: String(ctx.from.id),
        autoridadNombre: ctx.state.usuario.nombre,
      });
      if (error) return ctx.reply(`⚠️ ${error}`);

      await notificarATelegramId(
        bot,
        solicitud.solicitanteTelegramId,
        `✅ Tu solicitud excepcional #${id} fue autorizada y pasó a revisión de Contabilidad.`
      );
      return ctx.reply(`✅ Solicitud excepcional #${id} autorizada.`);
    }
  );

  bot.command(
    "rechazarexcepcional",
    requireRol(...ROLES_AUTORIDAD_EXCEPCIONAL),
    async (ctx) => {
      const id = extraerId(ctx);
      if (!id) return responderError(ctx, "/rechazarexcepcional");
      const motivo = extraerMotivoDesdeTercerParametro(ctx);
      if (!motivo) {
        return ctx.reply(
          "Uso correcto: /rechazarexcepcional <id> <motivo>\nEj: /rechazarexcepcional 12 No cuenta con autorización presupuestaria."
        );
      }

      const { solicitud, error } = await solicitudService.resolverAutorizacionExcepcional(id, {
        autorizado: false,
        autoridadTelegramId: String(ctx.from.id),
        autoridadNombre: ctx.state.usuario.nombre,
        motivoRechazo: motivo,
      });
      if (error) return ctx.reply(`⚠️ ${error}`);

      await notificarATelegramId(
        bot,
        solicitud.solicitanteTelegramId,
        `❌ Tu solicitud excepcional #${id} fue rechazada. Motivo: ${solicitud.motivoRechazo}`
      );
      return ctx.reply(`✅ Rechazo de la solicitud excepcional #${id} registrado.`);
    }
  );

  // 1. Contadora confirma que la solicitud y la documentación están completas.
  bot.command("verificar", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return responderError(ctx, "/verificar");

    const { solicitud, error, programacion } = await solicitudService.verificarCompra(id, fechaHoyISO());
    if (error) return ctx.reply(`⚠️ ${error}`);

    let detalle = `✅ Solicitud #${id} verificada. Pago programado: ${solicitud.fechaProgramadaPago}.`;
    if (programacion.alcanzoCorteSemanal === false) {
      detalle += "\n⚠️ Quedó completa después del corte del miércoles y pasó al siguiente ciclo.";
    } else if (programacion.alcanzoCorteSemanal === null) {
      detalle += "\n🚨 Se mantiene la fecha del mismo día por autorización excepcional.";
    }
    if (programacion.motivoReprogramacion) {
      detalle += `\n${programacion.motivoReprogramacion}`;
    }
    detalle += `\nYa puedes generar el reporte con /reporte ${id}.`;
    return ctx.reply(detalle);
  });

  // 2. Contabilidad genera el reporte de detalle de pago para Colecturía.
  bot.command("reporte", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return responderError(ctx, "/reporte");

    const { solicitud, error } = await solicitudService.generarReporte(id);
    if (error) return ctx.reply(`⚠️ ${error}`);

    const notificados = await notificarPorRol(
      bot,
      "colecturia",
      `📋 Nueva solicitud lista para orden de transferencia: #${id} (${solicitud.tipo}).\n` +
        `Pago programado: ${solicitud.fechaProgramadaPago}.\nUsa /ordentransferencia ${id}.`
    );
    return ctx.reply(
      `✅ Reporte generado para la solicitud #${id}. Notificado a Colecturía (${notificados}).`
    );
  });

  // 3. Colecturía genera la orden de transferencia y pide las dos aprobaciones.
  bot.command("ordentransferencia", requireRol("colecturia"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return responderError(ctx, "/ordentransferencia");

    const { solicitud, error } = await solicitudService.generarOrdenTransferencia(id);
    if (error) return ctx.reply(`⚠️ ${error}`);

    const mensaje =
      `📝 Orden de transferencia generada para la solicitud #${id}. Requiere tu aprobación.\n` +
      `Pago programado: ${solicitud.fechaProgramadaPago}.\n` +
      `Usa /aprobarcg ${id} o /aprobarcash ${id} según tu rol.`;
    const nCg = await notificarPorRol(bot, "coordinador_general", mensaje);
    const nCash = await notificarPorRol(bot, "cash_management", mensaje);
    return ctx.reply(
      `✅ Orden de transferencia generada para #${id}. Notificado a Coordinación General (${nCg}) y Cash Management (${nCash}).`
    );
  });

  bot.command("aprobarcg", requireRol("coordinador_general"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return responderError(ctx, "/aprobarcg");

    const { error, completo } = await solicitudService.aprobarComoCoordinadorGeneral(id);
    if (error) return ctx.reply(`⚠️ ${error}`);

    await ctx.reply(`✅ Aprobaste la orden de transferencia #${id} (Coordinación General).`);
    if (completo) await avisarAprobacionCompleta(bot, id);
  });

  bot.command("aprobarcash", requireRol("cash_management"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return responderError(ctx, "/aprobarcash");

    const { error, completo } = await solicitudService.aprobarComoCashManagement(id);
    if (error) return ctx.reply(`⚠️ ${error}`);

    await ctx.reply(`✅ Aprobaste la orden de transferencia #${id} (Cash Management).`);
    if (completo) await avisarAprobacionCompleta(bot, id);
  });

  // 5. La aplicación impide cerrar un pago fuera del viernes o antes de su fecha programada.
  bot.command("marcarpagada", requireRol("colecturia"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return responderError(ctx, "/marcarpagada");

    const { solicitud, error } = await solicitudService.marcarPagada(id, fechaHoyISO());
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarPorRol(bot, "contadora", `💰 La solicitud #${id} ya fue pagada por Colecturía.`);
    await notificarATelegramId(
      bot,
      solicitud.solicitanteTelegramId,
      `💰 Tu solicitud #${id} ya fue pagada. Por favor informa al proveedor.`
    );
    return ctx.reply(
      `✅ Solicitud #${id} marcada como pagada. Se notificó a Contabilidad y al solicitante.`
    );
  });

  async function avisarAprobacionCompleta(botInstance, id) {
    const solicitud = await solicitudService.obtenerPorId(id);
    await notificarPorRol(
      botInstance,
      "colecturia",
      `🟢 La solicitud #${id} tiene ambas aprobaciones. ` +
        `Pago programado: ${solicitud.fechaProgramadaPago}. ` +
        `En esa fecha, si corresponde a viernes, usa /marcarpagada ${id}.`
    );
  }
}

module.exports = registerAprobacionPagoFlow;
