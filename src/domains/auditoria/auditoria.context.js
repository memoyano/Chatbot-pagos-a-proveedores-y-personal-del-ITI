const { AsyncLocalStorage } = require("node:async_hooks");

const storage = new AsyncLocalStorage();

function runWithActor(actor, fn) {
  return storage.run(actor || actorSistema(), fn);
}

function actorActual() {
  return storage.getStore() || actorSistema();
}

function actorSistema(extra = {}) {
  return {
    telegramId: null,
    nombre: "Sistema",
    rol: "sistema",
    origen: "sistema",
    ...extra,
  };
}

function runAsSystem(fn, extra = {}) {
  return runWithActor(actorSistema({ origen: "job", ...extra }), fn);
}

module.exports = { runWithActor, actorActual, actorSistema, runAsSystem };
