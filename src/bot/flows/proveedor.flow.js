const { Markup } = require("telegraf");
const { registrarProveedor } = require("../../domains/proveedores/proveedor.service");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cada paso define: qué pregunta hacer y en qué campo de ctx.session.data guardar la respuesta.
const PASOS = [
  { step: "nombreTitularCuenta", pregunta: "¿Cuál es el nombre completo del titular de la cuenta bancaria?" },
  { step: "rucCedula", pregunta: "¿Cuál es el número de RUC o cédula del proveedor?" },
  { step: "institucionFinanciera", pregunta: "¿En qué institución financiera tiene la cuenta?" },
  { step: "numeroCuenta", pregunta: "¿Cuál es el número de cuenta bancaria?" },
  { step: "correoElectronico", pregunta: "¿Cuál es el correo electrónico del proveedor?" },
];

function registerProveedorFlow(bot) {
  bot.command("proveedor", (ctx) => {
    ctx.session.flow = "proveedor";
    ctx.session.step = "nombreTitularCuenta";
    ctx.session.data = {};
    return ctx.reply(
      "Vamos a registrar un proveedor nuevo (4.6 de la política).\n" +
        "Ingresa los datos que te proporcionó el proveedor.\n\n" +
        PASOS[0].pregunta
    );
  });

  bot.action(/pv_tipoCuenta_(ahorros|corriente)/, async (ctx) => {
    if (ctx.session.flow !== "proveedor") return ctx.answerCbQuery();
    ctx.session.data.tipoCuenta = ctx.match[1];
    ctx.answerCbQuery();
    return finalizarProveedor(ctx);
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.session.flow !== "proveedor") return next();

    const pasoActual = PASOS.find((p) => p.step === ctx.session.step);
    if (!pasoActual) return next();

    const valor = ctx.message.text.trim();

    if (pasoActual.step === "correoElectronico" && !EMAIL_REGEX.test(valor)) {
      return ctx.reply("Ese correo no parece válido. Intenta de nuevo, ej. contacto@proveedor.com");
    }

    ctx.session.data[pasoActual.step] = valor;

    const siguienteIndex = PASOS.findIndex((p) => p.step === pasoActual.step) + 1;
    if (siguienteIndex < PASOS.length) {
      ctx.session.step = PASOS[siguienteIndex].step;
      return ctx.reply(PASOS[siguienteIndex].pregunta);
    }

    // Ya se completaron los campos de texto, falta el tipo de cuenta
    ctx.session.step = "tipoCuenta";
    return ctx.reply(
      "Por último, ¿qué tipo de cuenta es?",
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Ahorros", "pv_tipoCuenta_ahorros"),
          Markup.button.callback("Corriente", "pv_tipoCuenta_corriente"),
        ],
      ])
    );
  });

  async function finalizarProveedor(ctx) {
    const { proveedor, error } = await registrarProveedor({
      ...ctx.session.data,
      registradoPorTelegramId: String(ctx.from.id),
    });

    ctx.session.flow = null;
    ctx.session.step = null;

    if (error) {
      return ctx.reply(`⚠️ No se pudo registrar el proveedor: ${error}`);
    }
    return ctx.reply(
      `✅ Proveedor "${proveedor.nombreTitularCuenta}" registrado correctamente (ID #${proveedor.id}).\n` +
        "Ya puede utilizarse en las solicitudes de pago."
    );
  }
}

module.exports = registerProveedorFlow;
