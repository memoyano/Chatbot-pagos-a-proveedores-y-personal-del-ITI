const { DataTypes, Model } = require("sequelize");
const { sequelize } = require("../../config/database");

class Comprobante extends Model {}

Comprobante.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    solicitudPagoId: { type: DataTypes.INTEGER, allowNull: true },

    tipo: {
      type: DataTypes.ENUM("factura", "liquidacion_compra", "nota_venta"),
      allowNull: false,
      defaultValue: "factura",
    },
    fechaCompra: { type: DataTypes.DATEONLY, allowNull: false },
    fechaEnvio: { type: DataTypes.DATEONLY, allowNull: false },

    cumplePoliticaAutomatica: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reconocidoParaPago: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    documentacionCompleta: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cumplePlazoEnvio: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cumpleCierreContable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fechaLimiteCierre: { type: DataTypes.DATEONLY, allowNull: true },
    motivoNoReconocimiento: { type: DataTypes.STRING(1000), allowNull: true },

    estadoValidacion: {
      type: DataTypes.ENUM(
        "recibido",
        "pendiente_revision",
        "pendiente_liquidacion",
        "correccion_requerida",
        "validado",
        "rechazado"
      ),
      allowNull: false,
      defaultValue: "pendiente_revision",
    },
    observacionValidacion: { type: DataTypes.STRING(1000), allowNull: true },
    validadoPorTelegramId: { type: DataTypes.STRING, allowNull: true },
    validadoPorNombre: { type: DataTypes.STRING, allowNull: true },
    fechaValidacion: { type: DataTypes.DATE, allowNull: true },

    // Archivo tributario principal (factura / nota de venta).
    rutaArchivo: { type: DataTypes.STRING, allowNull: true },

    // 4.5 Tarjeta de crédito institucional: factura + respaldo el mismo día.
    esCompraTarjetaInstitucional: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    rutaRespaldoTarjeta: { type: DataTypes.STRING, allowNull: true },

    // 4.10 Compras por internet: respaldo adicional según corresponda.
    esCompraInternet: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    tipoRespaldoInternet: {
      type: DataTypes.ENUM("comprobante_pago", "orden_compra", "confirmacion_transaccion"),
      allowNull: true,
    },
    rutaRespaldoInternet: { type: DataTypes.STRING, allowNull: true },

    // 4.3.2 Nota de Venta: checklist declarado y revisión contable.
    notaVentaRimpeNegocioPopular: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaEmitidaNombreITI: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaRucAplica: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaRucInstitucional: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaLegible: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaSinEnmendaduras: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaDatosCompletos: { type: DataTypes.BOOLEAN, allowNull: true },
    notaVentaOriginalEntregado: { type: DataTypes.BOOLEAN, allowNull: true },
    fechaEntregaOriginalNotaVenta: { type: DataTypes.DATEONLY, allowNull: true },
    notaVentaOriginalCumplePlazo: { type: DataTypes.BOOLEAN, allowNull: true },

    // 4.3.1 Liquidación de Compra.
    proveedorCedula: { type: DataTypes.STRING, allowNull: true },
    rutaCedulaProveedor: { type: DataTypes.STRING, allowNull: true },
    fechaLiquidacionCompra: { type: DataTypes.DATEONLY, allowNull: true },
    rutaLiquidacionCompra: { type: DataTypes.STRING, allowNull: true },

    solicitanteTelegramId: { type: DataTypes.STRING, allowNull: false },
    solicitanteNombre: { type: DataTypes.STRING, allowNull: false },
  },
  {
    sequelize,
    modelName: "Comprobante",
    tableName: "comprobantes",
    timestamps: true,
    indexes: [
      { fields: ["solicitudPagoId"] },
      { fields: ["estadoValidacion"] },
      { fields: ["solicitanteTelegramId"] },
    ],
  }
);

module.exports = Comprobante;
