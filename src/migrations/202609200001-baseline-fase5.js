const { DataTypes } = require("sequelize");

const PHASE6_TABLES = new Set(["bot_sessions", "telegram_updates"]);

function normalizeTableName(value) {
  if (typeof value === "string") return value;
  return value?.tableName || value?.TABLE_NAME || String(value);
}

async function existingTables(queryInterface) {
  const tables = await queryInterface.showAllTables();
  return new Set(tables.map(normalizeTableName));
}

async function addColumnIfMissing(queryInterface, table, columns, name, definition) {
  if (columns[name]) return false;
  await queryInterface.addColumn(table, name, definition);
  columns[name] = true;
  return true;
}

async function ensureIndex(queryInterface, table, name, fields, options = {}) {
  const indexes = await queryInterface.showIndex(table);
  if (indexes.some((idx) => idx.name === name)) return;
  await queryInterface.addIndex(table, fields, { name, ...options });
}

async function upgradeNotificaciones(queryInterface, sequelize) {
  const table = "notificaciones";
  let columns = await queryInterface.describeTable(table);

  await queryInterface.changeColumn(table, "tipo", {
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
  });

  await addColumnIfMissing(queryInterface, table, columns, "claveUnica", {
    type: DataTypes.STRING(255),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, columns, "canal", {
    type: DataTypes.ENUM("telegram"),
    allowNull: false,
    defaultValue: "telegram",
  });
  await addColumnIfMissing(queryInterface, table, columns, "entidad", {
    type: DataTypes.STRING(80),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, columns, "entidadId", {
    type: DataTypes.STRING(120),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, table, columns, "fechaObjetivo", {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
  const estadoAdded = await addColumnIfMissing(queryInterface, table, columns, "estado", {
    type: DataTypes.ENUM("pendiente", "enviado", "error"),
    allowNull: false,
    defaultValue: "pendiente",
  });
  await addColumnIfMissing(queryInterface, table, columns, "error", {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  const creadoEnAdded = await addColumnIfMissing(queryInterface, table, columns, "creadoEn", {
    type: DataTypes.DATE,
    allowNull: true,
  });

  // Los registros legados representaban notificaciones ya enviadas.
  if (estadoAdded) {
    await sequelize.query(`
      UPDATE notificaciones
      SET estado = CASE WHEN enviadoEn IS NULL THEN 'pendiente' ELSE 'enviado' END
    `);
  }

  if (creadoEnAdded) {
    await sequelize.query(`
      UPDATE notificaciones
      SET creadoEn = COALESCE(enviadoEn, NOW())
      WHERE creadoEn IS NULL
    `);
  }

  await queryInterface.changeColumn(table, "enviadoEn", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  await queryInterface.changeColumn(table, "creadoEn", {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  });

  await ensureIndex(queryInterface, table, "notificaciones_clave_unica_uq", ["claveUnica"], { unique: true });
  await ensureIndex(queryInterface, table, "notificaciones_tipo_idx", ["tipo"]);
  await ensureIndex(queryInterface, table, "notificaciones_destinatario_idx", ["destinatarioTelegramId"]);
  await ensureIndex(queryInterface, table, "notificaciones_fecha_objetivo_idx", ["fechaObjetivo"]);
}

module.exports = {
  name: "202609200001-baseline-fase5",
  async up({ sequelize, queryInterface }) {
    const tables = await existingTables(queryInterface);

    for (const model of Object.values(sequelize.models)) {
      const raw = model.getTableName();
      const table = normalizeTableName(raw);
      if (PHASE6_TABLES.has(table)) continue;

      if (!tables.has(table)) {
        await model.sync({ force: false, alter: false });
        tables.add(table);
      }
    }

    if (tables.has("notificaciones")) {
      await upgradeNotificaciones(queryInterface, sequelize);
    }
  },
};
