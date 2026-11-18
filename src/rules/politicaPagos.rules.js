const {
  parseDateOnly,
  formatDateOnly,
  addDaysDateOnly,
  compareDateOnly,
  diaSemanaDateOnly,
  partesDateOnly,
  fechaHoyISO,
} = require("../utils/fechas");

const POLITICA_PAGOS_VERSION = "V21082026";
const MIN_DIAS_SOLICITUD_NORMAL = 3;
const MIN_DIAS_ANTICIPO_GIRA = 3;
const MIN_DIAS_URGENTE_SIN_EXCEPCION = 1;

function diasEntre(fechaInicio, fechaFin) {
  const unDia = 1000 * 60 * 60 * 24;
  const inicio = parseDateOnly(fechaInicio);
  const fin = parseDateOnly(fechaFin);
  return Math.round((fin.getTime() - inicio.getTime()) / unDia);
}

/** 4.1 Solicitud de pagos: valida anticipación y la excepción de mismo día. */
function validarAnticipacionSolicitud({
  tipo,
  fechaSolicitud,
  fechaDesembolsoRequerida,
  justificacion,
}) {
  const dias = diasEntre(fechaSolicitud, fechaDesembolsoRequerida);
  const tieneJustificacion = !!justificacion?.trim();

  if (dias < 0) {
    return {
      valido: false,
      requiereAutorizacion: false,
      motivo: "La fecha de desembolso no puede ser anterior a la solicitud.",
    };
  }

  if (tipo === "excepcional_mismo_dia") {
    if (dias !== 0) {
      return {
        valido: false,
        requiereAutorizacion: false,
        motivo: "La modalidad excepcional de mismo día solo aplica cuando el desembolso se requiere hoy.",
      };
    }
    if (!tieneJustificacion) {
      return {
        valido: false,
        requiereAutorizacion: false,
        motivo: "Los pagos excepcionales del mismo día requieren una justificación obligatoria.",
      };
    }
    return { valido: true, requiereAutorizacion: true, motivo: null };
  }

  if (tipo === "urgente") {
    if (!tieneJustificacion) {
      return {
        valido: false,
        requiereAutorizacion: false,
        motivo: "Los pagos urgentes requieren una justificación obligatoria.",
      };
    }
    if (dias < MIN_DIAS_URGENTE_SIN_EXCEPCION) {
      return {
        valido: false,
        requiereAutorizacion: false,
        motivo:
          "Un pago requerido el mismo día debe registrarse como excepcional y contar con autorización de una autoridad institucional.",
      };
    }
    return { valido: true, requiereAutorizacion: false, motivo: null };
  }

  if (tipo === "anticipo_gira" && dias < MIN_DIAS_ANTICIPO_GIRA) {
    return {
      valido: false,
      requiereAutorizacion: false,
      motivo: `Los anticipos para giras académicas requieren mínimo ${MIN_DIAS_ANTICIPO_GIRA} días de anticipación.`,
    };
  }

  if (tipo === "normal" && dias < MIN_DIAS_SOLICITUD_NORMAL) {
    return {
      valido: false,
      requiereAutorizacion: false,
      motivo: `Toda solicitud de pago requiere mínimo ${MIN_DIAS_SOLICITUD_NORMAL} días de anticipación.`,
    };
  }

  if (!["normal", "anticipo_gira", "urgente"].includes(tipo)) {
    return {
      valido: false,
      requiereAutorizacion: false,
      motivo: `Tipo de solicitud no reconocido: ${tipo}.`,
    };
  }

  return { valido: true, requiereAutorizacion: false, motivo: null };
}

/** 4.4 y 4.9: día 28; febrero 26 para cierre y 25 para caja chica. */
function fechaLimiteDelMes(anio, mesIndiceCero, tipo = "cierre_contable") {
  const esFebrero = mesIndiceCero === 1;
  let dia;
  if (tipo === "cierre_contable") dia = esFebrero ? 26 : 28;
  else if (tipo === "caja_chica") dia = esFebrero ? 25 : 28;
  else throw new Error(`Tipo de cierre no reconocido: ${tipo}`);

  return formatDateOnly(new Date(Date.UTC(anio, mesIndiceCero, dia)));
}

function estaDentroDelPlazoDeCierre(fecha, tipo = "cierre_contable") {
  const { anio, mesIndiceCero } = partesDateOnly(fecha);
  const limite = fechaLimiteDelMes(anio, mesIndiceCero, tipo);
  return compareDateOnly(fecha, limite) <= 0;
}

function evaluarComprobante({
  tipo = "factura",
  fechaCompra,
  fechaEnvio,
  esCompraTarjetaInstitucional = false,
}) {
  const dias = diasEntre(fechaCompra, fechaEnvio);
  const { anio, mesIndiceCero } = partesDateOnly(fechaCompra);
  const fechaLimiteCierre = fechaLimiteDelMes(anio, mesIndiceCero, "cierre_contable");

  if (dias < 0) {
    return {
      reconocido: false,
      cumplePlazoEnvio: false,
      cumpleCierreContable: true,
      fechaLimiteCierre,
      motivo: "La fecha de envío no puede ser anterior a la fecha de compra.",
    };
  }

  let cumplePlazoEnvio;
  let motivoPlazo = null;

  if (esCompraTarjetaInstitucional) {
    cumplePlazoEnvio = dias === 0;
    if (!cumplePlazoEnvio) {
      motivoPlazo =
        "Las compras realizadas con tarjeta de crédito institucional deben informarse y respaldarse el mismo día de la compra.";
    }
  } else if (tipo === "nota_venta") {
    cumplePlazoEnvio = dias === 0;
    if (!cumplePlazoEnvio) {
      motivoPlazo = "Las notas de venta deben remitirse a Contabilidad el mismo día de la compra.";
    }
  } else if (tipo === "liquidacion_compra") {
    cumplePlazoEnvio = dias === 0;
    if (!cumplePlazoEnvio) {
      motivoPlazo = "La Liquidación de Compra debe gestionarse el mismo día en que se efectúa la compra.";
    }
  } else {
    cumplePlazoEnvio = dias === 0 || dias === 1;
    if (!cumplePlazoEnvio) {
      motivoPlazo =
        "La factura debe enviarse el mismo día de la compra o, como máximo, hasta el día siguiente.";
    }
  }

  const cumpleCierreContable = compareDateOnly(fechaEnvio, fechaLimiteCierre) <= 0;
  const motivoCierre = cumpleCierreContable
    ? null
    : `El cierre contable del período fue el ${fechaLimiteCierre}; la documentación de ese mes ya no puede recibirse para el período que se encuentra cerrando.`;

  const reconocido = cumplePlazoEnvio && cumpleCierreContable;
  return {
    reconocido,
    cumplePlazoEnvio,
    cumpleCierreContable,
    fechaLimiteCierre,
    motivo: [motivoPlazo, motivoCierre].filter(Boolean).join(" ") || null,
  };
}


function validarRequisitosDocumentalesComprobante(c) {
  const faltantes = [];

  if (c.tipo === "factura" || c.tipo === "nota_venta") {
    if (!c.rutaArchivo) faltantes.push("comprobante tributario principal");
  }

  if (c.esCompraTarjetaInstitucional && !c.rutaRespaldoTarjeta) {
    faltantes.push("documento de respaldo de la tarjeta institucional");
  }

  if (c.esCompraInternet) {
    if (!c.tipoRespaldoInternet || !c.rutaRespaldoInternet) {
      faltantes.push("respaldo de la compra por internet");
    }
  }

  if (c.tipo === "nota_venta") {
    const checklist = [
      ["proveedor RIMPE Negocio Popular", c.notaVentaRimpeNegocioPopular],
      ["emitida a nombre del ITI", c.notaVentaEmitidaNombreITI],
      [
        "RUC institucional cuando corresponde",
        c.notaVentaRucAplica === false ||
          (c.notaVentaRucAplica === true && c.notaVentaRucInstitucional === true),
      ],
      ["documento legible", c.notaVentaLegible],
      ["sin enmendaduras", c.notaVentaSinEnmendaduras],
      ["datos completos", c.notaVentaDatosCompletos],
    ];
    checklist.forEach(([nombre, valor]) => {
      if (valor !== true) faltantes.push(nombre);
    });
  }

  if (c.tipo === "liquidacion_compra") {
    if (!c.proveedorCedula) faltantes.push("número de cédula del proveedor");
    if (!c.rutaCedulaProveedor) faltantes.push("copia de cédula del proveedor");
    if (!c.fechaLiquidacionCompra) faltantes.push("fecha de emisión de la Liquidación de Compra");
    if (!c.rutaLiquidacionCompra) faltantes.push("Liquidación de Compra emitida por Contabilidad");
    if (
      c.fechaLiquidacionCompra &&
      c.fechaCompra &&
      String(c.fechaLiquidacionCompra) !== String(c.fechaCompra)
    ) {
      faltantes.push("la Liquidación de Compra debe elaborarse el mismo día de la compra");
    }
  }

  return { completa: faltantes.length === 0, faltantes };
}

function esFacturaReconocida({ fechaCompra, fechaEnvio }) {
  return evaluarComprobante({ tipo: "factura", fechaCompra, fechaEnvio }).reconocido;
}

function viernesMismaSemana(fecha) {
  const diaSemana = diaSemanaDateOnly(fecha);
  const diasHastaViernes = (5 - diaSemana + 7) % 7;
  return addDaysDateOnly(fecha, diasHastaViernes);
}

function primerViernesEnONDespues(fecha) {
  const diaSemana = diaSemanaDateOnly(fecha);
  const diasHastaViernes = (5 - diaSemana + 7) % 7;
  return addDaysDateOnly(fecha, diasHastaViernes);
}

/** 4.7: devuelve el próximo viernes posterior a la fecha de referencia. */
function calcularProximoViernesDePago(fechaReferencia = fechaHoyISO()) {
  const viernes = viernesMismaSemana(fechaReferencia);
  if (compareDateOnly(viernes, fechaReferencia) === 0) {
    return addDaysDateOnly(viernes, 7);
  }
  return viernes;
}

/** Una solicitud completa hasta el miércoles entra al ciclo del viernes de esa semana. */
function alcanzaCorteSemanal(fechaCompleta = fechaHoyISO()) {
  const diaSemana = diaSemanaDateOnly(fechaCompleta); // 0 domingo ... 3 miércoles
  return diaSemana >= 0 && diaSemana <= 3;
}

/**
 * Programa el pago conforme al corte semanal y a la fecha requerida.
 * La fecha final siempre es viernes y nunca queda antes de la fecha requerida.
 */
function calcularProgramacionPago({
  fechaCompleta,
  fechaDesembolsoRequerida,
  tipo,
  autorizacionExcepcional = false,
}) {
  // 4.1.4 habilita una excepción real al ciclo ordinario cuando el pago del
  // mismo día fue debidamente justificado y autorizado por una autoridad.
  if (tipo === "excepcional_mismo_dia" && autorizacionExcepcional) {
    return {
      alcanzoCorteSemanal: null,
      fechaProgramadaPago: fechaDesembolsoRequerida,
      motivoReprogramacion:
        "Pago del mismo día autorizado como circunstancia extraordinaria; no aplica el corte semanal ordinario.",
    };
  }

  const alcanzoCorte = alcanzaCorteSemanal(fechaCompleta);
  let viernesPorCorte = viernesMismaSemana(fechaCompleta);
  if (!alcanzoCorte) viernesPorCorte = addDaysDateOnly(viernesPorCorte, 7);

  const viernesPorFechaRequerida = primerViernesEnONDespues(fechaDesembolsoRequerida);
  const fechaProgramadaPago =
    compareDateOnly(viernesPorCorte, viernesPorFechaRequerida) >= 0
      ? viernesPorCorte
      : viernesPorFechaRequerida;

  const motivos = [];
  if (!alcanzoCorte) {
    motivos.push("La solicitud quedó completa después del corte del miércoles y pasa al siguiente ciclo de pagos.");
  }
  if (compareDateOnly(viernesPorFechaRequerida, viernesPorCorte) > 0) {
    motivos.push("La fecha requerida corresponde a un ciclo de pago posterior.");
  }

  return {
    alcanzoCorteSemanal: alcanzoCorte,
    fechaProgramadaPago,
    motivoReprogramacion: motivos.join(" ") || null,
  };
}

/** Impide cerrar un pago fuera de la fecha autorizada o del ciclo ordinario del viernes. */
function validarEjecucionPago({
  fechaPago,
  fechaProgramadaPago,
  tipo,
  autorizacionExcepcional = false,
}) {
  if (tipo === "excepcional_mismo_dia" && autorizacionExcepcional) {
    if (compareDateOnly(fechaPago, fechaProgramadaPago) !== 0) {
      return {
        valido: false,
        motivo: `La excepción fue autorizada para ${fechaProgramadaPago}; debe ejecutarse en esa misma fecha.`,
      };
    }
    return { valido: true, motivo: null };
  }

  if (diaSemanaDateOnly(fechaPago) !== 5) {
    return { valido: false, motivo: "Los pagos a proveedores únicamente pueden ejecutarse los días viernes." };
  }
  if (compareDateOnly(fechaPago, fechaProgramadaPago) < 0) {
    return {
      valido: false,
      motivo: `El pago está programado para ${fechaProgramadaPago} y no puede marcarse como pagado antes de esa fecha.`,
    };
  }
  return { valido: true, motivo: null };
}

/** 4.8 Eventos institucionales: mínimo 1 semana de anticipación. */
function validarAnticipacionEvento({ fechaPlanificacion, fechaEvento }) {
  const dias = diasEntre(fechaPlanificacion, fechaEvento);

  if (dias < 0) {
    return {
      valido: false,
      dias,
      motivo: "La fecha del evento no puede ser anterior a la presentación de la planificación financiera.",
    };
  }

  if (dias < 7) {
    return {
      valido: false,
      dias,
      motivo:
        "La planificación financiera de un evento institucional debe presentarse con al menos una (1) semana de anticipación.",
    };
  }

  return { valido: true, dias, motivo: null };
}

function periodoContableDeFecha(fecha) {
  const { anio, mesIndiceCero } = partesDateOnly(fecha);
  return `${anio}-${String(mesIndiceCero + 1).padStart(2, "0")}`;
}

function periodoContableSiguiente(periodo) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodo || "");
  if (!match) throw new Error(`Período inválido: ${periodo}. Usa AAAA-MM.`);

  let anio = Number(match[1]);
  let mes = Number(match[2]);
  if (mes < 1 || mes > 12) throw new Error(`Período inválido: ${periodo}.`);

  mes += 1;
  if (mes === 13) {
    mes = 1;
    anio += 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/**
 * 4.9 Reembolso de Caja Chica.
 * - Día 28 como fecha límite general.
 * - Febrero: día 25.
 * - Fuera de plazo no se rechaza automáticamente: se procesa en el siguiente período contable.
 */
function evaluarReembolsoCajaChica({ fechaPresentacion }) {
  const { anio, mesIndiceCero } = partesDateOnly(fechaPresentacion);
  const fechaLimite = fechaLimiteDelMes(anio, mesIndiceCero, "caja_chica");
  const dentroPlazo = compareDateOnly(fechaPresentacion, fechaLimite) <= 0;
  const periodoPresentacion = periodoContableDeFecha(fechaPresentacion);
  const periodoProcesamiento = dentroPlazo
    ? periodoPresentacion
    : periodoContableSiguiente(periodoPresentacion);

  return {
    dentroPlazo,
    fechaLimite,
    periodoPresentacion,
    periodoProcesamiento,
    diferido: !dentroPlazo,
    motivo: dentroPlazo
      ? null
      : `La solicitud fue presentada después del ${fechaLimite}; deberá procesarse en el período contable ${periodoProcesamiento}.`,
  };
}

module.exports = {
  POLITICA_PAGOS_VERSION,
  validarAnticipacionSolicitud,
  evaluarComprobante,
  esFacturaReconocida,
  calcularProximoViernesDePago,
  alcanzaCorteSemanal,
  calcularProgramacionPago,
  validarEjecucionPago,
  fechaLimiteDelMes,
  estaDentroDelPlazoDeCierre,
  validarAnticipacionEvento,
  evaluarReembolsoCajaChica,
  periodoContableDeFecha,
  periodoContableSiguiente,
  validarRequisitosDocumentalesComprobante,
  diasEntre,
};
