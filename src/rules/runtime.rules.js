function leaseExpirado(lockedAt, leaseSeconds = 300, now = new Date()) {
  if (!lockedAt) return true;
  return now.getTime() - new Date(lockedAt).getTime() >= leaseSeconds * 1000;
}

function calcularExpiracionSesion(now, ttlHours) {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

function debeRetenerUpdate(updatedAt, retentionDays, now = new Date()) {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return new Date(updatedAt).getTime() >= cutoff;
}

module.exports = { leaseExpirado, calcularExpiracionSesion, debeRetenerUpdate };
