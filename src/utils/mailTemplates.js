function construirCorreoSolicitudFacturaDocente({
  nombre,
  periodo,
  conceptoSolicitado,
  montoSolicitado,
  fechaLimite,
}) {
  const monto = Number(montoSolicitado).toFixed(2);
  const asunto = `Solicitud de factura — Rol de pago ${periodo}`;
  const cuerpo =
    `Estimado/a ${nombre},\n\n` +
    `Para el rol de pago ${periodo}, por favor emite y remite tu factura electrónica con la siguiente información:\n\n` +
    `Concepto EXACTO:\n${conceptoSolicitado}\n\n` +
    `Valor a facturar: USD ${monto}\n` +
    `Fecha límite de envío: ${fechaLimite}\n\n` +
    `El concepto debe constar exactamente como se indica en este correo. ` +
    `Si no estás de acuerdo con el valor o con el concepto solicitado, comunícalo inmediatamente a tu coordinador antes de emitir la factura, para que se realicen las verificaciones correspondientes.\n\n` +
    `Las facturas remitidas fuera del plazo de tres (3) días no podrán incluirse en el rol de pago correspondiente y se procesarán al finalizar el semestre académico, una vez cumplidos los requisitos administrativos y tributarios.\n\n` +
    `Departamento de Contabilidad\nInstituto Superior Tecnológico Internacional ITI`;
  return { asunto, cuerpo };
}

module.exports = { construirCorreoSolicitudFacturaDocente };
