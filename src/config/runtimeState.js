const state = {
  startedAt: new Date(),
  databaseConnected: false,
  schemaReady: false,
  jobsStarted: false,
  telegramReady: false,
  shuttingDown: false,
};

function setRuntimeState(patch = {}) {
  Object.assign(state, patch);
}

function getRuntimeState() {
  return { ...state };
}

module.exports = { setRuntimeState, getRuntimeState };
