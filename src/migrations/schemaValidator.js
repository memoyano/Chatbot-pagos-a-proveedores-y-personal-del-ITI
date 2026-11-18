const logger = require("../utils/logger");

function tableNameOf(model) {
  const value = model.getTableName();
  return typeof value === "string" ? value : value.tableName;
}

async function validarModelosContraSchema(sequelize, {
  excludeTables = [],
  onlyTables = null,
  throwOnError = true,
} = {}) {
  const qi = sequelize.getQueryInterface();
  const exclude = new Set(excludeTables);
  const only = onlyTables ? new Set(onlyTables) : null;
  const errors = [];
  const checked = [];

  for (const model of Object.values(sequelize.models)) {
    const table = tableNameOf(model);
    if (exclude.has(table)) continue;
    if (only && !only.has(table)) continue;

    let columns;
    try {
      columns = await qi.describeTable(table);
    } catch (error) {
      errors.push(`Falta la tabla requerida: ${table}`);
      continue;
    }

    const expected = Object.keys(model.getAttributes());
    const missing = expected.filter((name) => !columns[name]);
    if (missing.length) {
      errors.push(`Tabla ${table}: faltan columnas ${missing.join(", ")}`);
    }
    checked.push(table);
  }

  if (errors.length && throwOnError) {
    const error = new Error(`Validación de esquema falló:\n- ${errors.join("\n- ")}`);
    error.code = "SCHEMA_VALIDATION_FAILED";
    error.details = errors;
    throw error;
  }

  if (!errors.length) {
    logger.info("Esquema de base de datos validado", { tables: checked.length });
  }

  return { valido: errors.length === 0, errors, checked };
}

module.exports = { validarModelosContraSchema, tableNameOf };
