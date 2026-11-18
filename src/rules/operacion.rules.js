function jobConErrorVigente(job = {}) {
  if (!job.lastErrorAt || !job.lastError) return false;
  if (!job.lastSuccessAt) return true;
  return new Date(job.lastErrorAt).getTime() > new Date(job.lastSuccessAt).getTime();
}

function evaluarSaludOperativa({ notificacionesFallidas = 0, telegramUpdatesFallidos = 0, jobs = [] } = {}) {
  const jobsConError = jobs.filter(jobConErrorVigente).map((j) => j.nombre || "job_desconocido");
  const alertar = Number(notificacionesFallidas) > 0 || Number(telegramUpdatesFallidos) > 0 || jobsConError.length > 0;
  return {
    alertar,
    notificacionesFallidas: Number(notificacionesFallidas) || 0,
    telegramUpdatesFallidos: Number(telegramUpdatesFallidos) || 0,
    jobsConError,
  };
}

function mensajeSaludOperativa(r) {
  return [
    "🚨 Alerta operativa del chatbot ITI",
    "",
    `Notificaciones fallidas: ${r.notificacionesFallidas}`,
    `Updates Telegram fallidos: ${r.telegramUpdatesFallidos}`,
    `Jobs con error vigente: ${r.jobsConError.length ? r.jobsConError.join(", ") : "ninguno"}`,
    "",
    "Revisa /automatizaciones, /notificacionesfallidas y los health checks de Azure.",
  ].join("\n");
}

module.exports = { jobConErrorVigente, evaluarSaludOperativa, mensajeSaludOperativa };
