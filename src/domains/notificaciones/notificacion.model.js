const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class Notificacion extends Model {}

Notificacion.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tipo: {
      type: DataTypes.ENUM(
        "recordatorio_corte_pagos",
        "recordatorio_dia_pago",
        "recordatorio_cierre_contable",
        "recordatorio_caja_chica",
        "recordatorio_evento",
        "recordatorio_factura_docente",
        "alerta_plazo_solicitud",
        "alerta_operativa"
      ),
      allowNull: false,
      defaultValue: "alerta_operativa",
    },
    claveUnica: { type: DataTypes.STRING(255), allowNull: true, unique: true },
    canal: { type: DataTypes.ENUM("telegram"), allowNull: false, defaultValue: "telegram" },
    destinatarioTelegramId: { type: DataTypes.STRING, allowNull: false },
    mensaje: { type: DataTypes.TEXT, allowNull: false },
    entidad: { type: DataTypes.STRING(80), allowNull: true },
    entidadId: { type: DataTypes.STRING(120), allowNull: true },
    fechaObjetivo: { type: DataTypes.DATEONLY, allowNull: true },
    estado: {
      type: DataTypes.ENUM("pendiente", "enviado", "error"),
      allowNull: false,
      defaultValue: "pendiente",
    },
    error: { type: DataTypes.TEXT, allowNull: true },
    enviadoEn: { type: DataTypes.DATE, allowNull: true },
    creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Notificacion",
    tableName: "notificaciones",
    timestamps: false,
    indexes: [
      { fields: ["tipo"] },
      { fields: ["destinatarioTelegramId"] },
      { fields: ["fechaObjetivo"] },
    ],
  }
);

module.exports = Notificacion;
