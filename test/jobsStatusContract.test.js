const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const status = require('../src/jobs/status');

test('runtime job solo usa métodos exportados por jobs/status', () => {
  const runtimePath = path.join(__dirname, '..', 'src', 'jobs', 'runtime.job.js');
  const source = fs.readFileSync(runtimePath, 'utf8');
  const methods = [...source.matchAll(/jobStatus\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  assert.ok(methods.length > 0, 'No se detectaron llamadas a jobStatus en runtime.job.js');
  for (const method of new Set(methods)) {
    assert.equal(typeof status[method], 'function', `jobs/status no exporta ${method}`);
  }
});
