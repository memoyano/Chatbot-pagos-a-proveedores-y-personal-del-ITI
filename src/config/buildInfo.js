const pkg = require('../../package.json');

const startedAt = new Date().toISOString();
let artifactMeta = {};
try {
  artifactMeta = require('../../build-meta.json');
} catch (_) {
  artifactMeta = {};
}

function buildInfo() {
  const commit = process.env.BUILD_COMMIT || process.env.GITHUB_SHA || artifactMeta.commit || process.env.WEBSITE_DEPLOYMENT_ID || null;
  return {
    service: 'chatbot-iti',
    version: pkg.version,
    phase: 9,
    environment: process.env.NODE_ENV || 'development',
    commit: commit ? String(commit).slice(0, 12) : null,
    site: process.env.WEBSITE_SITE_NAME || null,
    startedAt,
  };
}

module.exports = { buildInfo };
