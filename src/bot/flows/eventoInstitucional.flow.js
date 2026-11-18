const { Markup } = require("telegraf");
const eventoService = require("../../domains/eventos/eventoInstitucional.service");
const { requireRol } = require("../middlewares/auth.middleware");
const { notificarPorRol, notificarATelegramId } = require("../../utils/notificaciones");
const { fechaHoyISO, isValidDateOnly } = require("../../utils/fechas");

function fileIdDeMensaje(ctx) {
  if (ctx.message.photo) return ctx.message.photo[ctx.message.photo.length - 1].file_id;
  if (ctx.message.document) return ctx.message.document.file_id;
  return null;
}

function rutaTelegram(fileId) {
  return fileId ? `telegram:${fileId}` : null;
}

function extraerId(ctx) {
  const partes = ctx.message.text.trim().split(/\s+/);
  const id = Number(partes[1]);
  return Number.isInteger(id) ? id : null;
}

function extraerMotivo(ctx) {
  return ctx.message.text.trim().split(/\s+/).slice(2).join(" ").trim();
}

function parseMonto(texto) {
  const normalizado = String(texto).trim().replace(/\s/g, "").replace(",", ".");
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null;
}

const LABEL_TIPO = {
  graduacion: "Graduación",
  dia_trabajador: "Día del Trabajador",
  navidad: "Navidad",
  aniversario: "Aniversario",
  academico_institucional: "Evento académico o institucional",
  otra_celebracion: "Otra celebración",
};

function iniciarCaptura(ctx, { eventoId = null, tipo = null } = {}) {
  ctx.session.flow = eventoId ? "actualizar_evento" : "evento_institucional";
  ctx.session.step = eventoId ? "evento_fecha" : "evento_tipo";
  ctx.session.data = { eventoId, tipo };

  if (eventoId) {
    return ctx.reply("Indica la nueva fecha del evento (AAAA-MM-DD):");
  }

  return ctx.reply(
    "Vamos a registrar la planificación financiera de un evento institucional.\n¿Qué tipo de evento es?",
    Markup.inlineKeyboard([
      [Markup.button.callback("Graduación", "ev_tipo_graduacion")],
      [Markup.button.callback("Día del Trabajador", "ev_tipo_dia_trabajador")],
      [Markup.button.callback("Navidad", "ev_tipo_navidad")],
      [Markup.button.callback("Aniversario", "ev_tipo_aniversario")],
      [Markup.button.callback("Académico / institucional", "ev_tipo_academico_institucional")],
      [Markup.button.callback("Otra celebración", "ev_tipo_otra_celebracion")],
    ])
  );
}

function registerEventoInstitucionalFlow(bot) {
  bot.command("evento", (ctx) => iniciarCaptura(ctx));

  bot.action(/ev_tipo_(.+)/, async (ctx) => {
    if (ctx.session.flow !== "evento_institucional" || ctx.session.step !== "evento_tipo") {
      return ctx.answerCbQuery();
    }
    const tipo = ctx.match[1];
    if (!LABEL_TIPO[tipo]) return ctx.answerCbQuery("Tipo no reconocido");

    ctx.session.data.tipo = tipo;
    ctx.session.step = "evento_fecha";
    await ctx.answerCbQuery();
    return ctx.reply(
      "Indica la fecha del evento (AAAA-MM-DD). La política exige presentar la planificación con al menos una semana de anticipación:"
    );
  });

  bot.command("miseventos", async (ctx) => {
    const eventos = await eventoService.listarPorSolicitante(String(ctx.from.id));
    if (!eventos.length) return ctx.reply("No tienes eventos institucionales registrados.");

    const lineas = eventos.map((e) => {
      const plazo = e.cumpleAnticipacion ? "✅ plazo" : "⚠️ fuera de plazo";
      return `#${e.id} ${LABEL_TIPO[e.tipo] || e.tipo} — ${e.fechaEvento} — ${e.estado} — ${plazo}`;
    });
    return ctx.reply(`📅 Tus eventos institucionales:\n\n${lineas.join("\n")}`);
  });

  bot.command("eventos", requireRol("contadora"), async (ctx) => {
    const eventos = await eventoService.listarParaRevision();
    if (!eventos.length) return ctx.reply("No hay planificaciones de eventos pendientes de revisión.");

    const lineas = eventos.map((e) => {
      const plazo = e.cumpleAnticipacion
        ? `✅ ${e.diasAnticipacion} días`
        : `⚠️ ${e.diasAnticipacion} días`;
      return (
        `#${e.id} — ${LABEL_TIPO[e.tipo] || e.tipo} — ${e.nombre}\n` +
        `   Fecha: ${e.fechaEvento} | Anticipación: ${plazo} | Monto estimado: $${e.montoEstimado}`
      );
    });
    return ctx.reply(
      `📅 Eventos pendientes de revisión:\n\n${lineas.join("\n\n")}\n\n` +
        "Usa /validarevento <id>, /observarevento <id> <motivo> o /rechazarevento <id> <motivo>."
    );
  });

  bot.command("validarevento", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /validarevento <id>");

    const { evento, error } = await eventoService.revisarEvento(id, {
      accion: "aprobar",
      revisorTelegramId: String(ctx.from.id),
      revisorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      evento.solicitanteTelegramId,
      `✅ La planificación del evento #${id} (${evento.nombre}) fue validada por Contabilidad. ` +
        `Los desembolsos a proveedores pueden vincularse a este evento con /solicitudevento ${id}.`
    );
    return ctx.reply(
      `✅ Evento #${id} aprobado para programación financiera. ` +
        `Para crear una solicitud de pago vinculada usa /solicitudevento ${id}.`
    );
  });

  bot.command("observarevento", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    const motivo = extraerMotivo(ctx);
    if (!id || !motivo) return ctx.reply("Uso: /observarevento <id> <motivo>");

    const { evento, error } = await eventoService.revisarEvento(id, {
      accion: "observar",
      observacion: motivo,
      revisorTelegramId: String(ctx.from.id),
      revisorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      evento.solicitanteTelegramId,
      `⚠️ La planificación del evento #${id} requiere corrección. Motivo: ${motivo}. ` +
        `Corrígela con /actualizarevento ${id}.`
    );
    return ctx.reply(`✅ Evento #${id} marcado como observado.`);
  });

  bot.command("rechazarevento", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    const motivo = extraerMotivo(ctx);
    if (!id || !motivo) return ctx.reply("Uso: /rechazarevento <id> <motivo>");

    const { evento, error } = await eventoService.revisarEvento(id, {
      accion: "rechazar",
      observacion: motivo,
      revisorTelegramId: String(ctx.from.id),
      revisorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      evento.solicitanteTelegramId,
      `❌ La planificación del evento #${id} fue rechazada. Motivo: ${motivo}.`
    );
    return ctx.reply(`✅ Rechazo del evento #${id} registrado.`);
  });

  bot.command("actualizarevento", async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /actualizarevento <id>");

    const evento = await eventoService.obtenerPorId(id);
    if (!evento) return ctx.reply(`⚠️ No existe el evento #${id}.`);
    if (String(evento.solicitanteTelegramId) !== String(ctx.from.id)) {
      return ctx.reply("⛔ Solo quien registró el evento puede corregirlo.");
    }
    if (evento.estado !== "observado") {
      return ctx.reply(`⚠️ El evento #${id} no está observado.`);
    }
    return iniciarCaptura(ctx, { eventoId: id, tipo: evento.tipo });
  });

  bot.on("text", async (ctx, next) => {
    if (!["evento_institucional", "actualizar_evento"].includes(ctx.session.flow)) return next();

    const texto = ctx.message.text.trim();
    if (ctx.session.step === "evento_fecha") {
      if (!isValidDateOnly(texto)) return ctx.reply("Fecha inválida. Usa AAAA-MM-DD.");
      ctx.session.data.fechaEvento = texto;
      ctx.session.step = "evento_nombre";
      return ctx.reply("Indica un nombre breve para el evento:");
    }

    if (ctx.session.step === "evento_nombre") {
      if (texto.length < 3) return ctx.reply("El nombre debe tener al menos 3 caracteres.");
      ctx.session.data.nombre = texto;
      ctx.session.step = "evento_unidad";
      return ctx.reply("¿Qué unidad o área organiza el evento?");
    }

    if (ctx.session.step === "evento_unidad") {
      if (texto.length < 2) return ctx.reply("Indica la unidad organizadora.");
      ctx.session.data.unidadOrganizadora = texto;
      ctx.session.step = "evento_descripcion";
      return ctx.reply("Describe brevemente la planificación o finalidad del evento. Escribe '-' si no deseas agregar detalle:");
    }

    if (ctx.session.step === "evento_descripcion") {
      ctx.session.data.descripcion = texto === "-" ? null : texto;
      ctx.session.step = "evento_monto";
      return ctx.reply("Indica el monto total estimado de la planificación (ej. 1250.50):");
    }

    if (ctx.session.step === "evento_monto") {
      const monto = parseMonto(texto);
      if (!monto) return ctx.reply("Monto inválido. Ingresa un valor mayor a 0, por ejemplo 1250.50.");
      ctx.session.data.montoEstimado = monto;
      ctx.session.step = "evento_archivo";
      return ctx.reply("Adjunta la planificación financiera en PDF, documento o fotografía legible:");
    }

    return next();
  });

  bot.on(["photo", "document"], async (ctx, next) => {
    if (!["evento_institucional", "actualizar_evento"].includes(ctx.session.flow)) return next();
    if (ctx.session.step !== "evento_archivo") return next();

    const fileId = fileIdDeMensaje(ctx);
    if (!fileId) return ctx.reply("No pude leer el archivo. Intenta adjuntarlo nuevamente.");
    const rutaPlanificacionFinanciera = rutaTelegram(fileId);
    const fechaPresentacion = fechaHoyISO();
    const datos = {
      ...ctx.session.data,
      fechaPresentacion,
      rutaPlanificacionFinanciera,
      solicitanteTelegramId: String(ctx.from.id),
      solicitanteNombre: ctx.state.usuario.nombre,
    };

    let resultado;
    if (ctx.session.flow === "actualizar_evento") {
      resultado = await eventoService.actualizarEventoObservado(
        ctx.session.data.eventoId,
        String(ctx.from.id),
        datos
      );
    } else {
      resultado = await eventoService.registrarEvento(datos);
    }

    ctx.session.flow = null;
    ctx.session.step = null;
    ctx.session.data = {};

    if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);

    const { evento, validacion } = resultado;
    const mensajeContabilidad =
      `📅 Planificación de evento #${evento.id}: ${evento.nombre}.\n` +
      `Unidad: ${evento.unidadOrganizadora}. Fecha: ${evento.fechaEvento}. ` +
      `Monto estimado: $${evento.montoEstimado}.\n` +
      (validacion.valido
        ? `✅ Cumple anticipación: ${validacion.dias} días.`
        : `⚠️ No cumple anticipación mínima: ${validacion.dias} día(s). ${validacion.motivo}`) +
      `\nRevisa con /validarevento ${evento.id}, /observarevento ${evento.id} <motivo> o /rechazarevento ${evento.id} <motivo>.`;

    await notificarPorRol(bot, "contadora", mensajeContabilidad);

    if (validacion.valido) {
      return ctx.reply(
        `✅ Planificación del evento #${evento.id} registrada. Cumple el mínimo de una semana de anticipación ` +
          `(${validacion.dias} días) y fue enviada a Contabilidad para revisión.`
      );
    }

    return ctx.reply(
      `⚠️ Planificación del evento #${evento.id} registrada, pero NO cumple la anticipación mínima de una semana ` +
        `(${validacion.dias} día(s)). Contabilidad fue notificada; la planificación deberá corregirse antes de poder aprobarse.`
    );
  });
}

module.exports = registerEventoInstitucionalFlow;
