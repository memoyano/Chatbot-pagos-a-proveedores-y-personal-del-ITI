const { Markup } = require("telegraf");
const authService = require("../../domains/autenticacion/auth.service");

function iniciarAutenticacion(ctx) {
  ctx.session.flow = "auth";
  ctx.session.step = "esperar_cedula";
  ctx.session.data = {};
  return ctx.reply(
    "🔐 Bienvenido/a al asistente de pagos del ITI.\n\n" +
    "Este bot es de uso exclusivo para funcionarios del Instituto. " +
    "Antes de continuar, verifiquemos tu identidad.\n\n" +
    "Ingresa tu número de cédula:"
  );
}

function registerAuthFlow(bot) {

  bot.command("logout", async (ctx) => {
    await authService.cerrarSesion(String(ctx.from.id));
    ctx.session.usuario = null;
    ctx.session.flow = null;
    ctx.session.step = null;
    return ctx.reply("🔓 Sesión cerrada. Envía /start para autenticarte con otra cédula.");
  });

  bot.action("auth_reenviar_otp", async (ctx) => {
    ctx.answerCbQuery();
    return enviarOtp(ctx);
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.session.flow !== "auth") return next();

    if (ctx.session.step === "esperar_cedula") {
      const cedulaRuc = ctx.message.text.trim();
      const registro = await authService.buscarEnErp(cedulaRuc);

      if (!registro) {
        return ctx.reply(
          "No encontramos ese número de cédula registrado como funcionario del ITI.\n" +
          "Verifica el número e intenta de nuevo, o contacta a Contabilidad si el problema persiste."
        );
      }

      ctx.session.data.cedulaRuc = registro.cedulaRuc;
      ctx.session.data.nombre = registro.nombre;
      ctx.session.data.correoElectronico = registro.correoElectronico;
      ctx.session.data.rol = registro.rol;
      ctx.session.step = "esperar_otp";
      return enviarOtp(ctx);
    }

    if (ctx.session.step === "esperar_otp") {
      const otpIngresado = ctx.message.text.trim();
      const resultado = await authService.validarOtp({
        telegramId: String(ctx.from.id),
        otpIngresado,
      });

      if (!resultado.valido) {
        return ctx.reply(
          `❌ ${resultado.motivo}`,
          Markup.inlineKeyboard([[Markup.button.callback("Reenviar código", "auth_reenviar_otp")]])
        );
      }

      await authService.marcarAutenticado({
        telegramId: String(ctx.from.id),
        cedulaRuc: ctx.session.data.cedulaRuc,
        nombre: ctx.session.data.nombre,
        correoElectronico: ctx.session.data.correoElectronico,
        rol: ctx.session.data.rol,
      });

      ctx.session.usuario = {
        cedulaRuc: ctx.session.data.cedulaRuc,
        nombre: ctx.session.data.nombre,
        rol: ctx.session.data.rol,
      };
      ctx.session.flow = null;
      ctx.session.step = null;

      return ctx.reply(
        `✅ Identidad verificada. ¡Bienvenido/a, ${ctx.session.usuario.nombre}!\n` +
        "Envía /start para ver las opciones disponibles."
      );
    }

    return next();
  });

  async function enviarOtp(ctx) {
    const { correoEnmascarado } = await authService.generarYEnviarOtp({
      telegramId: String(ctx.from.id),
      cedulaRuc: ctx.session.data.cedulaRuc,
      nombre: ctx.session.data.nombre,
      correoElectronico: ctx.session.data.correoElectronico,
    });
    return ctx.reply(
      `📧 Enviamos un código de verificación a ${correoEnmascarado}. ` +
      `Escríbelo aquí (expira en ${authService.OTP_TTL_MINUTOS} minutos):`
    );
  }
}

module.exports = { registerAuthFlow, iniciarAutenticacion };
