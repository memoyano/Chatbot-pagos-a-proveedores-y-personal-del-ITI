const { Markup } = require("telegraf");
const { registrarSolicitud } = require("../../domains/solicitudesPago/solicitudPago.service");
const eventoService = require("../../domains/eventos/eventoInstitucional.service");
const { notificarPorRol } = require("../../utils/notificaciones");
const { isValidDateOnly, fechaHoyISO } = require("../../utils/fechas");
const { ROLES_AUTORIDAD_EXCEPCIONAL } = require("../../config/roles");

function extraerId(ctx) {
  const partes = ctx.message.text.trim().split(/\s+/);
  const id = Number(partes[1]);
  return Number.isInteger(id) ? id : null;
}

function tecladoTipos() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("Normal", "sp_tipo_normal")],
    [Markup.button.callback("Anticipo para gira académica", "sp_tipo_anticipo_gira")],
    [Markup.button.callback("Urgente", "sp_tipo_urgente")],
    [Markup.button.callback("Excepcional: pago requerido hoy", "sp_tipo_excepcional_mismo_dia")],
  ]);
}

function iniciarSolicitud(ctx, evento = null) {
  ctx.session.flow = "solicitud_pago";
  ctx.session.step = "elegir_tipo";
  ctx.session.data = evento
    ? {
      eventoInstitucionalId: evento.id,
      eventoSolicitanteTelegramId: evento.solicitanteTelegramId,
      eventoSolicitanteNombre: evento.solicitanteNombre,
    }
    : {};

  const encabezado = evento
    ? `Vamos a registrar una solicitud de pago vinculada al evento #${evento.id} (${evento.nombre}).\n¿Qué tipo de solicitud es?`
    : "Vamos a registrar una solicitud de pago.\n¿Qué tipo de solicitud es?";
  return ctx.reply(encabezado, tecladoTipos());
}

function registerSolicitudPagoFlow(bot) {
  bot.command("solicitud", (ctx) => iniciarSolicitud(ctx));

  bot.command("solicitudevento", async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /solicitudevento <id del evento aprobado>");

    const evento = await eventoService.obtenerPorId(id);
    if (!evento) return ctx.reply(`⚠️ No existe el evento institucional #${id}.`);
    if (evento.estado !== "aprobado_programacion") {
      return ctx.reply(
        `⚠️ El evento #${id} está en estado "${evento.estado}". Debe estar aprobado por Contabilidad antes de programar desembolsos.`
      );
    }

    const esResponsable = String(evento.solicitanteTelegramId) === String(ctx.from.id);
    const esContadora = ctx.state.usuario.rol === "contadora";
    if (!esResponsable && !esContadora) {
      return ctx.reply("⛔ Solo el responsable del evento o Contabilidad puede crear solicitudes vinculadas.");
    }

    return iniciarSolicitud(ctx, evento);
  });

  bot.action(/sp_tipo_(.+)/, (ctx) => {
    if (ctx.session.flow !== "solicitud_pago") return ctx.answerCbQuery();
    const tipo = ctx.match[1];
    ctx.session.data.tipo = tipo;
    ctx.answerCbQuery();

    if (tipo === "excepcional_mismo_dia") {
      ctx.session.data.fechaDesembolsoRequerida = fechaHoyISO();
      ctx.session.step = "esperar_justificacion";
      return ctx.reply(
        "Esta modalidad solo aplica a circunstancias extraordinarias y requiere autorización institucional.\n" +
        "Describe la justificación del pago solicitado para hoy:"
      );
    }

    ctx.session.step = "esperar_fecha";
    return ctx.reply("Indica la fecha en la que necesitas el desembolso (formato AAAA-MM-DD):");
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.session.flow !== "solicitud_pago") return next();

    if (ctx.session.step === "esperar_fecha") {
      const texto = ctx.message.text.trim();
      if (!isValidDateOnly(texto)) {
        return ctx.reply("Formato de fecha inválido. Usa AAAA-MM-DD, por ejemplo 2026-08-20.");
      }
      ctx.session.data.fechaDesembolsoRequerida = texto;

      if (ctx.session.data.tipo === "urgente") {
        ctx.session.step = "esperar_justificacion";
        return ctx.reply("Los pagos urgentes requieren justificación. Descríbela brevemente:");
      }
      return finalizarSolicitud(ctx);
    }

    if (ctx.session.step === "esperar_justificacion") {
      ctx.session.data.justificacion = ctx.message.text.trim();
      return finalizarSolicitud(ctx);
    }

    return next();
  });

  async function finalizarSolicitud(ctx) {
    const hoy = fechaHoyISO();
    const solicitanteTelegramId =
      ctx.session.data.eventoSolicitanteTelegramId || String(ctx.from.id);
    const solicitanteNombre =
      ctx.session.data.eventoSolicitanteNombre || ctx.state.usuario.nombre;

    const resultado = await registrarSolicitud({
      tipo: ctx.session.data.tipo,
      fechaSolicitud: hoy,
      fechaDesembolsoRequerida: ctx.session.data.fechaDesembolsoRequerida,
      justificacion: ctx.session.data.justificacion,
      solicitanteTelegramId,
      solicitanteNombre,
      eventoInstitucionalId: ctx.session.data.eventoInstitucionalId || null,
    });

    const eventoInstitucionalId = ctx.session.data.eventoInstitucionalId || null;
    ctx.session.flow = null;
    ctx.session.step = null;
    ctx.session.data = {};

    if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);
    const { solicitud, validacion } = resultado;

    if (!validacion.valido) {
      return ctx.reply(
        `⚠️ Tu solicitud #${solicitud.id} no cumple la política institucional:\n${validacion.motivo}`
      );
    }

    if (validacion.requiereAutorizacion) {
      const mensaje =
        `🚨 Solicitud excepcional del mismo día #${solicitud.id}.\n` +
        `Solicitante: ${solicitud.solicitanteNombre}\n` +
        (eventoInstitucionalId ? `Evento vinculado: #${eventoInstitucionalId}\n` : "") +
        `Justificación: ${solicitud.justificacion}\n\n` +
        `Autoriza con /autorizarexcepcional ${solicitud.id} o rechaza con ` +
        `/rechazarexcepcional ${solicitud.id} <motivo>.`;

      const notificaciones = await Promise.all(
        ROLES_AUTORIDAD_EXCEPCIONAL.map((rol) =>
          notificarPorRol(bot, rol, mensaje)
        )
      );

      const totalNotificados = notificaciones.reduce(
        (total, cantidad) => total + cantidad,
        0
      );

      return ctx.reply(
        `🕓 Solicitud excepcional #${solicitud.id} registrada. ` +
        `Queda pendiente de autorización institucional. ` +
        `Autoridades notificadas: ${totalNotificados}.`
      );
    }

    return ctx.reply(
      `✅ Solicitud #${solicitud.id} registrada` +
      (eventoInstitucionalId ? ` y vinculada al evento #${eventoInstitucionalId}` : "") +
      ".\nLa fecha efectiva de pago se asignará cuando Contabilidad confirme que la solicitud está completa, " +
      "aplicando el corte de miércoles y el ciclo de pagos del viernes."
    );
  }
}

module.exports = registerSolicitudPagoFlow;
