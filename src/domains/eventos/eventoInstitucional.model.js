const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class EventoInstitucional extends Model {}

EventoInstitucional.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tipo: {
      type: DataTypes.ENUM(
        "graduacion",
        "dia_trabajador",
        "navidad",
        "aniversario",
        "academico_institucional",
        "otra_celebracion"
      ),
      allowNull: false,
    },
    nombre: { type: DataTypes.STRING(200), allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    unidadOrganizadora: { type: DataTypes.STRING(200), allowNull: false },
    fechaPresentacion: { type: DataTypes.DATEONLY, allowNull: false },
    fechaEvento: { type: DataTypes.DATEONLY, allowNull: false },
    montoEstimado: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    rutaPlanificacionFinanciera: { type: DataTypes.STRING, allowNull: false },

    diasAnticipacion: { type: DataTypes.INTEGER, allowNull: false },
    cumpleAnticipacion: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    motivoIncumplimiento: { type: DataTypes.STRING(700), allowNull: true },

    estado: {
      type: DataTypes.ENUM("pendiente_revision", "observado", "aprobado_programacion", "rechazado"),
      allowNull: false,
      defaultValue: "pendiente_revision",
    },
    observacionRevision: { type: DataTypes.STRING(1000), allowNull: true },
    revisadoPorTelegramId: { type: DataTypes.STRING, allowNull: true },
    revisadoPorNombre: { type: DataTypes.STRING, allowNull: true },
    fechaRevision: { type: DataTypes.DATE, allowNull: true },

    solicitanteTelegramId: { type: DataTypes.STRING, allowNull: false },
    solicitanteNombre: { type: DataTypes.STRING, allowNull: false },
  },
  {
    sequelize,
    modelName: "EventoInstitucional",
    tableName: "eventos_institucionales",
    timestamps: true,
    indexes: [
      { fields: ["estado"] },
      { fields: ["fechaEvento"] },
      { fields: ["solicitanteTelegramId"] },
    ],
  }
);

module.exports = EventoInstitucional;
