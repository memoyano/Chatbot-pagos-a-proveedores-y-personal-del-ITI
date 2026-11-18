const { DataTypes } = require("sequelize");

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables
    .map((value) => typeof value === "string" ? value : (value?.tableName || value?.TABLE_NAME || String(value)))
    .includes(tableName);
}

async function addColumnIfMissing(queryInterface, table, columns, name, definition) {
  if (columns[name]) return false;
  await queryInterface.addColumn(table, name, definition);
  columns[name] = true;
  return true;
}

async function ensureIndex(queryInterface, table, name, fields) {
  const indexes = await queryInterface.showIndex(table);
  if (indexes.some((index) => index.name === name)) return;
  await queryInterface.addIndex(table, fields, { name });
}

async function upgradeRolesPagoDocentes(queryInterface) {
  const table = "roles_pago_docentes";
  if (!(await tableExists(queryInterface, table))) return;

  const columns = await queryInterface.describeTable(table);

  await addColumnIfMissing(queryInterface, table, columns, "fechaRolElaborado", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "fechaDocumentacionRevisada", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "pagoRezagadosEstado", {
    type: DataTypes.ENUM("no_iniciado", "preparado", "orden_generada", "pagado"),
    allowNull: false,
    defaultValue: "no_iniciado",
  });

  await addColumnIfMissing(queryInterface, table, columns, "fechaPreparacionRezagados", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "fechaOrdenRezagados", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "fechaPagoRezagados", {
    type: DataTypes.DATE,
    allowNull: true,
  });
}

async function upgradeFacturasDocentes(queryInterface) {
  const table = "facturas_docentes";
  if (!(await tableExists(queryInterface, table))) return;

  const columns = await queryInterface.describeTable(table);

  await addColumnIfMissing(queryInterface, table, columns, "conceptoSolicitado", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "montoSolicitado", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "fechaSolicitudFactura", {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "numeroFactura", {
    type: DataTypes.STRING,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "conceptoFactura", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "montoFactura", {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "rutaFactura", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "conceptoCoincide", {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "montoCoincide", {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "elegiblePagoFinSemestre", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await addColumnIfMissing(queryInterface, table, columns, "correoEstado", {
    type: DataTypes.ENUM("no_enviado", "enviado", "error"),
    allowNull: false,
    defaultValue: "no_enviado",
  });

  await addColumnIfMissing(queryInterface, table, columns, "correoEnviadoEn", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "correoError", {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await addColumnIfMissing(queryInterface, table, columns, "pagadaEnCierreSemestre", {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });

  await addColumnIfMissing(queryInterface, table, columns, "fechaPagoFinalSemestre", {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });

  // FASE 4 crea el registro en preparación antes de enviar el correo, por lo que
  // fechaLimiteFactura ya no puede ser obligatoria desde el primer momento.
  await queryInterface.changeColumn(table, "fechaLimiteFactura", {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });

  // Amplía el enum legado de FASE 3 con el estado de preparación usado desde FASE 4.
  await queryInterface.changeColumn(table, "estado", {
    type: DataTypes.ENUM("preparacion", "pendiente", "recibida", "con_error", "rezagada", "pagada"),
    allowNull: false,
    defaultValue: "preparacion",
  });

  // El modelo actual usa TEXT para permitir observaciones completas.
  if (columns.observacion) {
    await queryInterface.changeColumn(table, "observacion", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }

  await ensureIndex(
    queryInterface,
    table,
    "facturas_docentes_rol_docente_idx",
    ["rolPagoId", "docenteCedula"]
  );
}

module.exports = {
  name: "202609210001-docentes-fase4",
  async up({ queryInterface }) {
    await upgradeRolesPagoDocentes(queryInterface);
    await upgradeFacturasDocentes(queryInterface);
  },
};
