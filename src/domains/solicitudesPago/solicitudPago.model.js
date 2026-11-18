const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

/**
 * Estados del flujo "Pago a Proveedor":
 *  pendiente_autorizacion_excepcional -> solicitud del mismo día esperando autorización institucional
 *  pendiente          -> creada y lista para revisión de Contabilidad
 *  rechazada          -> no cumplió política o la excepción fue rechazada
 *  verificada         -> Contabilidad confirmó que la solicitud está completa
 *  reporte_generado   -> Contabilidad generó el detalle para Colecturía
 *  orden_transferencia-> Colecturía generó la orden
 *  aprobada           -> Coordinador General y Cash Management aprobaron
 *  pagada             -> Colecturía informó el pago
 */
class SolicitudPago extends Model {}

SolicitudPago.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventoInstitucionalId: { type: DataTypes.INTEGER, allowNull: true },
    tipo: {
      type: DataTypes.ENUM("normal", "anticipo_gira", "urgente", "excepcional_mismo_dia"),
      allowNull: false,
      defaultValue: "normal",
    },
    estado: {
      type: DataTypes.ENUM(
        "pendiente_autorizacion_excepcional",
        "pendiente",
        "rechazada",
        "verificada",
        "reporte_generado",
        "orden_transferencia",
        "aprobada",
        "pagada"
      ),
      allowNull: false,
      defaultValue: "pendiente",
    },
    fechaSolicitud: { type: DataTypes.DATEONLY, allowNull: false },
    fechaDesembolsoRequerida: { type: DataTypes.DATEONLY, allowNull: false },
    fechaCompleta: { type: DataTypes.DATEONLY, allowNull: true },
    fechaProgramadaPago: { type: DataTypes.DATEONLY, allowNull: true },
    alcanzoCorteSemanal: { type: DataTypes.BOOLEAN, allowNull: true },
    motivoReprogramacion: { type: DataTypes.STRING(500), allowNull: true },
    justificacion: { type: DataTypes.TEXT, allowNull: true },
    montoAproximado: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    solicitanteTelegramId: { type: DataTypes.STRING, allowNull: false },
    solicitanteNombre: { type: DataTypes.STRING, allowNull: false },
    motivoRechazo: { type: DataTypes.STRING(500), allowNull: true },
    autorizacionExcepcional: { type: DataTypes.BOOLEAN, allowNull: true },
    autorizadoExcepcionalPorTelegramId: { type: DataTypes.STRING, allowNull: true },
    autorizadoExcepcionalPorNombre: { type: DataTypes.STRING, allowNull: true },
    fechaAutorizacionExcepcional: { type: DataTypes.DATE, allowNull: true },
    aprobadoCoordinadorGeneral: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    aprobadoCashManagement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "SolicitudPago",
    tableName: "solicitudes_pago",
    timestamps: true,
    indexes: [{ fields: ["eventoInstitucionalId"] }],
  }
);

module.exports = SolicitudPago;
