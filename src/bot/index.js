const bot = require("./bot");
const { registerAuthFlow } = require("./flows/auth.flow");
const registerSolicitudPagoFlow = require("./flows/solicitudPago.flow");
const registerComprobanteFlow = require("./flows/comprobante.flow");
const registerProveedorFlow = require("./flows/proveedor.flow");
const registerConsultaEstadoFlow = require("./flows/consultaEstado.flow");
const registerAprobacionPagoFlow = require("./flows/aprobacionPago.flow");
const registerRolPagoDocentesFlow = require("./flows/rolPagoDocentes.flow");
const registerEventoInstitucionalFlow = require("./flows/eventoInstitucional.flow");
const registerCajaChicaFlow = require("./flows/cajaChica.flow");
const registerAuditoriaFlow = require("./flows/auditoria.flow");
const registerAutomatizacionesFlow = require("./flows/automatizaciones.flow");
const registerReportesFlow = require("./flows/reportes.flow");
const registerIAFlow = require("./flows/ia.flow");

registerAuthFlow(bot);

const MENUS_POR_ROL = {
  solicitante:
    "/solicitud — Registrar una solicitud de pago\n" +
    "/comprobante — Registrar un comprobante de compra\n" +
    "/proveedor — Registrar un proveedor nuevo (en nombre del proveedor)\n" +
    "/estado — Consultar el estado de tus solicitudes\n\n" +
    "· Inteligencia Artificial ·\n" +
    "/iaestado — Estado de servicios IA",
  contadora:
    "· Pago a Proveedor ·\n" +
    "/documentos <id> — Ver documentación vinculada a una solicitud\n" +
    "/validarcomprobante <id> — Validar un comprobante\n" +
    "/observarcomprobante <id> <motivo> — Solicitar corrección/complemento\n" +
    "/rechazarcomprobante <id> <motivo> — Rechazar un comprobante\n" +
    "/liquidacionemitida <id> <fecha> — Adjuntar Liquidación de Compra\n" +
    "/originalnotaventa <id> [fecha] — Registrar original físico\n" +
    "/verificar <id> — Confirmar que toda la documentación está completa\n" +
    "/reporte <id> — Generar el reporte de detalle para Colecturía\n" +
    "/estado — Ver solicitudes pendientes de validación\n\n" +
    "· Eventos institucionales ·\n" +
    "/eventos — Ver planificaciones pendientes\n" +
    "/validarevento <id> — Aprobar planificación\n" +
    "/observarevento <id> <motivo> — Solicitar corrección\n" +
    "/rechazarevento <id> <motivo> — Rechazar planificación\n" +
    "/solicitudevento <id> — Crear solicitud de pago vinculada a evento aprobado\n\n" +
    "· Caja Chica ·\n" +
    "/cajachicapendientes — Ver reembolsos pendientes\n" +
    "/validarcajachica <id> — Validar reembolso\n" +
    "/observarcajachica <id> <motivo> — Solicitar corrección\n" +
    "/rechazarcajachica <id> <motivo> — Rechazar reembolso\n\n" +
    "· Pago a Docentes ·\n" +
    "/elaborarrol <id> — Elaborar el rol de pagos\n" +
    "/configurarfactura <rolId> <cédula> <monto> <concepto> — Cargar detalle exacto por docente\n" +
    "/resumenrol <id> — Ver docentes, montos y estado documental\n" +
    "/facturarecibida <rolId> <cédula> [fecha] — Registrar factura recibida\n" +
    "/facturaerror <rolId> <cédula> <motivo> — Devolver factura a corrección\n" +
    "/rezagados <rolId> — Ver docentes rezagados\n" +
    "/documentacionrevisada <id> — Cerrar revisión y retenciones\n" +
    "/detallepagodocentes <id> — Generar detalle de pagos\n" +
    "/prepararpagorezagados <rolId> — Preparar pago de fin de semestre\n" +
    "/novedadesdocentes — Ver novedades de grado pendientes\n\n" +
    "· Auditoría ·\n" +
    "/auditoria <tipo> <id> — Ver trazabilidad de una entidad\n" +
    "/auditoriareciente [n] — Ver últimos eventos de auditoría\n\n" +
    "· Automatizaciones ·\n" +
    "/automatizaciones — Ver estado de jobs\n" +
    "/recordatoriosahora — Ejecutar barrido manual sin duplicar avisos\n" +
    "/notificacionesfallidas — Ver errores de entrega\n\n" +
    "· Reportes ·\n" +
    "/resumenoperativo [AAAA-MM] — Resumen mensual de operación\n" +
    "/pendientescriticos [AAAA-MM] — Pendientes y alertas del período\n\n" +
    "· Inteligencia Artificial ·\n" +
    "/iaestado — Estado de servicios IA\n" +
    "/iaanalizarcomprobante <id> — Reanalizar comprobante\n" +
    "/iaanalizarfactura <rolId> <cédula> — Analizar factura docente\n" +
    "/iaresultado <id> — Consultar análisis IA",
  colecturia:
    "· Pago a Proveedor ·\n" +
    "/ordentransferencia <id> — Generar la orden de transferencia\n" +
    "/marcarpagada <id> — Informar el pago a las entidades bancarias\n\n" +
    "· Pago a Docentes ·\n" +
    "/ordendocentes <id> — Generar orden de transferencia\n" +
    "/pagardocentes <id> — Ejecutar el pago\n" +
    "/ordenrezagados <rolId> — Generar orden de rezagados de fin de semestre\n" +
    "/pagarrezagados <rolId> — Ejecutar pago de rezagados\n\n" +
    "· Caja Chica ·\n" +
    "/reembolsarcajachica <id> — Procesar reembolso aprobado",
  coordinador_general:
    "/aprobarcg <id> — Aprobar la orden de transferencia (Pago a Proveedor)\n" +
    "/resumenoperativo [AAAA-MM] — Resumen mensual de operación\n" +
    "/pendientescriticos [AAAA-MM] — Pendientes y alertas del período\n\n" +
    "· Inteligencia Artificial ·\n" +
    "/iaestado — Estado de servicios IA\n" +
    "/iaresultado <id> — Consultar análisis IA",
  cash_management: "/aprobarcash <id> — Aprobar la orden de transferencia (Pago a Proveedor)",
  rector:
    "· Autorizaciones institucionales ·\n" +
    "/autorizarexcepcional <id> — Autorizar pago excepcional del mismo día\n" +
    "/rechazarexcepcional <id> <motivo> — Rechazar pago excepcional",

  vicerector_postgrado:
    "· Autorizaciones institucionales ·\n" +
    "/autorizarexcepcional <id> — Autorizar pago excepcional del mismo día\n" +
    "/rechazarexcepcional <id> <motivo> — Rechazar pago excepcional",

  vicerector_financiero:
    "· Autorizaciones institucionales ·\n" +
    "/autorizarexcepcional <id> — Autorizar pago excepcional del mismo día\n" +
    "/rechazarexcepcional <id> <motivo> — Rechazar pago excepcional",
  director_general:
    "/iniciarroldepagos <periodo> — Remitir matrices e iniciar el rol de pagos de docentes\n" +
    "/autorizarexcepcional <id> — Autorizar pago excepcional del mismo día\n" +
    "/rechazarexcepcional <id> <motivo> — Rechazar excepción\n" +
    "/resumenoperativo [AAAA-MM] — Resumen mensual de operación\n" +
    "/pendientescriticos [AAAA-MM] — Pendientes y alertas del período\n\n" +
    "· Inteligencia Artificial ·\n" +
    "/iaestado — Estado de servicios IA\n" +
    "/iaresultado <id> — Consultar análisis IA",
  asistente_contable:
    "/solicitarfacturas <id> — Enviar correos personalizados a docentes\n" +
    "/resumenrol <id> — Ver estado del rol\n" +
    "/facturarecibida <rolId> <cédula> [fecha] — Registrar factura recibida\n" +
    "/rezagados <rolId> — Ver docentes rezagados\n\n" +
    "· Inteligencia Artificial ·\n" +
    "/iaestado — Estado de servicios IA\n" +
    "/iaanalizarfactura <rolId> <cédula> — Analizar factura docente\n" +
    "/iaresultado <id> — Consultar análisis IA",
  coordinador_carrera:
    "/reportarnovedad <cédula> | <nuevo grado> | <nuevo valor opcional> | <motivo opcional> — Reportar novedad para aprobación",
};

const MENU_COMUN =
  "\n\n· Gestiones institucionales ·\n" +
  "/evento — Registrar planificación financiera de un evento\n" +
  "/miseventos — Consultar tus eventos\n" +
  "/solicitudevento <id> — Crear pago vinculado a un evento aprobado\n" +
  "/cajachica — Registrar reembolso de Caja Chica\n" +
  "/miscajachica — Consultar tus reembolsos";

function responderMenu(ctx) {
  const { nombre, rol } = ctx.state.usuario;
  const menuBase = MENUS_POR_ROL[rol] || "No tienes comandos específicos asignados todavía.";
  return ctx.reply(`👋 Hola, ${nombre}. Comandos disponibles:\n\n${menuBase}${MENU_COMUN}`);
}

bot.start(responderMenu);
bot.command("help", responderMenu);

registerIAFlow(bot);

// Flujo 1.0 del DFD: Registrar solicitud de pago
registerSolicitudPagoFlow(bot);

// Flujo 2.0 del DFD: Registrar comprobante de compra
registerComprobanteFlow(bot);

// Flujo 3.0 del DFD: Registrar proveedor nuevo
registerProveedorFlow(bot);

// Flujo 6.0 del DFD: Consultar estado de solicitudes
registerConsultaEstadoFlow(bot);

// Proceso "Pago a Proveedor": cadena completa de aprobación
registerAprobacionPagoFlow(bot);

// Proceso "Pago a Docentes": cadena completa según el procedimiento oficial
registerRolPagoDocentesFlow(bot);

// FASE 3: planificación financiera de eventos institucionales y reembolsos de Caja Chica.
registerEventoInstitucionalFlow(bot);
registerCajaChicaFlow(bot);

// FASE 5: auditoría, automatizaciones y trazabilidad consultable desde Telegram.
registerAuditoriaFlow(bot);
registerAutomatizacionesFlow(bot);

// FASE 7: cierre productivo con reportes ejecutivos/operativos.
registerReportesFlow(bot);

module.exports = bot;
