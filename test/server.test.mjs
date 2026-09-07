import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCredentialRefs, resolveModelConfig, scanProject, classifyFile, selectSkills, buildMentorReview, createWorkflowQuestion, mergeSkillResults, analyzeProject, buildMemorySuggestions, createConversation, archiveConversation, projectCanvas } from '../server.mjs';
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

test('workflow creates a structured confirmation question before execution', () => {
  const question = createWorkflowQuestion('请写一份 PRD 并汇报给老板');
  assert.equal(question.type, 'ask_user_question');
  assert.equal(question.options.length, 3);
});

test('parallel skill results merge into modular canvas cards with metadata', () => {
  const merged = mergeSkillResults([
    { skill: 'task-arrangement-planner', text: '任务分工与推进节奏' },
    { skill: 'project-context-maintainer', text: '系统上下文与记忆沉淀' },
    { skill: 'ai-pm-prd-builder', text: '渠道能力差异矩阵' }
  ]);
  assert.match(merged.text, /task-arrangement-planner/);
  assert.equal(merged.cards.length, 3);
  assert.equal(merged.cards[0].skillLabel, '任务拆解与分工');
  assert.equal(merged.cards[1].skillLabel, '项目背景与决策记忆');
  assert.equal(merged.cards[2].skillLabel, '产品能力与矩阵契约');
  assert.equal(merged.cards[0].icon, '📋');
  assert.equal(merged.cards[1].icon, '🧠');
  assert.equal(merged.cards[2].icon, '🤖');
});

test('complex channel research decomposes into multiple complementary PM agents', () => {
  const skills = selectSkills('你俩分一下，调研一下不同产品，接入 飞书/企业微信/微信/钉钉 这些渠道的流程和能力差异');
  assert.ok(skills.includes('task-arrangement-planner'));
  assert.ok(skills.includes('project-context-maintainer'));
  assert.ok(skills.includes('ai-pm-prd-builder'));
  assert.ok(skills.length >= 3);
});

test('proactive analyzer recommends work from project files and request', () => {
  const analysis = analyzeProject({ items: [{ name: '项目上下文.md', type: 'memory' }, { name: '会议纪要.md', type: 'meeting' }] }, '帮我推进这个需求');
  assert.ok(analysis.recommendations.length > 0);
  assert.ok(analysis.skills.includes('project-context-maintainer'));
});

test('memory updates are suggestions requiring confirmation', () => {
  const suggestions = buildMemorySuggestions([{ skill: 'meeting-notes-organizer', text: '决定：本周完成上线' }]);
  assert.equal(suggestions[0].requiresConfirmation, true);
  assert.equal(suggestions[0].target, 'project');
});

test('new conversations preserve messages and canvas as one record', () => {
  const conversation = createConversation('需求讨论', [{ role: 'user', text: '写 PRD' }], [{ id: 'c1', title: 'PRD' }]);
  const state = archiveConversation({ conversations: [], messages: conversation.messages, cards: conversation.cards }, conversation);
  assert.equal(state.conversations.length, 1);
  assert.equal(state.conversations[0].cards[0].title, 'PRD');
});

test('project canvas exposes cards across conversations with source metadata', () => {
  const state = { currentConversationId: 'current', cards: [{ id: 'now' }], conversations: [{ id: 'old', title: '旧对话', cards: [{ id: 'old-card' }] }] };
  assert.equal(projectCanvas(state).find(card => card.id === 'old-card').sourceConversationTitle, '旧对话');
});
