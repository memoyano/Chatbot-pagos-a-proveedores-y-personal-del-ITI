const { Op } = require("sequelize");
const FacturaDocente = require("./facturaDocente.model");
const Docente = require("./docente.model");
const RolPagoDocentes = require("./rolPago.model");
const rules = require("../../rules/politicaDocentes.rules");
const logger = require("../../utils/logger");
const { fechaHoyISO } = require("../../utils/fechas");

async function obtenerRegistro(rolPagoId, docenteCedula) {
  return FacturaDocente.findOne({ where: { rolPagoId, docenteCedula } });
}

async function configurarFactura({ rolPagoId, docenteCedula, montoSolicitado, conceptoSolicitado }) {
  const rol = await RolPagoDocentes.findByPk(rolPagoId);
  if (!rol) return { error: `No existe el rol de pago #${rolPagoId}.` };
  if (!['rol_elaborado', 'facturas_solicitadas'].includes(rol.estado)) {
    return { error: `El rol #${rolPagoId} está en estado "${rol.estado}" y ya no admite configuración de facturas.` };
  }

  const docente = await Docente.findByPk(docenteCedula);
  if (!docente || !docente.activo) return { error: `No existe un docente activo con cédula ${docenteCedula}.` };

  const monto = Number(montoSolicitado);
  if (!Number.isFinite(monto) || monto <= 0) return { error: "El monto solicitado debe ser mayor que cero." };
  if (!conceptoSolicitado?.trim()) return { error: "El concepto solicitado es obligatorio." };

  let registro = await obtenerRegistro(rolPagoId, docenteCedula);
  if (registro && registro.correoEstado === "enviado") {
    return { error: "La solicitud ya fue enviada por correo. No se puede cambiar monto/concepto sin dejar trazabilidad." };
  }

  if (!registro) {
    registro = await FacturaDocente.create({
      rolPagoId,
      docenteCedula,
      conceptoSolicitado: conceptoSolicitado.trim(),
      montoSolicitado: monto.toFixed(2),
      estado: "preparacion",
    });
  } else {
    await registro.update({
      conceptoSolicitado: conceptoSolicitado.trim(),
      montoSolicitado: monto.toFixed(2),
      estado: "preparacion",
      correoEstado: "no_enviado",
      correoError: null,
    });
  }

  return { registro, docente, rol };
}

async function listarPorRol(rolPagoId) {
  const registros = await FacturaDocente.findAll({ where: { rolPagoId }, order: [["docenteCedula", "ASC"]] });
  const cedulas = registros.map((r) => r.docenteCedula);
  const docentes = cedulas.length ? await Docente.findAll({ where: { cedula: cedulas } }) : [];
  const mapa = Object.fromEntries(docentes.map((d) => [d.cedula, d]));
  return registros.map((r) => ({ ...r.toJSON(), docente: mapa[r.docenteCedula]?.toJSON?.() || mapa[r.docenteCedula] || null }));
}

async function registrarFacturaRecibida({
  rolPagoId,
  docenteCedula,
  fechaRecepcion,
  numeroFactura,
  montoFactura,
  conceptoFactura,
  rutaFactura,
}) {
  const registro = await obtenerRegistro(rolPagoId, docenteCedula);
  if (!registro) return { error: "No se encontró ese docente en este rol de pago." };
  if (!registro.fechaSolicitudFactura || !registro.fechaLimiteFactura) {
    return { error: "La solicitud de factura aún no fue enviada por correo a este docente." };
  }
  if (registro.estado === "pagada") return { error: "Esta factura ya fue pagada." };

  const evaluacion = rules.evaluarFacturaDocente({
    fechaSolicitud: registro.fechaSolicitudFactura,
    fechaRecepcion,
    conceptoSolicitado: registro.conceptoSolicitado,
    conceptoFactura,
    montoSolicitado: registro.montoSolicitado,
    montoFactura,
  });

  let estado;
  let elegiblePagoFinSemestre = false;
  if (evaluacion.elegibleRolActual) estado = "recibida";
  else if (!evaluacion.aTiempo) {
    estado = "rezagada";
    elegiblePagoFinSemestre = evaluacion.documentacionCorrecta;
  } else {
    estado = "con_error";
  }

  await registro.update({
    fechaRecepcionFactura: fechaRecepcion,
    numeroFactura: numeroFactura || null,
    montoFactura: Number(montoFactura).toFixed(2),
    conceptoFactura: conceptoFactura?.trim() || null,
    rutaFactura: rutaFactura || null,
    conceptoCoincide: evaluacion.conceptoCoincide,
    montoCoincide: evaluacion.montoCoincide,
    elegiblePagoFinSemestre,
    estado,
    observacion: evaluacion.motivos.join(" ") || null,
  });

  logger.info("Factura de docente registrada", {
    rolPagoId,
    docenteCedula,
    estado,
    aTiempo: evaluacion.aTiempo,
    documentacionCorrecta: evaluacion.documentacionCorrecta,
  });
  return { registro, evaluacion, aTiempo: evaluacion.aTiempo };
}

async function marcarConError({ rolPagoId, docenteCedula, observacion }) {
  const registro = await obtenerRegistro(rolPagoId, docenteCedula);
  if (!registro) return { error: "No se encontró ese docente en este rol de pago." };
  if (registro.estado === "pagada") return { error: "La factura ya fue pagada." };

  const hoy = fechaHoyISO();
  const vencida = registro.fechaLimiteFactura
    ? rules.facturaVencida({ fechaLimite: registro.fechaLimiteFactura, fechaReferencia: hoy })
    : false;
  await registro.update({
    estado: vencida ? "rezagada" : "con_error",
    elegiblePagoFinSemestre: false,
    observacion: observacion || "Factura devuelta para corrección",
  });
  return { registro, vencida };
}

async function marcarVencidasComoRezagadas(fechaReferencia = fechaHoyISO()) {
  const candidatas = await FacturaDocente.findAll({
    where: {
      estado: { [Op.in]: ["pendiente", "con_error"] },
      fechaLimiteFactura: { [Op.ne]: null },
    },
  });

  const vencidas = candidatas.filter((r) =>
    rules.facturaVencida({ fechaLimite: r.fechaLimiteFactura, fechaReferencia })
  );
  for (const r of vencidas) {
    await r.update({
      estado: "rezagada",
      elegiblePagoFinSemestre: Boolean(r.conceptoCoincide && r.montoCoincide && r.rutaFactura),
      observacion: r.observacion || "Plazo de tres (3) días vencido sin factura válida para el rol actual.",
    });
  }
  return vencidas;
}

async function listarRezagados(rolPagoId) {
  await marcarVencidasComoRezagadas();
  const registros = await FacturaDocente.findAll({ where: { rolPagoId, estado: "rezagada" } });
  const docentes = await Docente.findAll({ where: { cedula: registros.map((r) => r.docenteCedula) } });
  const porCedula = Object.fromEntries(docentes.map((d) => [d.cedula, d]));
  return registros.map((r) => ({
    ...r.toJSON(),
    nombreDocente: porCedula[r.docenteCedula]?.nombre || r.docenteCedula,
  }));
}

async function pendientesQueBloqueanRevision(rolPagoId) {
  await marcarVencidasComoRezagadas();
  return FacturaDocente.findAll({
    where: { rolPagoId, estado: { [Op.in]: ["preparacion", "pendiente", "con_error"] } },
  });
}

async function rezagadosListosParaPago(rolPagoId) {
  return FacturaDocente.findAll({
    where: {
      rolPagoId,
      estado: "rezagada",
      elegiblePagoFinSemestre: true,
    },
  });
}

module.exports = {
  obtenerRegistro,
  configurarFactura,
  registrarFacturaRecibida,
  marcarConError,
  listarRezagados,
  listarPorRol,
  marcarVencidasComoRezagadas,
  pendientesQueBloqueanRevision,
  rezagadosListosParaPago,
};
