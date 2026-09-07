import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readdirSync, statSync, watch } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { homedir } from 'node:os';

const root = new URL('.', import.meta.url).pathname;
const dataFile = join(root, 'data', 'workspace.json');
const initial = { projectPath: '', projects: [], messages: [], cards: [] };
const subscribers = new Set();

function broadcastState(state) {
  const payload = `data: ${JSON.stringify({ type: 'state', state })}\n\n`;
  for (const res of subscribers) {
    try { res.write(payload); } catch { subscribers.delete(res); }
  }
}

function createConversation(title = '新对话', messages = [], cards = []) { return { id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, messages: [...messages], cards: [...cards], createdAt: Date.now(), updatedAt: Date.now() }; }
function archiveConversation(state, conversation) { return { ...state, conversations: [...(state.conversations || []), { ...conversation, updatedAt: Date.now() }] }; }
function projectCanvas(state) { return [...(state.conversations || []).flatMap(conversation => (conversation.cards || []).map(card => ({ ...card, sourceConversationId: conversation.id, sourceConversationTitle: conversation.title }))), ...(state.cards || []).map(card => ({ ...card, sourceConversationId: state.currentConversationId || 'current', sourceConversationTitle: '当前对话' }))]; }
async function load() { try { const state = JSON.parse(await readFile(dataFile, 'utf8')); state.conversations ||= []; state.currentConversationId ||= 'main'; return state; } catch { return { ...structuredClone(initial), conversations: [], currentConversationId: 'main' }; } }
async function save(state) {
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(dataFile, JSON.stringify(state, null, 2) + '\n');
  broadcastState(state);
}

try {
  let fileTimer;
  const watcher = watch(dataFile, () => {
    clearTimeout(fileTimer);
    fileTimer = setTimeout(async () => {
      try {
        const state = await load();
        broadcastState(state);
      } catch {}
    }, 150);
  });
  if (watcher && typeof watcher.unref === 'function') watcher.unref();
} catch {}
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
  if (/任务|推进|拆解|安排|领导|分一下|分工|调研|对齐|工作节奏/.test(text)) skills.push('task-arrangement-planner');
  if (/汇报|通知|周报|同步|风险/.test(text)) skills.push('update-writer');
  if (/复盘|沟通表现/.test(text)) skills.push('meeting-coach');
  if (/ai|agent|大模型/i.test(text)) skills.push('ai-pm-prd-builder');
  if (/调研|差异|渠道|对比|接入/.test(text)) {
    skills.push('task-arrangement-planner');
    skills.push('project-context-maintainer');
    skills.push('ai-pm-prd-builder');
  }
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
function findNextAvailablePosition(existingCards, preferredX, preferredY) {
  const cardWidth = 440, cardHeight = 360, gap = 30, startX = 80, startY = 80, maxCols = 3;
  function collides(x, y) {
    return (existingCards || []).some(c => {
      const cx = Number(c.x) || 0, cy = Number(c.y) || 0;
      return Math.abs(cx - x) < (cardWidth + 10) && Math.abs(cy - y) < (cardHeight + 10);
    });
  }
  if (preferredX != null && preferredY != null && (preferredX !== 90 || preferredY !== 80)) {
    if (!collides(preferredX, preferredY)) return { x: preferredX, y: preferredY };
  }
  for (let row = 0; row < 50; row++) {
    for (let col = 0; col < maxCols; col++) {
      const slotX = startX + col * (cardWidth + gap);
      const slotY = startY + row * (cardHeight + gap);
      if (!collides(slotX, slotY)) return { x: slotX, y: slotY };
    }
  }
  return { x: startX, y: startY };
}

const skillMeta = {
  'task-arrangement-planner': { label: '任务拆解与分工', icon: '📋' },
  'project-context-maintainer': { label: '项目背景与决策记忆', icon: '🧠' },
  'ai-pm-prd-builder': { label: '产品能力与矩阵契约', icon: '🤖' },
  'prd-writer': { label: '需求与业务流程PRD', icon: '📄' },
  'prd-review-handler': { label: '评审修改与验收标准', icon: '✅' },
  'update-writer': { label: '进展同步与风险通报', icon: '📢' },
  'meeting-notes-organizer': { label: '会议纪要与行动项', icon: '📝' },
  'meeting-coach': { label: '沟通表现与复盘画像', icon: '🎯' },
};

function mergeSkillResults(results) {
  const allCards = [];
  results.forEach((result, idx) => {
    const meta = skillMeta[result.skill] || { label: result.skill, icon: '▧' };
    if (result.cards && Array.isArray(result.cards) && result.cards.length > 0) {
      result.cards.forEach((card, cIdx) => {
        allCards.push({
          id: `skill-${idx}-${cIdx}`,
          skill: result.skill,
          skillLabel: meta.label,
          icon: card.icon || meta.icon,
          title: card.title || `【${meta.label}】产出模块`,
          body: card.body || result.text || '',
          x: 80 + (allCards.length % 3) * 470,
          y: 80 + Math.floor(allCards.length / 3) * 390
        });
      });
    } else {
      allCards.push({
        id: `skill-${idx}`,
        skill: result.skill,
        skillLabel: meta.label,
        icon: meta.icon,
        title: `【${meta.label}】交付模块`,
        body: result.text || '',
        x: 80 + (allCards.length % 3) * 470,
        y: 80 + Math.floor(allCards.length / 3) * 390
      });
    }
  });
  return {
    text: results.map(result => `【${result.skill}】\n${result.text}`).join('\n\n'),
    cards: allCards
  };
}
function analyzeProject(project, request = '') {
  const items = project?.items || [];
  const skills = selectSkills(request);
  if (items.some(item => item.type === 'memory' || /上下文|术语|工作记录/.test(item.name))) skills.unshift('project-context-maintainer');
  if (items.some(item => item.type === 'meeting')) skills.push('meeting-notes-organizer');
  const uniqueSkills = [...new Set(skills)];
  const recommendations = [];
  if (items.some(item => item.type === 'meeting')) recommendations.push('建议先整理近期会议纪要，提取决策和行动项');
  if (items.some(item => item.type === 'memory')) recommendations.push('发现项目记忆文件，建议同步最新背景和风险');
  if (/推进|开始|继续|需求/.test(request)) recommendations.push('建议并行分析需求、任务推进和相关方沟通');
  return { skills: uniqueSkills, recommendations, files: items.length };
}
function buildMemorySuggestions(results) {
  return results.filter(result => /决定|风险|偏好|承诺|行动/.test(result.text || '')).map(result => ({ target: /人物|老板|客户/.test(result.text) ? 'person' : 'project', sourceSkill: result.skill, content: result.text, requiresConfirmation: true }));
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
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
      subscribers.add(res);
      req.on('close', () => subscribers.delete(res));
      res.write(`data: ${JSON.stringify({ type: 'state', state: await load() })}\n\n`);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/bind') {
      const input = await body(req); const path = resolve(String(input.path || ''));
      const state = await load(); state.projectPath = path; state.projects = path ? [scanProject(path)] : []; await save(state); return json(res, 200, state);
    }
    if (req.method === 'POST' && url.pathname === '/api/message') {
      const input = await body(req); const text = String(input.text || '').trim(); if (!text) return json(res, 400, { error: '消息不能为空' });
      const state = await load(); state.messages.push({ role: 'user', text, at: Date.now() }); await save(state);
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
      const question = createWorkflowQuestion(text); const project = state.projects?.[0]; const analysis = analyzeProject(project, text); state.workflow = { id: question.id, status: 'awaiting_confirmation', request: text, skills: analysis.skills, recommendations: analysis.recommendations, question }; await save(state); res.write(`data: ${JSON.stringify({ type: 'question', question, analysis })}\n\n`); res.write('data: {"type":"done"}\n\n'); return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/workflow/answer') {
      const input = await body(req); const state = await load(); const workflow = state.workflow;
      if (!workflow || workflow.status !== 'awaiting_confirmation') return json(res, 409, { error: '当前没有等待回答的工作流' });
      workflow.answer = String(input.answer || ''); workflow.status = 'running';
      const results = await Promise.all(workflow.skills.map(async skill => ({ skill, ...(await modelReply(`你是 ${skill} 专家。只处理“${workflow.request}”，用户选择“${workflow.answer}”。严格依据项目资料，主动识别建议、风险、项目记忆和人物记忆变化。`, state)) })));
      const reply = mergeSkillResults(results);
      const memorySuggestions = buildMemorySuggestions(results); workflow.memorySuggestions = memorySuggestions;
      workflow.document = reply.text;
      workflow.review = buildMentorReview({ text: reply.text, cards: reply.cards }, workflow.skills);
      workflow.status = workflow.review.status === 'approved' ? 'approved' : 'needs_revision';
      if (reply.cards && reply.cards.length) {
        const newCards = [];
        for (let i = 0; i < reply.cards.length; i++) {
          const c = reply.cards[i];
          const pos = findNextAvailablePosition([...state.cards, ...newCards], c.x, c.y);
          newCards.push({ id: `${Date.now()}-${i}`, ...c, x: pos.x, y: pos.y });
        }
        state.cards = [...state.cards, ...newCards];
      }
      state.messages.push({ role: 'assistant', text: reply.text, at: Date.now() });
      await save(state);
      return json(res, 200, { workflow, cards: state.cards, text: reply.text });
    }
    if (req.method === 'POST' && url.pathname === '/api/cards') { const input = await body(req); const state = await load(); state.cards = input.cards || []; await save(state); return json(res, 200, state.cards); }
    if (req.method === 'GET' && url.pathname === '/api/project/cards') { const state = await load(); return json(res, 200, projectCanvas(state)); }
    if (req.method === 'POST' && url.pathname === '/api/project/cards/import') { const input = await body(req); const state = await load(); const card = projectCanvas(state).find(item => item.id === input.id); if (!card) return json(res, 404, { error: '画板不存在' }); state.cards.push({ ...card, id: `${card.id}-copy-${Date.now()}`, sourceConversationId: state.currentConversationId }); await save(state); return json(res, 200, state); }
    if (req.method === 'POST' && url.pathname === '/api/chat/open') { const input = await body(req); const state = await load(); const conversation = (state.conversations || []).find(item => item.id === input.id); if (!conversation) return json(res, 404, { error: '对话不存在' }); state.messages = conversation.messages; state.cards = conversation.cards; state.currentConversationId = conversation.id; await save(state); return json(res, 200, state); }
    if (req.method === 'POST' && url.pathname === '/api/chat/new') { const state = await load(); if (state.messages.length || state.cards.length) { const saved = createConversation(String(state.messages.find(m => m.role === 'user')?.text || '新对话').slice(0, 32), state.messages, state.cards); state.conversations = archiveConversation(state, saved).conversations; } state.messages = []; state.cards = []; state.workflow = null; state.currentConversationId = `main-${Date.now()}`; await save(state); return json(res, 200, state); }
    if (req.method === 'GET') { const file = url.pathname === '/' ? '/index.html' : url.pathname; try { const content = await readFile(join(root, 'public', file)); const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'; res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' }); return res.end(content); } catch {} }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`); res.end(); } else json(res, 500, { error: message });
  }
});
if (process.argv[1] === new URL(import.meta.url).pathname) server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => console.log(`PM Workbench: http://127.0.0.1:${process.env.PORT || 4317}`));
export { parseCredentialRefs, resolveModelConfig, server, scanProject, classifyFile, selectSkills, buildMentorReview, createWorkflowQuestion, mergeSkillResults, analyzeProject, buildMemorySuggestions, createConversation, archiveConversation, projectCanvas, loadProjectContext, modelReply };
