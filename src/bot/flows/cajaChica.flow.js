const cajaChicaService = require("../../domains/cajaChica/reembolsoCajaChica.service");
const { requireRol } = require("../middlewares/auth.middleware");
const { notificarPorRol, notificarATelegramId } = require("../../utils/notificaciones");
const { fechaHoyISO } = require("../../utils/fechas");

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

function registerCajaChicaFlow(bot) {
  bot.command("cajachica", (ctx) => {
    ctx.session.flow = "caja_chica";
    ctx.session.step = "cc_descripcion";
    ctx.session.data = {};
    return ctx.reply(
      "Vamos a registrar una solicitud de reembolso de Caja Chica.\nDescribe brevemente los gastos incluidos en el reembolso:"
    );
  });

  bot.command("miscajachica", async (ctx) => {
    const registros = await cajaChicaService.listarPorSolicitante(String(ctx.from.id));
    if (!registros.length) return ctx.reply("No tienes solicitudes de reembolso de Caja Chica registradas.");

    const lineas = registros.map((r) => {
      const periodo = r.diferido ? `⚠️ diferido a ${r.periodoProcesamiento}` : `período ${r.periodoProcesamiento}`;
      return `#${r.id} — $${r.montoTotal} — ${r.estado} — ${periodo}`;
    });
    return ctx.reply(`💵 Tus reembolsos de Caja Chica:\n\n${lineas.join("\n")}`);
  });

  bot.command("cajachicapendientes", requireRol("contadora"), async (ctx) => {
    const registros = await cajaChicaService.listarParaRevision();
    if (!registros.length) return ctx.reply("No hay reembolsos de Caja Chica pendientes de revisión.");

    const lineas = registros.map((r) => {
      const plazo = r.dentroPlazo
        ? `✅ dentro de plazo (límite ${r.fechaLimite})`
        : `⚠️ fuera de plazo; procesar ${r.periodoProcesamiento}`;
      return `#${r.id} — ${r.solicitanteNombre} — $${r.montoTotal} — ${plazo}`;
    });
    return ctx.reply(
      `💵 Caja Chica pendiente de revisión:\n\n${lineas.join("\n")}\n\n` +
        "Usa /validarcajachica <id>, /observarcajachica <id> <motivo> o /rechazarcajachica <id> <motivo>."
    );
  });

  bot.command("validarcajachica", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /validarcajachica <id>");

    const { reembolso, error } = await cajaChicaService.revisarReembolso(id, {
      accion: "aprobar",
      revisorTelegramId: String(ctx.from.id),
      revisorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      reembolso.solicitanteTelegramId,
      `✅ Tu reembolso de Caja Chica #${id} fue validado. ` +
        (reembolso.diferido
          ? `Por haberse presentado fuera de plazo, será procesado en el período ${reembolso.periodoProcesamiento}.`
          : `Corresponde al período ${reembolso.periodoProcesamiento}.`)
    );
    await notificarPorRol(
      bot,
      "colecturia",
      `💵 Reembolso de Caja Chica #${id} aprobado por Contabilidad. Monto: $${reembolso.montoTotal}. ` +
        `Período de procesamiento: ${reembolso.periodoProcesamiento}. ` +
        `Cuando corresponda, usa /reembolsarcajachica ${id}.`
    );

    return ctx.reply(
      `✅ Reembolso #${id} validado. Período de procesamiento: ${reembolso.periodoProcesamiento}.`
    );
  });

  bot.command("observarcajachica", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    const motivo = extraerMotivo(ctx);
    if (!id || !motivo) return ctx.reply("Uso: /observarcajachica <id> <motivo>");

    const { reembolso, error } = await cajaChicaService.revisarReembolso(id, {
      accion: "observar",
      observacion: motivo,
      revisorTelegramId: String(ctx.from.id),
      revisorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      reembolso.solicitanteTelegramId,
      `⚠️ El reembolso de Caja Chica #${id} requiere corrección. Motivo: ${motivo}. ` +
        `Adjunta un nuevo respaldo con /corregircajachica ${id}.`
    );
    return ctx.reply(`✅ Reembolso #${id} marcado como observado.`);
  });

  bot.command("rechazarcajachica", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    const motivo = extraerMotivo(ctx);
    if (!id || !motivo) return ctx.reply("Uso: /rechazarcajachica <id> <motivo>");

    const { reembolso, error } = await cajaChicaService.revisarReembolso(id, {
      accion: "rechazar",
      observacion: motivo,
      revisorTelegramId: String(ctx.from.id),
      revisorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      reembolso.solicitanteTelegramId,
      `❌ El reembolso de Caja Chica #${id} fue rechazado. Motivo: ${motivo}.`
    );
    return ctx.reply(`✅ Rechazo del reembolso #${id} registrado.`);
  });

  bot.command("corregircajachica", async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /corregircajachica <id>");

    const reembolso = await cajaChicaService.obtenerPorId(id);
    if (!reembolso) return ctx.reply(`⚠️ No existe el reembolso #${id}.`);
    if (String(reembolso.solicitanteTelegramId) !== String(ctx.from.id)) {
      return ctx.reply("⛔ Solo quien registró el reembolso puede corregirlo.");
    }
    if (reembolso.estado !== "observado") {
      return ctx.reply(`⚠️ El reembolso #${id} no está observado.`);
    }

    ctx.session.flow = "corregir_caja_chica";
    ctx.session.step = "cc_archivo_correccion";
    ctx.session.data = { reembolsoId: id };
    return ctx.reply("Adjunta el respaldo corregido en PDF, documento o fotografía legible:");
  });

  bot.command("reembolsarcajachica", requireRol("colecturia"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /reembolsarcajachica <id>");

    const { reembolso, error } = await cajaChicaService.marcarReembolsado(id, {
      fechaReembolso: fechaHoyISO(),
      ejecutorTelegramId: String(ctx.from.id),
      ejecutorNombre: ctx.state.usuario.nombre,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarATelegramId(
      bot,
      reembolso.solicitanteTelegramId,
      `💰 El reembolso de Caja Chica #${id} fue procesado por $${reembolso.montoTotal}.`
    );
    await notificarPorRol(
      bot,
      "contadora",
      `💰 Colecturía procesó el reembolso de Caja Chica #${id} por $${reembolso.montoTotal}.`
    );
    return ctx.reply(`✅ Reembolso de Caja Chica #${id} marcado como procesado.`);
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.session.flow !== "caja_chica") return next();
    const texto = ctx.message.text.trim();

    if (ctx.session.step === "cc_descripcion") {
      if (texto.length < 5) return ctx.reply("Describe los gastos con un poco más de detalle.");
      ctx.session.data.descripcion = texto;
      ctx.session.step = "cc_monto";
      return ctx.reply("Indica el monto total del reembolso (ej. 85.40):");
    }

    if (ctx.session.step === "cc_monto") {
      const monto = parseMonto(texto);
      if (!monto) return ctx.reply("Monto inválido. Ingresa un valor mayor a 0, por ejemplo 85.40.");
      ctx.session.data.montoTotal = monto;
      ctx.session.step = "cc_archivo";
      return ctx.reply("Adjunta el documento de respaldo para revisión y reposición (PDF, documento o fotografía legible):");
    }

    return next();
  });

  bot.on(["photo", "document"], async (ctx, next) => {
    if (ctx.session.flow === "corregir_caja_chica" && ctx.session.step === "cc_archivo_correccion") {
      const fileId = fileIdDeMensaje(ctx);
      if (!fileId) return ctx.reply("No pude leer el archivo. Intenta nuevamente.");
      const id = ctx.session.data.reembolsoId;
      const { reembolso, error } = await cajaChicaService.corregirRespaldo(
        id,
        String(ctx.from.id),
        rutaTelegram(fileId)
      );

      ctx.session.flow = null;
      ctx.session.step = null;
      ctx.session.data = {};

      if (error) return ctx.reply(`⚠️ ${error}`);
      await notificarPorRol(
        bot,
        "contadora",
        `📎 El respaldo del reembolso de Caja Chica #${id} fue corregido. Revisa nuevamente con /validarcajachica ${id}.`
      );
      return ctx.reply(`✅ Respaldo del reembolso #${reembolso.id} actualizado y reenviado a Contabilidad.`);
    }

    if (ctx.session.flow !== "caja_chica" || ctx.session.step !== "cc_archivo") return next();

    const fileId = fileIdDeMensaje(ctx);
    if (!fileId) return ctx.reply("No pude leer el archivo. Intenta nuevamente.");

    const { reembolso, evaluacion } = await cajaChicaService.registrarReembolso({
      descripcion: ctx.session.data.descripcion,
      montoTotal: ctx.session.data.montoTotal,
      rutaRespaldo: rutaTelegram(fileId),
      fechaPresentacion: fechaHoyISO(),
      solicitanteTelegramId: String(ctx.from.id),
      solicitanteNombre: ctx.state.usuario.nombre,
    });

    ctx.session.flow = null;
    ctx.session.step = null;
    ctx.session.data = {};

    await notificarPorRol(
      bot,
      "contadora",
      `💵 Nuevo reembolso de Caja Chica #${reembolso.id}. Solicitante: ${reembolso.solicitanteNombre}. ` +
        `Monto: $${reembolso.montoTotal}. Fecha límite del período: ${reembolso.fechaLimite}. ` +
        (evaluacion.diferido
          ? `⚠️ Presentado fuera de plazo; corresponde procesar en ${reembolso.periodoProcesamiento}.`
          : `✅ Presentado dentro de plazo; corresponde al período ${reembolso.periodoProcesamiento}.`) +
        ` Revisa con /validarcajachica ${reembolso.id}.`
    );

    if (evaluacion.diferido) {
      return ctx.reply(
        `✅ Reembolso de Caja Chica #${reembolso.id} registrado.\n` +
          `⚠️ Fue presentado después del límite ${reembolso.fechaLimite}, por lo que la política lo difiere al período ${reembolso.periodoProcesamiento}. ` +
          "Contabilidad fue notificada para su revisión."
      );
    }

    return ctx.reply(
      `✅ Reembolso de Caja Chica #${reembolso.id} registrado dentro de plazo. ` +
        `Período de procesamiento: ${reembolso.periodoProcesamiento}. Contabilidad fue notificada.`
    );
  });
}

module.exports = registerCajaChicaFlow;
