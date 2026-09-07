import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';

const root = new URL('.', import.meta.url).pathname;
const dataFile = join(root, 'data', 'workspace.json');
const initial = { projectPath: '', projects: [], messages: [], cards: [] };

async function load() { try { return JSON.parse(await readFile(dataFile, 'utf8')); } catch { return structuredClone(initial); } }
async function save(state) { await mkdir(join(root, 'data'), { recursive: true }); await writeFile(dataFile, JSON.stringify(state, null, 2) + '\n'); }
function parseCredentialRefs(text) {
  const refs = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s{2}([A-Z][A-Z0-9_]*):\s*(.*)$/);
    if (match) refs[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return refs;
}
function resolveModelConfig(env = process.env) {
  return {
    baseUrl: env.MODEL_BASE_URL || 'http://192.227.138.214:8317/v1',
    model: env.MODEL_NAME || 'gpt-5.5',
    apiKeyEnv: 'CLIPROXY_API_KEY',
    apiKey: env.MODEL_API_KEY || env.CLIPROXY_API_KEY,
  };
}
async function loadModelConfig() {
  const config = resolveModelConfig();
  if (!config.apiKey) {
    try {
      const credentials = await readFile(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8');
      config.apiKey = parseCredentialRefs(credentials)[config.apiKeyEnv];
    } catch {}
  }
  return config;
}
async function loadProjectContext(projectPath) {
  if (!projectPath) return '';
  const coreFiles = ['项目上下文.md', '内部术语表.md', '项目工作记录.md', '任务.md', '猎聘agent-prd.md', '技术细节.md'];
  const sections = [];
  for (const file of coreFiles) {
    try {
      const fullPath = join(projectPath, file);
      const content = await readFile(fullPath, 'utf8');
      if (content.trim()) {
        sections.push(`### 【${file}】\n${content.slice(0, 8000)}`);
      }
    } catch {}
  }
  return sections.join('\n\n');
}

async function modelReply(text, state) {
  const { baseUrl: base, apiKey: key, model } = await loadModelConfig();
  if (!base || !key) return { text: `已收到：${text}\n\n我会结合当前项目资料继续处理。`, cards: [] };
  const projectContext = await loadProjectContext(state.projectPath);
  const systemPrompt = `你是 PM Workbench 主 Agent。你必须严格基于下方提供的【当前项目真实资料库】中的背景、业务术语、历史决策和实际文档内容来分析和回答用户，务必引用真实业务事实与文档中的专有名词，严禁脱离实际材料凭空编造。\n返回严格 JSON：{"text":"给用户的简洁回复","cards":[{"title":"标题","body":"完整 Markdown","icon":"📄","x":90,"y":80}]}。只有当用户请求产出 PRD、会议纪要、方案、任务画像或其他结构化成果时才新增 cards；当用户使用 @引用画板卡片并要求修改时，返回同 id 的更新卡片；text 只放摘要。\n\n【当前项目真实资料库】：\n${projectContext || '（暂未绑定项目或项目暂无核心文档）'}`;
  const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: systemPrompt }, ...state.messages.slice(-12).map(m => ({ role: m.role, content: m.text })), { role: 'user', content: `${text}\n\n当前画板内容：${JSON.stringify(state.cards)}` }] }) });
  if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
  const payload = await response.json(); const raw = payload.choices?.[0]?.message?.content || '{}';
  try { const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')); return { text: String(parsed.text || raw), cards: Array.isArray(parsed.cards) ? parsed.cards : [] }; } catch { return { text: raw, cards: [] }; }
}

function json(res, status, body) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) { let text = ''; for await (const chunk of req) text += chunk; return text ? JSON.parse(text) : {}; }
function classifyFile(file) {
  const name = String(file).toLowerCase();
  if (/会议|meeting|日会|周会/.test(name)) return { type: 'meeting', label: '会议纪要' };
  if (/\.xlsx?$|\.csv$/.test(name)) return { type: 'table', label: '表格' };
  if (/\.mmd$|\.mermaid$|流程图|flow/.test(name)) return { type: 'flow', label: '流程图' };
  if (/人物|person|客户|老板/.test(name)) return { type: 'person', label: '人物' };
  if (/任务|todo|task/.test(name)) return { type: 'task', label: '任务' };
  if (/图片|截图|\.png$|\.jpe?g$|\.webp$/.test(name)) return { type: 'image', label: '图片' };
  if (/术语|上下文|工作记录|memory|记忆/.test(name)) return { type: 'memory', label: '项目记忆' };
  return { type: 'document', label: '文档' };
}
function selectSkills(text) {
  const skills = [];
  if (/会议|纪要|录音|todo|行动项/.test(text)) skills.push('meeting-notes-organizer');
  if (/prd|需求文档|评审前|写需求/i.test(text)) skills.push('prd-writer');
  if (/评审|反馈|验收标准/.test(text)) skills.push('prd-review-handler');
  if (/任务|推进|拆解|安排/.test(text)) skills.push('task-arrangement-planner');
  if (/汇报|通知|周报|同步|风险/.test(text)) skills.push('update-writer');
  if (/复盘|沟通表现/.test(text)) skills.push('meeting-coach');
  if (/ai|agent|大模型/i.test(text)) skills.push('ai-pm-prd-builder');
  return [...new Set(skills.length ? skills : ['project-context-maintainer'])];
}
function buildMentorReview(result, skills) {
  const issues = [];
  if (!result?.text || result.text.length < 80) issues.push('交付物正文过短，缺少可执行细节');
  if (skills.includes('prd-writer') && !result?.text?.match(/目标|范围|验收|异常/)) issues.push('PRD 缺少目标、范围、验收或异常流程');
  if (!result?.cards?.length) issues.push('没有形成可追踪的画布交付物');
  return { status: issues.length ? 'needs_revision' : 'approved', issues, checkedSkills: skills, reviewer: 'PM Mentor' };
}
function createWorkflowQuestion(text) {
  return { type: 'ask_user_question', id: `q-${Date.now()}`, question: `这项工作需要先确认范围：${text}`, options: [
    { id: 'draft', label: '先出初稿', description: '快速形成可讨论的主要文档' },
    { id: 'deep', label: '完整分析', description: '并行执行相关 Skill，并进行严格导师审核' },
    { id: 'report', label: '直接做汇报', description: '优先生成面向汇报对象的结构化内容' },
  ] };
}
function mergeSkillResults(results) {
  return { text: results.map(result => `【${result.skill}】\n${result.text}`).join('\n\n'), cards: results.map((result, index) => ({ id: `skill-${index}`, icon: '▧', title: result.skill, body: result.text, x: 100 + (index % 3) * 390, y: 100 + Math.floor(index / 3) * 300 })) };
}
function scanProject(path) {
  const items = [];
  const walk = (dir, depth = 0) => { if (depth > 2) return; for (const name of readdirSync(dir, { withFileTypes: true })) { if (name.name.startsWith('.')) continue; const full = join(dir, name.name); if (name.isDirectory()) walk(full, depth + 1); else if (/\.(md|txt|xml)$/i.test(name.name)) items.push({ id: full, name: name.name, path: full, type: 'document' }); } };
  try { walk(path); } catch {}
  const fallback = [{ id: 'docs', name: '文档', type: 'group' }, { id: 'meetings', name: '会议', type: 'group' }, { id: 'notes', name: '工作记录', type: 'group' }];
  return { id: basename(path), name: basename(path), path, items: items.length ? items.map(item => ({ ...item, ...classifyFile(item.path) })) : fallback };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, await load());
    if (req.method === 'POST' && url.pathname === '/api/bind') {
      const input = await body(req); const path = resolve(String(input.path || ''));
      const state = await load(); state.projectPath = path; state.projects = path ? [scanProject(path)] : []; await save(state); return json(res, 200, state);
    }
    if (req.method === 'POST' && url.pathname === '/api/message') {
      const input = await body(req); const text = String(input.text || '').trim(); if (!text) return json(res, 400, { error: '消息不能为空' });
      const state = await load(); state.messages.push({ role: 'user', text, at: Date.now() }); await save(state);
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const question = createWorkflowQuestion(text); state.workflow = { id: question.id, status: 'awaiting_confirmation', request: text, skills: selectSkills(text), question }; await save(state); res.write(`data: ${JSON.stringify({ type: 'question', question })}\n\n`); res.write('data: {"type":"done"}\n\n'); return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/workflow/answer') {
      const input = await body(req); const state = await load(); const workflow = state.workflow;
      if (!workflow || workflow.status !== 'awaiting_confirmation') return json(res, 409, { error: '当前没有等待回答的工作流' });
      workflow.answer = String(input.answer || ''); workflow.status = 'running';
      const prompt = `请调用所选技能 [${workflow.skills.join(', ')}]，严格依据当前绑定项目的真实文档资料，处理用户需求：“${workflow.request}”（用户偏好：${workflow.answer}）。请务必结合真实业务背景与术语产出详尽方案与画板卡片。`;
      const reply = await modelReply(prompt, state);
      workflow.document = reply.text;
      workflow.review = buildMentorReview({ text: reply.text, cards: reply.cards }, workflow.skills);
      workflow.status = workflow.review.status === 'approved' ? 'approved' : 'needs_revision';
      if (reply.cards && reply.cards.length) {
        state.cards = [...state.cards, ...reply.cards.map((c, i) => ({ id: `${Date.now()}-${i}`, ...c }))];
      }
      state.messages.push({ role: 'assistant', text: reply.text, at: Date.now() });
      await save(state);
      return json(res, 200, { workflow, cards: state.cards, text: reply.text });
    }
    if (req.method === 'POST' && url.pathname === '/api/cards') { const input = await body(req); const state = await load(); state.cards = input.cards || []; await save(state); return json(res, 200, state.cards); }
    if (req.method === 'POST' && url.pathname === '/api/chat/new') { const state = await load(); state.messages = []; state.workflow = null; await save(state); return json(res, 200, state); }
    if (req.method === 'GET') { const file = url.pathname === '/' ? '/index.html' : url.pathname; try { const content = await readFile(join(root, 'public', file)); const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'; res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' }); return res.end(content); } catch {} }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`); res.end(); } else json(res, 500, { error: message });
  }
});
if (process.argv[1] === new URL(import.meta.url).pathname) server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => console.log(`PM Workbench: http://127.0.0.1:${process.env.PORT || 4317}`));
export { parseCredentialRefs, resolveModelConfig, server, scanProject, classifyFile, selectSkills, buildMentorReview, createWorkflowQuestion, mergeSkillResults, loadProjectContext, modelReply };

