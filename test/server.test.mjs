import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCredentialRefs, resolveModelConfig, scanProject } from '../server.mjs';
test('project binding creates a real project navigation model', () => { const p = scanProject('/tmp/pm'); assert.equal(p.name, 'pm'); assert.deepEqual(p.items.map(x => x.name), ['文档', '会议', '工作记录']); });

test('model config matches the working DSH cliproxy setup', () => {
  const config = resolveModelConfig({});
  assert.equal(config.baseUrl, 'http://192.227.138.214:8317/v1');
  assert.equal(config.model, 'gpt-5.5');
  assert.equal(config.apiKeyEnv, 'CLIPROXY_API_KEY');
});

test('credential refs are read without committing secrets', () => {
  assert.equal(parseCredentialRefs('refs:\n  CLIPROXY_API_KEY: secret-value\n').CLIPROXY_API_KEY, 'secret-value');
});
