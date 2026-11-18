const UsuarioAutenticado = require("../domains/autenticacion/usuarioAutenticado.model");
const notificacionService = require("../domains/notificaciones/notificacion.service");

async function notificarPorRol(bot, rol, mensaje) {
  const usuarios = await UsuarioAutenticado.findAll({ where: { rol } });
  for (const u of usuarios) {
    await notificacionService.enviarTelegram({
      bot,
      destinatarioTelegramId: u.telegramId,
      mensaje,
      tipo: "alerta_operativa",
    });
  }
  return usuarios.length;
}

async function notificarATelegramId(bot, telegramId, mensaje) {
  return notificacionService.enviarTelegram({
    bot,
    destinatarioTelegramId: telegramId,
    mensaje,
    tipo: "alerta_operativa",
  });
}

module.exports = { notificarPorRol, notificarATelegramId };
