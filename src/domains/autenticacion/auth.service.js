const crypto = require("crypto");
const ErpReplica = require("../erp/erpReplica.model");
const UsuarioAutenticado = require("./usuarioAutenticado.model");
const OtpVerificacion = require("./otpVerificacion.model");
const { enviarCorreoOtp } = require("../../utils/mailer");
const logger = require("../../utils/logger");

const OTP_TTL_MINUTOS = 5;
const OTP_MAX_INTENTOS = 3;

function generarOtpNumerico() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

function enmascararCorreo(correo) {
  const [usuario, dominio] = correo.split("@");
  const visible = usuario.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(usuario.length - 2, 1))}@${dominio}`;
}

async function buscarEnErp(cedulaRuc) {
  return ErpReplica.findOne({ where: { cedulaRuc, activo: true } });
}

async function generarYEnviarOtp({ telegramId, cedulaRuc, nombre, correoElectronico }) {
  const otp = generarOtpNumerico();
  const expiraEn = new Date(Date.now() + OTP_TTL_MINUTOS * 60 * 1000);

  await OtpVerificacion.create({
    telegramId,
    cedulaRuc,
    otpHash: hashOtp(otp),
    expiraEn,
    intentos: 0,
    usado: false,
  });

  const resultado = await enviarCorreoOtp({ correoElectronico, nombre, otp });
  logger.info("OTP generado", { telegramId, modo: resultado.modo });
  return { correoEnmascarado: enmascararCorreo(correoElectronico) };
}

async function validarOtp({ telegramId, otpIngresado }) {
  const registro = await OtpVerificacion.findOne({
    where: { telegramId, usado: false },
    order: [["createdAt", "DESC"]],
  });

  if (!registro) {
    return { valido: false, motivo: "No hay un código pendiente. Solicita uno nuevo con /start." };
  }
  if (new Date() > registro.expiraEn) {
    return { valido: false, motivo: "El código expiró. Solicita uno nuevo." };
  }
  if (registro.intentos >= OTP_MAX_INTENTOS) {
    return { valido: false, motivo: "Se agotaron los intentos para este código. Solicita uno nuevo." };
  }

  if (hashOtp(otpIngresado) !== registro.otpHash) {
    registro.intentos += 1;
    await registro.save();
    const restantes = OTP_MAX_INTENTOS - registro.intentos;
    return {
      valido: false,
      motivo:
        restantes > 0
          ? `Código incorrecto. Te quedan ${restantes} intento(s).`
          : "Código incorrecto. Se agotaron los intentos, solicita uno nuevo.",
    };
  }

  registro.usado = true;
  await registro.save();
  return { valido: true, motivo: null, cedulaRuc: registro.cedulaRuc };
}

async function marcarAutenticado({ telegramId, cedulaRuc, nombre, correoElectronico, rol }) {
  const [usuario] = await UsuarioAutenticado.upsert({
    telegramId,
    cedulaRuc,
    nombre,
    correoElectronico,
    rol,
    autenticadoEn: new Date(),
  });
  return usuario;
}

async function obtenerUsuarioAutenticado(telegramId) {
  return UsuarioAutenticado.findByPk(telegramId);
}

async function cerrarSesion(telegramId) {
  await UsuarioAutenticado.destroy({ where: { telegramId } });
}

module.exports = {
  buscarEnErp,
  generarYEnviarOtp,
  validarOtp,
  marcarAutenticado,
  obtenerUsuarioAutenticado,
  OTP_TTL_MINUTOS,
  cerrarSesion,
};
