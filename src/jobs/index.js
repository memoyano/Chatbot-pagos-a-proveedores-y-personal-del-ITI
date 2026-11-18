const { iniciarJobDocentes } = require("./docentes.job");
const { iniciarJobTransversal } = require("./transversales.job");
const { iniciarJobRuntime } = require("./runtime.job");
const { iniciarJobOperacion } = require("./operacion.job");

function iniciarJobs(bot) {
  return [...iniciarJobDocentes(bot), iniciarJobTransversal(bot), ...iniciarJobRuntime(), iniciarJobOperacion(bot)];
}

module.exports = { iniciarJobs };
