const rolPagoService = require("../../domains/docentes/rolPago.service");
const facturaService = require("../../domains/docentes/facturaDocente.service");
const novedadService = require("../../domains/docentes/novedadDocente.service");
const { requireRol } = require("../middlewares/auth.middleware");
const { notificarPorRol } = require("../../utils/notificaciones");
const { fechaHoyISO, isValidDateOnly } = require("../../utils/fechas");
const config = require("../../config/env");
const iaOrchestrator = require("../../ia/orchestrator.service");

function partes(ctx) {
  return ctx.message.text.trim().split(/\s+/);
}

function fileIdDeMensaje(ctx) {
  if (ctx.message.photo) return ctx.message.photo[ctx.message.photo.length - 1].file_id;
  if (ctx.message.document) return ctx.message.document.file_id;
  return null;
}

function rutaTelegram(fileId) {
  return fileId ? `telegram:${fileId}` : null;
}

function usuarioActual(ctx) {
  return {
    telegramId: String(ctx.from.id),
    nombre: ctx.state.usuario.nombre,
  };
}

function registerRolPagoDocentesFlow(bot) {
  bot.command("iniciarroldepagos", requireRol("director_general"), async (ctx) => {
    const periodo = partes(ctx).slice(1).join(" ");
    if (!periodo) return ctx.reply("Uso correcto: /iniciarroldepagos <periodo>\nEj: /iniciarroldepagos 2026-S2");

    const rol = await rolPagoService.iniciarRol({ periodo, creadoPorTelegramId: String(ctx.from.id) });
    await notificarPorRol(
      bot,
      "contadora",
      `📄 Nuevas matrices recibidas para el rol de pagos #${rol.id} (${periodo}). ` +
        `Según el procedimiento, dispones de medio día laborable para elaborar el rol: /elaborarrol ${rol.id}`
    );
    return ctx.reply(`✅ Rol de pago #${rol.id} (${periodo}) iniciado. Se notificó a Contabilidad.`);
  });

  bot.command("elaborarrol", requireRol("contadora"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /elaborarrol <id>");

    const { error } = await rolPagoService.elaborarRol(id);
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarPorRol(
      bot,
      "asistente_contable",
      `📋 El rol de pagos #${id} fue elaborado. Contabilidad cargará el monto y concepto exacto de cada docente; ` +
        `cuando esté listo podrás ejecutar /solicitarfacturas ${id}.`
    );
    return ctx.reply(
      `✅ Rol #${id} elaborado.\n\n` +
        `Ahora carga únicamente los docentes incluidos en las matrices con:\n` +
        `/configurarfactura ${id} <cedula> <monto> <concepto exacto>\n\n` +
        `Ejemplo:\n/configurarfactura ${id} 1755555555 450.00 SERVICIOS PROFESIONALES DE DOCENCIA SEPTIEMBRE 2026`
    );
  });

  bot.command("configurarfactura", requireRol("contadora"), async (ctx) => {
    const p = partes(ctx);
    const rolPagoId = Number(p[1]);
    const docenteCedula = p[2];
    const monto = p[3];
    const concepto = p.slice(4).join(" ").trim();
    if (!rolPagoId || !docenteCedula || !monto || !concepto) {
      return ctx.reply("Uso correcto: /configurarfactura <rolId> <cedula> <monto> <concepto exacto>");
    }

    const { registro, docente, error } = await facturaService.configurarFactura({
      rolPagoId,
      docenteCedula,
      montoSolicitado: monto,
      conceptoSolicitado: concepto,
    });
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(
      `✅ ${docente.nombre} configurado/a en el rol #${rolPagoId}.\n` +
        `Monto: USD ${Number(registro.montoSolicitado).toFixed(2)}\n` +
        `Concepto exacto: ${registro.conceptoSolicitado}`
    );
  });

  bot.command("resumenrol", requireRol("contadora", "asistente_contable"), async (ctx) => {
    const rolId = Number(partes(ctx)[1]);
    if (!rolId) return ctx.reply("Uso correcto: /resumenrol <rolId>");
    const rol = await rolPagoService.obtenerPorId(rolId);
    if (!rol) return ctx.reply(`⚠️ No existe el rol #${rolId}.`);
    const registros = await facturaService.listarPorRol(rolId);
    if (!registros.length) return ctx.reply(`El rol #${rolId} todavía no tiene docentes configurados.`);

    const lineas = registros.map((r) => {
      const nombre = r.docente?.nombre || r.docenteCedula;
      const monto = r.montoSolicitado != null ? `USD ${Number(r.montoSolicitado).toFixed(2)}` : "sin monto";
      const limite = r.fechaLimiteFactura ? ` · límite ${r.fechaLimiteFactura}` : "";
      const finSem = r.estado === "rezagada" ? (r.elegiblePagoFinSemestre ? " · ✅ listo fin semestre" : " · ⚠️ falta factura válida") : "";
      return `• ${nombre} (${r.docenteCedula}) — ${monto} — ${r.estado}${limite}${finSem}`;
    });
    return ctx.reply(`📋 Rol #${rolId} — ${rol.periodo}\nEstado: ${rol.estado}\n\n${lineas.join("\n")}`);
  });

  bot.command("solicitarfacturas", requireRol("asistente_contable"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /solicitarfacturas <id>");

    const { error, docentesNotificados, yaEnviadas, fallidos, fechaLimite } = await rolPagoService.solicitarFacturas(id);
    if (error) return ctx.reply(`⚠️ ${error}`);

    const mensajes = [
      `✅ Proceso de correo ejecutado para el rol #${id}.`,
      `Correos enviados ahora: ${docentesNotificados}.`,
      `Solicitudes ya enviadas previamente: ${yaEnviadas || 0}.`,
    ];
    if (fechaLimite) mensajes.push(`Fecha límite de las solicitudes enviadas: ${fechaLimite}.`);
    if (fallidos?.length) {
      mensajes.push(
        `⚠️ No se enviaron ${fallidos.length} correo(s):\n` +
          fallidos.map((f) => `• ${f.docenteCedula}: ${f.error}`).join("\n") +
          `\nVuelve a ejecutar /solicitarfacturas ${id} después de corregir el problema.`
      );
    }
    return ctx.reply(mensajes.join("\n"));
  });

  // La recepción se convierte en un pequeño flujo para dejar evidencia del
  // número, monto, concepto y archivo de la factura electrónica.
  bot.command("facturarecibida", requireRol("asistente_contable", "contadora"), async (ctx) => {
    const [, rolIdRaw, cedula, fechaRaw] = partes(ctx);
    const rolId = Number(rolIdRaw);
    if (!rolId || !cedula) {
      return ctx.reply("Uso correcto: /facturarecibida <rolId> <cedulaDocente> [AAAA-MM-DD]");
    }
    const fechaRecepcion = fechaRaw || fechaHoyISO();
    if (!isValidDateOnly(fechaRecepcion)) return ctx.reply("La fecha debe usar formato AAAA-MM-DD.");

    const registro = await facturaService.obtenerRegistro(rolId, cedula);
    if (!registro) return ctx.reply("⚠️ No se encontró ese docente en el rol indicado.");

    ctx.session.flow = "factura_docente";
    ctx.session.step = "numero";
    ctx.session.data = { rolPagoId: rolId, docenteCedula: cedula, fechaRecepcion };
    return ctx.reply(`Registraremos la factura de ${cedula} para el rol #${rolId}.\nIndica el número de factura:`);
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.session.flow !== "factura_docente") return next();
    const texto = ctx.message.text.trim();
    const d = ctx.session.data;

    if (ctx.session.step === "numero") {
      d.numeroFactura = texto;
      ctx.session.step = "monto";
      return ctx.reply("Indica el monto TOTAL de la factura. Ejemplo: 450.00");
    }
    if (ctx.session.step === "monto") {
      const monto = Number(texto.replace(",", "."));
      if (!Number.isFinite(monto) || monto <= 0) return ctx.reply("Monto inválido. Ejemplo: 450.00");
      d.montoFactura = monto;
      ctx.session.step = "concepto";
      return ctx.reply("Copia exactamente el concepto que consta en la factura:");
    }
    if (ctx.session.step === "concepto") {
      d.conceptoFactura = texto;
      ctx.session.step = "archivo";
      return ctx.reply("Adjunta ahora la factura electrónica (PDF/XML) o una imagen legible del comprobante.");
    }
    return next();
  });

  bot.on(["photo", "document"], async (ctx, next) => {
    if (ctx.session.flow !== "factura_docente" || ctx.session.step !== "archivo") return next();
    const fileId = fileIdDeMensaje(ctx);
    if (!fileId) return ctx.reply("No pude identificar el archivo. Intenta nuevamente.");
    const d = ctx.session.data;

    const resultado = await facturaService.registrarFacturaRecibida({
      rolPagoId: d.rolPagoId,
      docenteCedula: d.docenteCedula,
      fechaRecepcion: d.fechaRecepcion,
      numeroFactura: d.numeroFactura,
      montoFactura: d.montoFactura,
      conceptoFactura: d.conceptoFactura,
      rutaFactura: rutaTelegram(fileId),
    });

    ctx.session.flow = null;
    ctx.session.step = null;
    ctx.session.data = {};

    if (resultado.error) return ctx.reply(`⚠️ ${resultado.error}`);

    if (config.ai.autoAnalyzeDocuments) {
      iaOrchestrator.programarFacturaDocente({
        bot,
        chatId: ctx.chat.id,
        rolPagoId: d.rolPagoId,
        docenteCedula: d.docenteCedula,
        actor: { telegramId: String(ctx.from.id), nombre: ctx.state.usuario.nombre },
      });
    }

    const e = resultado.evaluacion;
    if (e.elegibleRolActual) {
      return ctx.reply(`✅ Factura registrada correctamente y a tiempo. El docente queda incluido en el rol actual.`);
    }
    if (e.elegibleFinSemestre) {
      return ctx.reply(
        `⚠️ La factura es documentalmente correcta, pero llegó fuera del plazo de tres (3) días.\n` +
          `El docente queda rezagado y listo para pago cuando Contabilidad ejecute el cierre institucional de semestre.`
      );
    }
    return ctx.reply(`↩️ La factura requiere corrección:\n${e.motivos.map((m) => `• ${m}`).join("\n")}`);
  });

  bot.command("facturaerror", requireRol("contadora"), async (ctx) => {
    const [, rolId, cedula, ...obs] = partes(ctx);
    if (!rolId || !cedula) return ctx.reply("Uso correcto: /facturaerror <rolId> <cedulaDocente> <motivo>");
    const { error, vencida } = await facturaService.marcarConError({
      rolPagoId: Number(rolId),
      docenteCedula: cedula,
      observacion: obs.join(" ") || "Factura devuelta para corrección",
    });
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(
      vencida
        ? `⚠️ La factura fue observada y el plazo ya venció. ${cedula} queda rezagado/a; deberá entregar una factura válida para pago de fin de semestre.`
        : `↩️ Factura de ${cedula} devuelta a corrección en el rol #${rolId}.`
    );
  });

  bot.command("rezagados", requireRol("contadora", "asistente_contable"), async (ctx) => {
    const rolId = Number(partes(ctx)[1]);
    if (!rolId) return ctx.reply("Uso correcto: /rezagados <rolId>");
    const rezagados = await facturaService.listarRezagados(rolId);
    if (!rezagados.length) return ctx.reply(`No hay docentes rezagados en el rol #${rolId}.`);
    const cuerpo = rezagados
      .map((r) =>
        `• ${r.nombreDocente} (${r.docenteCedula}) — ` +
        (r.elegiblePagoFinSemestre ? "✅ factura válida para fin de semestre" : "⚠️ pendiente de factura válida")
      )
      .join("\n");
    return ctx.reply(`📋 Rezagados del rol #${rolId}:\n\n${cuerpo}`);
  });

  bot.command("documentacionrevisada", requireRol("contadora"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /documentacionrevisada <id>");
    const { error } = await rolPagoService.marcarDocumentacionRevisada(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(`✅ Documentación y retenciones del rol #${id} marcadas como revisadas.`);
  });

  bot.command("detallepagodocentes", requireRol("contadora"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /detallepagodocentes <id>");
    const { error } = await rolPagoService.generarDetalle(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    await notificarPorRol(bot, "colecturia", `📝 Detalle de pagos del rol de docentes #${id} listo para orden de transferencia.`);
    return ctx.reply(`✅ Detalle generado para el rol #${id}. Se notificó a Colecturía.`);
  });

  bot.command("ordendocentes", requireRol("colecturia"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /ordendocentes <id>");
    const { error } = await rolPagoService.generarOrden(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(`✅ Orden de transferencia generada para el rol #${id}. Usa /pagardocentes ${id} para cerrar el proceso.`);
  });

  bot.command("pagardocentes", requireRol("colecturia"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /pagardocentes <id>");
    const { error } = await rolPagoService.marcarPagado(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    await notificarPorRol(bot, "contadora", `💰 El rol de pago a docentes #${id} fue pagado.`);
    return ctx.reply(`✅ Rol #${id} marcado como pagado. Los rezagados permanecen pendientes para fin de semestre.`);
  });

  // Pago de rezagados: el documento no define una fecha calendario exacta de
  // fin de semestre; Contabilidad dispara la etapa cuando institucionalmente corresponde.
  bot.command("prepararpagorezagados", requireRol("contadora"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /prepararpagorezagados <rolId>");
    const { error, cantidad } = await rolPagoService.prepararPagoRezagados(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    await notificarPorRol(bot, "colecturia", `📚 ${cantidad} docente(s) rezagado(s) del rol #${id} están listos para orden de fin de semestre: /ordenrezagados ${id}`);
    return ctx.reply(`✅ ${cantidad} rezagado(s) preparados para pago de fin de semestre.`);
  });

  bot.command("ordenrezagados", requireRol("colecturia"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /ordenrezagados <rolId>");
    const { error } = await rolPagoService.generarOrdenRezagados(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(`✅ Orden de rezagados generada. Cuando se ejecute la transferencia usa /pagarrezagados ${id}.`);
  });

  bot.command("pagarrezagados", requireRol("colecturia"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /pagarrezagados <rolId>");
    const { error, cantidad } = await rolPagoService.pagarRezagados(id);
    if (error) return ctx.reply(`⚠️ ${error}`);
    await notificarPorRol(bot, "contadora", `💰 Se ejecutó el pago de fin de semestre de ${cantidad} rezagado(s) del rol #${id}.`);
    return ctx.reply(`✅ ${cantidad} docente(s) rezagado(s) marcados como pagados.`);
  });

  // El coordinador REPORTA la novedad; ya no modifica directamente el valor económico.
  bot.command("reportarnovedad", requireRol("coordinador_carrera"), async (ctx) => {
    const texto = ctx.message.text.replace(/^\/reportarnovedad(?:@\w+)?\s*/i, "").trim();
    const campos = texto.includes("|") ? texto.split("|").map((x) => x.trim()) : texto.split(/\s+/);
    const cedula = campos[0];
    const nuevoGrado = campos[1];
    const nuevoValor = campos[2] || null;
    const motivo = campos[3] || null;
    if (!cedula || !nuevoGrado) {
      return ctx.reply(
        "Uso recomendado: /reportarnovedad <cedula> | <nuevo grado> | <nuevo valor hora opcional> | <motivo opcional>"
      );
    }

    const { novedad, docente, error } = await novedadService.reportar({
      docenteCedula: cedula,
      gradoProfesionalPropuesto: nuevoGrado,
      valorHoraPropuesto: nuevoValor ? Number(nuevoValor) : null,
      motivo,
      usuario: usuarioActual(ctx),
    });
    if (error) return ctx.reply(`⚠️ ${error}`);

    await notificarPorRol(
      bot,
      "contadora",
      `📢 Novedad docente #${novedad.id}: ${docente.nombre} (${cedula}).\n` +
        `Grado propuesto: ${nuevoGrado}` +
        (nuevoValor ? `\nValor hora propuesto: ${nuevoValor}` : "") +
        `\nRevisar con /aprobarnovedaddocente ${novedad.id} o /rechazarnovedaddocente ${novedad.id} <motivo>.`
    );
    return ctx.reply(`✅ Novedad #${novedad.id} reportada a Contabilidad. Los datos del docente no se modifican hasta su aprobación.`);
  });

  bot.command("novedadesdocentes", requireRol("contadora"), async (ctx) => {
    const novedades = await novedadService.listarPendientes();
    if (!novedades.length) return ctx.reply("No hay novedades de docentes pendientes.");
    return ctx.reply(
      `📋 Novedades pendientes:\n\n` +
        novedades
          .map((n) => `#${n.id} — ${n.docenteCedula} — ${n.gradoProfesionalPropuesto}` + (n.valorHoraPropuesto ? ` — $${n.valorHoraPropuesto}/h` : ""))
          .join("\n")
    );
  });

  bot.command("aprobarnovedaddocente", requireRol("contadora"), async (ctx) => {
    const id = Number(partes(ctx)[1]);
    if (!id) return ctx.reply("Uso correcto: /aprobarnovedaddocente <id>");
    const { docente, error } = await novedadService.aprobar(id, usuarioActual(ctx));
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(`✅ Novedad #${id} aprobada. Datos actualizados para ${docente.nombre}.`);
  });

  bot.command("rechazarnovedaddocente", requireRol("contadora"), async (ctx) => {
    const p = partes(ctx);
    const id = Number(p[1]);
    const motivo = p.slice(2).join(" ");
    if (!id || !motivo) return ctx.reply("Uso correcto: /rechazarnovedaddocente <id> <motivo>");
    const { error } = await novedadService.rechazar(id, usuarioActual(ctx), motivo);
    if (error) return ctx.reply(`⚠️ ${error}`);
    return ctx.reply(`✅ Novedad #${id} rechazada.`);
  });
}

module.exports = registerRolPagoDocentesFlow;
