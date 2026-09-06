import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCredentialRefs, resolveModelConfig, scanProject, classifyFile, selectSkills, buildMentorReview } from '../server.mjs';
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

test('classifies PM files for presentation', () => {
  assert.equal(classifyFile('会议纪要/2026-01-01.md').type, 'meeting');
  assert.equal(classifyFile('产品方案.xlsx').type, 'table');
  assert.equal(classifyFile('流程图.mmd').type, 'flow');
});

test('selects parallel PM skills from a natural-language request', () => {
  assert.deepEqual(selectSkills('基于会议纪要写 PRD 并准备汇报'), ['meeting-notes-organizer', 'prd-writer', 'update-writer']);
});

test('mentor review blocks delivery until strict checks pass', () => {
  const review = buildMentorReview({ text: '短文', cards: [] }, ['prd-writer']);
  assert.equal(review.status, 'needs_revision');
  assert.ok(review.issues.length > 0);
});
