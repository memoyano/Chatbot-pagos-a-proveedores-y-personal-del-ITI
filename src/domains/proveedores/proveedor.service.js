const { UniqueConstraintError } = require("sequelize");
const Proveedor = require("./proveedor.model");
const logger = require("../../utils/logger");

async function registrarProveedor(datos) {
  try {
    const proveedor = await Proveedor.create(datos);
    logger.info("Proveedor registrado", { id: proveedor.id });
    return { proveedor, error: null };
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      logger.info("Intento de registrar proveedor duplicado", { rucCedula: datos.rucCedula });
      return {
        proveedor: null,
        error: `Ya existe un proveedor registrado con la cédula/RUC ${datos.rucCedula}.`,
      };
    }
    throw err;
  }
}

module.exports = { registrarProveedor };
