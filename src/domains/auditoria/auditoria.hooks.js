const logger = require("../../utils/logger");
const { registrarAuditoria } = require("./auditoria.service");

const MODELOS_AUDITABLES = [
  ["SolicitudPago", "../solicitudesPago/solicitudPago.model"],
  ["Comprobante", "../comprobantes/comprobante.model"],
  ["Proveedor", "../proveedores/proveedor.model"],
  ["EventoInstitucional", "../eventos/eventoInstitucional.model"],
  ["ReembolsoCajaChica", "../cajaChica/reembolsoCajaChica.model"],
  ["Docente", "../docentes/docente.model"],
  ["RolPagoDocentes", "../docentes/rolPago.model"],
  ["FacturaDocente", "../docentes/facturaDocente.model"],
  ["NovedadDocente", "../docentes/novedadDocente.model"],
  ["AnalisisIA", "../ia/analisisIA.model"],
];

function idInstancia(instance) {
  const pk = instance.constructor.primaryKeyAttribute;
  return pk ? instance.get(pk) : instance.get("id");
}

function estadoInstancia(instance) {
  return instance.get("estado") ?? null;
}

const { camposSeguros } = require("./auditoria.utils");

function registrarHooksAuditoria() {
  for (const [nombre, ruta] of MODELOS_AUDITABLES) {
    const Modelo = require(ruta);
    if (Modelo._auditoriaRegistrada) continue;

    Modelo.addHook("afterCreate", `auditCreate${nombre}`, async (instance) => {
      await registrarAuditoria({
        entidad: nombre,
        entidadId: idInstancia(instance),
        accion: "CREAR",
        estadoNuevo: estadoInstancia(instance),
        detalle: { campos: camposSeguros(Object.keys(instance.dataValues || {})) },
      });
    });

    Modelo.addHook("afterUpdate", `auditUpdate${nombre}`, async (instance) => {
      const changed = camposSeguros(instance.changed() || []);
      const estadoAnterior = instance.previous("estado") ?? null;
      const estadoNuevo = estadoInstancia(instance);
      await registrarAuditoria({
        entidad: nombre,
        entidadId: idInstancia(instance),
        accion: changed.includes("estado") ? "CAMBIO_ESTADO" : "ACTUALIZAR",
        estadoAnterior,
        estadoNuevo,
        detalle: { camposModificados: changed },
      });
    });

    Modelo.addHook("afterDestroy", `auditDestroy${nombre}`, async (instance) => {
      await registrarAuditoria({
        entidad: nombre,
        entidadId: idInstancia(instance),
        accion: "ELIMINAR",
        estadoAnterior: estadoInstancia(instance),
      });
    });

    Modelo._auditoriaRegistrada = true;
  }
  logger.info("Hooks de auditoría registrados", { modelos: MODELOS_AUDITABLES.length });
}

module.exports = { registrarHooksAuditoria };
