const nodemailer = require("nodemailer");
const config = require("../config/env");
const logger = require("./logger");

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

async function enviarCorreoOtp({ correoElectronico, nombre, otp }) {
  const asunto = "Código de verificación — Chatbot de Pagos ITI";
  const cuerpo =
    `Hola ${nombre},\n\n` +
    `Tu código de verificación es: ${otp}\n\n` +
    "Este código expira en 5 minutos. Si no solicitaste este código, ignora este mensaje.";

  const t = getTransporter();
  if (!t) {
    logger.warn(`[MODO DESARROLLO] No hay SMTP configurado. OTP para ${correoElectronico}: ${otp}`);
    return { enviado: false, modo: "consola" };
  }

  await t.sendMail({ from: config.smtp.from, to: correoElectronico, subject: asunto, text: cuerpo });
  logger.info("OTP enviado por correo", { correoElectronico });
  return { enviado: true, modo: "smtp" };
}

const { construirCorreoSolicitudFacturaDocente } = require("./mailTemplates");

async function enviarSolicitudFacturaDocente({
  correoElectronico,
  nombre,
  periodo,
  conceptoSolicitado,
  montoSolicitado,
  fechaLimite,
}) {
  const { asunto, cuerpo } = construirCorreoSolicitudFacturaDocente({
    nombre,
    periodo,
    conceptoSolicitado,
    montoSolicitado,
    fechaLimite,
  });

  const t = getTransporter();
  if (!t) {
    logger.warn("No hay SMTP configurado; no se inició el plazo de factura del docente", {
      correoElectronico,
      periodo,
    });
    return { enviado: false, modo: "sin_smtp", error: "SMTP no configurado" };
  }

  await t.sendMail({
    from: config.smtp.from,
    to: correoElectronico,
    subject: asunto,
    text: cuerpo,
  });
  logger.info("Solicitud de factura enviada por correo", { correoElectronico, periodo });
  return { enviado: true, modo: "smtp" };
}

module.exports = {
  enviarCorreoOtp,
  enviarSolicitudFacturaDocente,
  construirCorreoSolicitudFacturaDocente,
};
