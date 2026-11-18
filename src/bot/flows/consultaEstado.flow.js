const rules = require("../../rules/politicaPagos.rules");
const { fechaHoyISO } = require("../../utils/fechas");
const {
  listarPorSolicitante,
  listarPendientes,
} = require("../../domains/solicitudesPago/solicitudPago.service");

const ICONO_ESTADO = {
  pendiente_autorizacion_excepcional: "🚨",
  pendiente: "🕓",
  rechazada: "❌",
  verificada: "🔎",
  reporte_generado: "📋",
  orden_transferencia: "📝",
  aprobada: "🟢",
  pagada: "💰",
};

function formatearSolicitud(s) {
  let linea =
    `${ICONO_ESTADO[s.estado] || "•"} #${s.id} — ${s.tipo} — ` +
    `desembolso solicitado: ${s.fechaDesembolsoRequerida} — estado: ${s.estado}`;

  if (s.eventoInstitucionalId) {
    linea += `\n   Evento vinculado: #${s.eventoInstitucionalId}`;
  }
  if (s.fechaProgramadaPago) {
    linea += `\n   Pago programado: ${s.fechaProgramadaPago}`;
  }
  if (s.motivoReprogramacion) {
    linea += `\n   Programación: ${s.motivoReprogramacion}`;
  }
  if (s.estado === "rechazada" && s.motivoRechazo) {
    linea += `\n   Motivo: ${s.motivoRechazo}`;
  }
  return linea;
}

function registerConsultaEstadoFlow(bot) {
  bot.command("estado", async (ctx) => {
    if (ctx.state.usuario.rol === "contadora") {
      const pendientes = await listarPendientes();
      if (pendientes.length === 0) {
        return ctx.reply("📋 No hay solicitudes pendientes de verificación en este momento.");
      }
      const proximoViernes = rules.calcularProximoViernesDePago(fechaHoyISO());
      const cuerpo = pendientes.map(formatearSolicitud).join("\n\n");
      return ctx.reply(
        `📋 Solicitudes pendientes de verificación (${pendientes.length}):\n\n${cuerpo}\n\n` +
          `Próximo día de pago a proveedores: ${proximoViernes} ` +
          "(las solicitudes deben quedar completas hasta el miércoles para entrar en ese ciclo)."
      );
    }

    const propias = await listarPorSolicitante(String(ctx.from.id));
    if (propias.length === 0) {
      return ctx.reply("Aún no tienes solicitudes de pago registradas. Usa /solicitud para crear una.");
    }
    const cuerpo = propias.map(formatearSolicitud).join("\n\n");
    return ctx.reply(`📋 Tus últimas solicitudes:\n\n${cuerpo}`);
  });
}

module.exports = registerConsultaEstadoFlow;
