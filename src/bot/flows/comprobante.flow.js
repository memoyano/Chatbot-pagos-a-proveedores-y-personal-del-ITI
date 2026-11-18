const { Markup } = require("telegraf");
const comprobanteService = require("../../domains/comprobantes/comprobante.service");
const { requireRol } = require("../middlewares/auth.middleware");
const { notificarPorRol, notificarATelegramId } = require("../../utils/notificaciones");
const { isValidDateOnly, fechaHoyISO } = require("../../utils/fechas");
const config = require("../../config/env");
const iaOrchestrator = require("../../ia/orchestrator.service");
const analisisIAService = require("../../domains/ia/analisisIA.service");

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

function boolButton(label, key) {
  return [
    Markup.button.callback(`✅ Sí — ${label}`, `${key}_si`),
    Markup.button.callback(`❌ No`, `${key}_no`),
  ];
}

async function finalizarRegistro(bot, ctx) {
  const d = ctx.session.data;
  const resultado = await comprobanteService.registrarComprobante({
    solicitudPagoId: d.solicitudPagoId,
    tipo: d.tipo,
    fechaCompra: d.fechaCompra,
    fechaEnvio: fechaHoyISO(),
    rutaArchivo: d.rutaArchivo,
    esCompraTarjetaInstitucional: d.esCompraTarjetaInstitucional,
    rutaRespaldoTarjeta: d.rutaRespaldoTarjeta,
    esCompraInternet: d.esCompraInternet,
    tipoRespaldoInternet: d.tipoRespaldoInternet,
    rutaRespaldoInternet: d.rutaRespaldoInternet,
    proveedorCedula: d.proveedorCedula,
    rutaCedulaProveedor: d.rutaCedulaProveedor,
    notaVentaRimpeNegocioPopular: d.notaVentaRimpeNegocioPopular,
    notaVentaEmitidaNombreITI: d.notaVentaEmitidaNombreITI,
    notaVentaRucAplica: d.notaVentaRucAplica,
    notaVentaRucInstitucional: d.notaVentaRucInstitucional,
    notaVentaLegible: d.notaVentaLegible,
    notaVentaSinEnmendaduras: d.notaVentaSinEnmendaduras,
    notaVentaDatosCompletos: d.notaVentaDatosCompletos,
    solicitanteTelegramId: String(ctx.from.id),
    solicitanteNombre: ctx.state.usuario.nombre,
  });

  ctx.session.flow = null;
  ctx.session.step = null;
  ctx.session.data = {};

  if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);

  const { comprobante, evaluacion, documental } = resultado;

  if (config.ai.autoAnalyzeDocuments && comprobante.rutaArchivo) {
    iaOrchestrator.programarComprobante({
      bot,
      chatId: ctx.chat.id,
      comprobanteId: comprobante.id,
      actor: { telegramId: String(ctx.from.id), nombre: ctx.state.usuario.nombre },
    });
  }

  await notificarPorRol(
    bot,
    "contadora",
    `📎 Comprobante #${comprobante.id} recibido para la solicitud #${comprobante.solicitudPagoId}.\n` +
      `Tipo: ${comprobante.tipo}. Estado: ${comprobante.estadoValidacion}.\n` +
      (comprobante.tipo === "liquidacion_compra"
        ? `Debe emitirse la Liquidación de Compra. Usa /liquidacionemitida ${comprobante.id} AAAA-MM-DD.`
        : `Revisar con /validarcomprobante ${comprobante.id}.`)
  );

  const mensajes = [
    `✅ Comprobante #${comprobante.id} registrado y vinculado a la solicitud #${comprobante.solicitudPagoId}.`,
    `Estado documental: ${comprobante.estadoValidacion}.`,
  ];
  if (!evaluacion.reconocido) {
    mensajes.push(`⚠️ Incumplimiento automático: ${evaluacion.motivo}`);
  }
  if (!documental.completa) {
    mensajes.push(`Documentación todavía pendiente: ${documental.faltantes.join(", ")}.`);
  }
  if (comprobante.tipo === "nota_venta") {
    mensajes.push(
      "El original de la Nota de Venta también debe entregarse a Contabilidad dentro del cierre contable."
    );
  }
  if (comprobante.tipo === "liquidacion_compra") {
    mensajes.push(
      "Contabilidad debe elaborar y adjuntar la Liquidación de Compra con fecha del mismo día de la compra."
    );
  } else {
    mensajes.push("Queda pendiente de revisión y validación de Contabilidad.");
  }
  return ctx.reply(mensajes.join("\n"));
}

function continuarConRespaldos(ctx) {
  const d = ctx.session.data;
  if (d.esCompraTarjetaInstitucional && !d.rutaRespaldoTarjeta) {
    ctx.session.step = "esperar_respaldo_tarjeta";
    return ctx.reply(
      "Envía ahora el documento de respaldo de la compra realizada con tarjeta de crédito institucional."
    );
  }
  if (d.esCompraInternet && !d.rutaRespaldoInternet) {
    ctx.session.step = "elegir_respaldo_internet";
    return ctx.reply(
      "¿Qué respaldo adicional vas a presentar por la compra realizada por Internet?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Comprobante de pago electrónico", "cp_web_comprobante_pago")],
        [Markup.button.callback("Orden de compra", "cp_web_orden_compra")],
        [Markup.button.callback("Confirmación de la transacción", "cp_web_confirmacion_transaccion")],
      ])
    );
  }
  return null;
}

async function ejecutarValidacionContable(bot, ctx, id) {
  const resultado = await comprobanteService.validarPorContabilidad(id, {
    contadoraTelegramId: String(ctx.from.id),
    contadoraNombre: ctx.state.usuario.nombre,
  });
  if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);
  const c = resultado.comprobante;
  await notificarATelegramId(
    bot,
    c.solicitanteTelegramId,
    `✅ El comprobante #${id}, vinculado a tu solicitud #${c.solicitudPagoId}, fue validado por Contabilidad.`
  );
  const originalPendiente = c.tipo === "nota_venta" && !c.notaVentaOriginalEntregado;
  return ctx.reply(
    `✅ Comprobante #${id} validado y reconocido para pago.` +
      (originalPendiente
        ? `\n⚠️ El original físico de la Nota de Venta sigue pendiente. Regístralo con /originalnotaventa ${id}.`
        : "")
  );
}

function registerComprobanteFlow(bot) {
  bot.command("comprobante", (ctx) => {
    ctx.session.flow = "comprobante";
    ctx.session.step = "esperar_solicitud";
    ctx.session.data = {};
    return ctx.reply(
      "Vamos a registrar documentación de una compra.\n" +
        "Indica primero el número de la solicitud de pago a la que pertenece.\n" +
        "Ejemplo: 24"
    );
  });

  bot.action(/cp_tipo_(.+)/, (ctx) => {
    if (ctx.session.flow !== "comprobante") return ctx.answerCbQuery();
    ctx.session.data.tipo = ctx.match[1];
    ctx.session.step = "esperar_tarjeta";
    ctx.answerCbQuery();
    return ctx.reply(
      "¿Esta compra se realizó con la tarjeta de crédito institucional?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Sí", "cp_tarjeta_si"), Markup.button.callback("No", "cp_tarjeta_no")],
      ])
    );
  });

  bot.action(/cp_tarjeta_(si|no)/, (ctx) => {
    if (ctx.session.flow !== "comprobante") return ctx.answerCbQuery();
    ctx.session.data.esCompraTarjetaInstitucional = ctx.match[1] === "si";
    ctx.session.step = "esperar_internet";
    ctx.answerCbQuery();
    return ctx.reply(
      "¿La compra se realizó por Internet o mediante una plataforma digital?",
      Markup.inlineKeyboard([
        [Markup.button.callback("Sí", "cp_internet_si"), Markup.button.callback("No", "cp_internet_no")],
      ])
    );
  });

  bot.action(/cp_internet_(si|no)/, (ctx) => {
    if (ctx.session.flow !== "comprobante") return ctx.answerCbQuery();
    ctx.session.data.esCompraInternet = ctx.match[1] === "si";
    ctx.session.step = "esperar_fecha_compra";
    ctx.answerCbQuery();
    return ctx.reply(
      "Indica la fecha en que se realizó la compra (AAAA-MM-DD):" +
        (ctx.session.data.esCompraTarjetaInstitucional
          ? "\n⚠️ Con tarjeta institucional, factura y respaldos deben remitirse el mismo día."
          : "")
    );
  });

  const notaChecklist = [
    ["cp_nv_rimpe", "notaVentaRimpeNegocioPopular", "¿El proveedor está inscrito como RIMPE Negocio Popular?"],
    ["cp_nv_nombre", "notaVentaEmitidaNombreITI", "¿La Nota de Venta está emitida a nombre del ITI?"],
    ["cp_nv_legible", "notaVentaLegible", "¿El documento es legible?"],
    ["cp_nv_enm", "notaVentaSinEnmendaduras", "¿El documento está libre de enmendaduras?"],
    ["cp_nv_datos", "notaVentaDatosCompletos", "¿Los datos del comprobante están completos?"],
  ];

  notaChecklist.forEach(([key, field, pregunta], index) => {
    bot.action(new RegExp(`^${key}_(si|no)$`), (ctx) => {
      if (ctx.session.flow !== "comprobante") return ctx.answerCbQuery();
      ctx.session.data[field] = ctx.match[1] === "si";
      ctx.answerCbQuery();
      if (key === "cp_nv_nombre") {
        ctx.session.step = "cp_nv_ruc";
        return ctx.reply(
          "Respecto del RUC institucional, selecciona lo que corresponda:",
          Markup.inlineKeyboard([
            [Markup.button.callback("✅ Sí, está incluido", "cp_nv_ruc_si")],
            [Markup.button.callback("❌ Debía constar y no está", "cp_nv_ruc_no")],
            [Markup.button.callback("➖ No aplica en este comprobante", "cp_nv_ruc_na")],
          ])
        );
      }
      const siguiente = notaChecklist[index + 1];
      if (siguiente) {
        ctx.session.step = siguiente[0];
        return ctx.reply(siguiente[2], Markup.inlineKeyboard([boolButton("cumple", siguiente[0])]));
      }
      ctx.session.step = "esperar_archivo_principal";
      return ctx.reply(
        "Envía ahora una fotografía legible o PDF de la Nota de Venta.\n" +
          "El original físico deberá entregarse a Contabilidad dentro del cierre contable."
      );
    });
  });

  bot.action(/^cp_nv_ruc_(si|no|na)$/, (ctx) => {
    if (ctx.session.flow !== "comprobante") return ctx.answerCbQuery();
    const valor = ctx.match[1];
    ctx.session.data.notaVentaRucAplica = valor !== "na";
    ctx.session.data.notaVentaRucInstitucional = valor === "si" ? true : valor === "no" ? false : null;
    ctx.answerCbQuery();
    const siguiente = notaChecklist.find((item) => item[0] === "cp_nv_legible");
    ctx.session.step = siguiente[0];
    return ctx.reply(siguiente[2], Markup.inlineKeyboard([boolButton("cumple", siguiente[0])]));
  });

  bot.action(/^cp_web_(comprobante_pago|orden_compra|confirmacion_transaccion)$/, (ctx) => {
    if (ctx.session.flow !== "comprobante") return ctx.answerCbQuery();
    ctx.session.data.tipoRespaldoInternet = ctx.match[1];
    ctx.session.step = "esperar_respaldo_internet";
    ctx.answerCbQuery();
    return ctx.reply("Adjunta ahora ese respaldo (foto o PDF).");
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.session.flow !== "comprobante") return next();

    if (ctx.session.step === "esperar_solicitud") {
      const id = Number(ctx.message.text.trim());
      if (!Number.isInteger(id)) return ctx.reply("Indica un número de solicitud válido. Ejemplo: 24");
      const vinculacion = await comprobanteService.validarSolicitudVinculable({
        solicitudPagoId: id,
        solicitanteTelegramId: String(ctx.from.id),
      });
      if (vinculacion.error) return ctx.reply(`⚠️ ${vinculacion.error}`);
      ctx.session.data.solicitudPagoId = id;
      ctx.session.step = "elegir_tipo";
      return ctx.reply(
        `Solicitud #${id} encontrada. ¿Qué tipo de comprobante corresponde?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("Factura de compra", "cp_tipo_factura")],
          [Markup.button.callback("Nota de venta (RIMPE Negocio Popular)", "cp_tipo_nota_venta")],
          [Markup.button.callback("Proveedor sin factura (liquidación)", "cp_tipo_liquidacion_compra")],
        ])
      );
    }

    if (ctx.session.step === "esperar_fecha_compra") {
      const texto = ctx.message.text.trim();
      if (!isValidDateOnly(texto)) {
        return ctx.reply("Formato de fecha inválido. Usa AAAA-MM-DD, por ejemplo 2026-08-20.");
      }
      ctx.session.data.fechaCompra = texto;

      if (ctx.session.data.tipo === "liquidacion_compra") {
        ctx.session.step = "esperar_cedula";
        return ctx.reply(
          "El proveedor no emite factura. Indica el número de cédula del proveedor.\n" +
            "Después deberás adjuntar una copia de esa cédula."
        );
      }

      if (ctx.session.data.tipo === "nota_venta") {
        const primero = notaChecklist[0];
        ctx.session.step = primero[0];
        return ctx.reply(primero[2], Markup.inlineKeyboard([boolButton("cumple", primero[0])]));
      }

      ctx.session.step = "esperar_archivo_principal";
      return ctx.reply(
        "Envía la fotografía o PDF de la factura.\n" +
          "La política V21082026 permite remitir la factura el mismo día o hasta el día siguiente, " +
          "salvo reglas más estrictas como tarjeta institucional."
      );
    }

    if (ctx.session.step === "esperar_cedula") {
      const cedula = ctx.message.text.trim();
      if (!/^\d{6,20}$/.test(cedula)) {
        return ctx.reply("Ingresa únicamente el número de cédula del proveedor.");
      }
      ctx.session.data.proveedorCedula = cedula;
      ctx.session.step = "esperar_cedula_archivo";
      return ctx.reply("Adjunta ahora una fotografía o PDF de la cédula del proveedor.");
    }

    return next();
  });

  bot.on(["photo", "document"], async (ctx, next) => {
    // Flujo especial: Contabilidad adjunta la Liquidación de Compra ya emitida.
    if (ctx.session.flow === "liquidacion_emitida" && ctx.session.step === "esperar_archivo") {
      const fileId = fileIdDeMensaje(ctx);
      const { id, fechaLiquidacionCompra } = ctx.session.data;
      const resultado = await comprobanteService.registrarLiquidacionEmitida(id, {
        fechaLiquidacionCompra,
        rutaLiquidacionCompra: rutaTelegram(fileId),
        contadoraTelegramId: String(ctx.from.id),
        contadoraNombre: ctx.state.usuario.nombre,
      });
      ctx.session.flow = null;
      ctx.session.step = null;
      ctx.session.data = {};
      if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);

      const c = resultado.comprobante;
      if (config.ai.autoAnalyzeDocuments && c.rutaLiquidacionCompra) {
        iaOrchestrator.programarComprobante({
          bot,
          chatId: ctx.chat.id,
          comprobanteId: c.id,
          actor: { telegramId: String(ctx.from.id), nombre: ctx.state.usuario.nombre },
        });
      }
      await notificarATelegramId(
        bot,
        c.solicitanteTelegramId,
        `📄 Contabilidad adjuntó la Liquidación de Compra del comprobante #${c.id}. ` +
          `Estado: ${c.estadoValidacion}.`
      );
      if (c.estadoValidacion === "correccion_requerida") {
        return ctx.reply(`⚠️ Archivo registrado, pero ${c.observacionValidacion}`);
      }
      return ctx.reply(
        `✅ Liquidación de Compra adjuntada al comprobante #${c.id}. ` +
          `Ahora revísala con /validarcomprobante ${c.id}.`
      );
    }

    if (ctx.session.flow !== "comprobante") return next();
    const fileId = fileIdDeMensaje(ctx);
    const d = ctx.session.data;

    if (ctx.session.step === "esperar_cedula_archivo") {
      d.rutaCedulaProveedor = rutaTelegram(fileId);
      const pendiente = continuarConRespaldos(ctx);
      if (pendiente) return pendiente;
      return finalizarRegistro(bot, ctx);
    }

    if (ctx.session.step === "esperar_archivo_principal") {
      d.rutaArchivo = rutaTelegram(fileId);
      const pendiente = continuarConRespaldos(ctx);
      if (pendiente) return pendiente;
      return finalizarRegistro(bot, ctx);
    }

    if (ctx.session.step === "esperar_respaldo_tarjeta") {
      d.rutaRespaldoTarjeta = rutaTelegram(fileId);
      const pendiente = continuarConRespaldos(ctx);
      if (pendiente) return pendiente;
      return finalizarRegistro(bot, ctx);
    }

    if (ctx.session.step === "esperar_respaldo_internet") {
      d.rutaRespaldoInternet = rutaTelegram(fileId);
      return finalizarRegistro(bot, ctx);
    }

    return next();
  });

  // ----- Revisión documental por Contabilidad -----

  bot.command("validarcomprobante", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /validarcomprobante <id>");
    const ia = await analisisIAService.ultimoPorEntidad("comprobante", id);
    if (ia?.recomendacion === "revisar") {
      const alertas = Array.isArray(ia.alertas) ? ia.alertas : [];
      const detalle = alertas.slice(0, 5).map((a) => `• ${a.message || a}`).join("\n");
      return ctx.reply(
        `🤖 La IA detectó ${alertas.length} alerta(s) en el comprobante #${id}.\n${detalle}` +
          `\n\nEsto no es un rechazo automático. Revisa el documento y, si decides validarlo igualmente, usa /validarcomprobanteconfirmar ${id}.`
      );
    }
    return ejecutarValidacionContable(bot, ctx, id);
  });

  bot.command("validarcomprobanteconfirmar", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    if (!id) return ctx.reply("Uso: /validarcomprobanteconfirmar <id>");
    return ejecutarValidacionContable(bot, ctx, id);
  });

  bot.command("observarcomprobante", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    const motivo = extraerMotivo(ctx);
    if (!id || !motivo) return ctx.reply("Uso: /observarcomprobante <id> <motivo>");
    const resultado = await comprobanteService.observarPorContabilidad(id, {
      motivo,
      contadoraTelegramId: String(ctx.from.id),
      contadoraNombre: ctx.state.usuario.nombre,
    });
    if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);
    await notificarATelegramId(
      bot,
      resultado.comprobante.solicitanteTelegramId,
      `⚠️ El comprobante #${id} requiere corrección o documentación complementaria. Motivo: ${motivo}. ` +
        `Si corresponde sustituirlo por un documento nuevo, regístralo con /comprobante en la misma solicitud; ` +
        `Contabilidad deberá cerrar el documento observado anterior con /rechazarcomprobante antes de /verificar.`
    );
    return ctx.reply(`✅ Observación registrada para el comprobante #${id}.`);
  });

  bot.command("rechazarcomprobante", requireRol("contadora"), async (ctx) => {
    const id = extraerId(ctx);
    const motivo = extraerMotivo(ctx);
    if (!id || !motivo) return ctx.reply("Uso: /rechazarcomprobante <id> <motivo>");
    const resultado = await comprobanteService.rechazarPorContabilidad(id, {
      motivo,
      contadoraTelegramId: String(ctx.from.id),
      contadoraNombre: ctx.state.usuario.nombre,
    });
    if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);
    await notificarATelegramId(
      bot,
      resultado.comprobante.solicitanteTelegramId,
      `❌ El comprobante #${id} fue rechazado por Contabilidad. Motivo: ${motivo}.`
    );
    return ctx.reply(`✅ Rechazo registrado para el comprobante #${id}.`);
  });

  bot.command("liquidacionemitida", requireRol("contadora"), async (ctx) => {
    const partes = ctx.message.text.trim().split(/\s+/);
    const id = Number(partes[1]);
    const fecha = partes[2];
    if (!Number.isInteger(id) || !isValidDateOnly(fecha || "")) {
      return ctx.reply("Uso: /liquidacionemitida <id> <AAAA-MM-DD>");
    }
    const c = await comprobanteService.obtenerPorId(id);
    if (!c) return ctx.reply(`⚠️ No existe el comprobante #${id}.`);
    if (c.tipo !== "liquidacion_compra") {
      return ctx.reply(`⚠️ El comprobante #${id} no corresponde a una Liquidación de Compra.`);
    }
    ctx.session.flow = "liquidacion_emitida";
    ctx.session.step = "esperar_archivo";
    ctx.session.data = { id, fechaLiquidacionCompra: fecha };
    return ctx.reply(
      `Adjunta la Liquidación de Compra emitida para el comprobante #${id}.\n` +
        `Fecha declarada de elaboración: ${fecha}. Compra: ${c.fechaCompra}.`
    );
  });

  bot.command("originalnotaventa", requireRol("contadora"), async (ctx) => {
    const partes = ctx.message.text.trim().split(/\s+/);
    const id = Number(partes[1]);
    const fecha = partes[2] || fechaHoyISO();
    if (!Number.isInteger(id) || !isValidDateOnly(fecha)) {
      return ctx.reply("Uso: /originalnotaventa <id> [AAAA-MM-DD]");
    }
    const resultado = await comprobanteService.marcarOriginalNotaVentaEntregado(id, {
      fechaEntrega: fecha,
      contadoraTelegramId: String(ctx.from.id),
      contadoraNombre: ctx.state.usuario.nombre,
    });
    if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);
    if (!resultado.cumplePlazo) {
      return ctx.reply(
        `⚠️ Original físico de la Nota de Venta #${id} registrado con fecha ${fecha}, ` +
          `pero fue entregado después del cierre contable ${resultado.comprobante.fechaLimiteCierre}.`
      );
    }
    return ctx.reply(`✅ Original físico de la Nota de Venta #${id} registrado con fecha ${fecha}, dentro del plazo.`);
  });

  bot.command("documentos", requireRol("contadora"), async (ctx) => {
    const solicitudId = extraerId(ctx);
    if (!solicitudId) return ctx.reply("Uso: /documentos <id de solicitud>");
    const resumen = await comprobanteService.resumenDocumentacionSolicitud(solicitudId);
    if (!resumen.comprobantes.length) {
      return ctx.reply(`La solicitud #${solicitudId} no tiene comprobantes vinculados.`);
    }
    const lineas = resumen.comprobantes.map((c) => {
      const reconocido = c.reconocidoParaPago ? "✅" : "⏳";
      return `${reconocido} #${c.id} ${c.tipo} — ${c.estadoValidacion}`;
    });
    return ctx.reply(
      `Documentación de la solicitud #${solicitudId}:\n${lineas.join("\n")}\n\n` +
        (resumen.listoParaVerificar
          ? "✅ La documentación está lista para /verificar."
          : "⚠️ Aún existe documentación pendiente o no hay un comprobante validado.")
    );
  });
}

module.exports = registerComprobanteFlow;
