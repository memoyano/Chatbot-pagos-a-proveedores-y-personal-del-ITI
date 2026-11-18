const UsuarioAutenticado = require("../autenticacion/usuarioAutenticado.model");
const Notificacion = require("./notificacion.model");
const logger = require("../../utils/logger");

async function enviarTelegram({
  bot,
  destinatarioTelegramId,
  mensaje,
  tipo = "alerta_operativa",
  claveUnica = null,
  entidad = null,
  entidadId = null,
  fechaObjetivo = null,
}) {
  const telegramId = String(destinatarioTelegramId);
  let registro = claveUnica ? await Notificacion.findOne({ where: { claveUnica } }) : null;
  if (registro?.estado === "enviado") {
    return { enviado: false, duplicado: true, registro };
  }

  if (!registro) {
    registro = await Notificacion.create({
      tipo,
      claveUnica,
      destinatarioTelegramId: telegramId,
      mensaje,
      entidad,
      entidadId: entidadId == null ? null : String(entidadId),
      fechaObjetivo,
      estado: "pendiente",
      enviadoEn: null,
    });
  }

  try {
    const result = await bot.telegram.sendMessage(telegramId, mensaje);
    await registro.update({ estado: "enviado", enviadoEn: new Date(), error: null });
    return { enviado: true, duplicado: false, registro, result };
  } catch (error) {
    await registro.update({ estado: "error", error: error.message });
    logger.warn("No se pudo enviar notificación", { telegramId, tipo, error: error.message });
    return { enviado: false, duplicado: false, registro, error };
  }
}

async function enviarPorRolUnaVez({ bot, rol, mensaje, tipo, claveBase, entidad = null, entidadId = null, fechaObjetivo = null }) {
  const usuarios = await UsuarioAutenticado.findAll({ where: { rol } });
  let enviados = 0;
  for (const u of usuarios) {
    const r = await enviarTelegram({
      bot,
      destinatarioTelegramId: u.telegramId,
      mensaje,
      tipo,
      claveUnica: `${claveBase}:${u.telegramId}`,
      entidad,
      entidadId,
      fechaObjetivo,
    });
    if (r.enviado) enviados += 1;
  }
  return { usuarios: usuarios.length, enviados };
}

async function enviarATodosUnaVez({ bot, mensaje, tipo, claveBase, fechaObjetivo = null }) {
  const usuarios = await UsuarioAutenticado.findAll();
  let enviados = 0;
  for (const u of usuarios) {
    const r = await enviarTelegram({
      bot,
      destinatarioTelegramId: u.telegramId,
      mensaje,
      tipo,
      claveUnica: `${claveBase}:${u.telegramId}`,
      fechaObjetivo,
    });
    if (r.enviado) enviados += 1;
  }
  return { usuarios: usuarios.length, enviados };
}

module.exports = { enviarTelegram, enviarPorRolUnaVez, enviarATodosUnaVez };
