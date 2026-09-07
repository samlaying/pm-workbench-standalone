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
  'deliverable-template': { label: '最终交付模版', icon: '📐' },
};

function buildDeliverableTemplate(request = '', results = []) {
  const req = String(request || '').trim();
  if (!req) return null;
  const isChannel = /调研|差异|渠道|对比|接入|竞品|选型/i.test(req);
  const isPrd = /prd|需求|流程/i.test(req);
  const isTask = /任务|推进|拆解|安排|计划|分工/.test(req);
  const isMeeting = /会议|纪要|录音|行动项/.test(req);

  if (isChannel) {
    return {
      title: '【最终交付模版】渠道流程与能力差异评估矩阵 & 汇报框架',
      body: `### 📐 标准交付物模版：渠道流程与能力差异评估矩阵

> **使用说明**：本模版包含**《各渠道能力与流程差异评估矩阵（填报表）》**、**《向领导汇报5段式框架》**及**《二人分工推进追踪表》**，可直接复制、填写并向领导交付。

#### 一、各渠道能力差异与接入流程评估矩阵（可直接编辑填写）

| 评估维度 / 渠道 | 飞书 (Feishu) | 企业微信 (WeCom) | 微信 (WeChat / 公众号 / 企微互通) | 钉钉 (DingTalk) | 评估说明 / 差异小结 |
|---|---|---|---|---|---|
| **接入凭证与鉴权** | 自建应用 (AppID / AppSecret) | 企微自建应用 (AgentID / Secret) | 公众号/服务号凭证或企微互通绑定 | 开放平台 (AppKey / AppSecret) | 微信生态个人号无官方凭证，风控最高 |
| **网络与部署要求** | 支持长连接/Webhook，需公网或穿透 | 必须配置固定公网可信IP与域名 | 需配置外网服务器URL与Token校验 | 支持Stream模式免公网IP接入 | 钉钉Stream与飞书长连接适合内网与本地快速调测 |
| **消息双向收发** | ✅ 支持文本、富文本、卡片交互、事件订阅 | ✅ 支持文本、Markdown、图文推送与回调 | ⚠️ 个人号高风控，公众号模板消息受限 | ✅ 支持文本、Markdown、互动卡片与长连接 | 飞书/企微/钉钉均满足生产级消息双向收发 |
| **文档与知识库联动** | ✅ 原生打通云文档与知识库读写API | ⚠️ 微盘接口能力受限，需企业级授权 | ❌ 不支持原生企业级文档交互 | ⚠️ 需单独申请钉钉文档权限与组织授权 | **典型差异**：Hermes接入后仅收发消息，无法直接读写文档 |
| **CLI与宿主双向控制** | 需适配Agent中转指令下发并回调 | 需通过应用菜单或指令服务联动 | 极难实现安全可靠的双向宿主控制 | 依托互动卡片与流式回调驱动控制命令 | **典型差异**：Workbuddy仅本地CLI，无法通过IM双向操作 |
| **卡片交互与表单提交** | ✅ 消息卡片支持按钮、下拉、表单提交 | ✅ 支持交互卡片与任务卡片 | ❌ 仅支持基础自定义菜单或外链网页 | ✅ 互动卡片支持高频实时局部刷新 | 飞书与钉钉卡片交互体验最佳 |
| **主要技术阻碍与风控** | 权限申请需租户管理员审批 | 外部群与客户联系人权限链条长 | 协议封号风险极高，严禁用于生产核心 | 接口文档分支多，配置与权限较为繁琐 | 微信个人号生态禁止作为企业核心基础设施 |
| **落地建议优先级** | **P0（首选推荐）** | **P1（企业协同备选）** | **暂缓（风险过高）** | **P1（技术互补备选）** | 优先飞书打通全能力闭环，钉钉作为免公网备选 |

---

#### 二、向领导汇报材料框架（5段式汇报标准结构）

1. **调研背景与核心目标**：明确本次调研重点解决渠道生态接入差异，摸清 Hermes（弱文档联动）与 Workbuddy（纯 CLI 无 IM 操作）的能力瓶颈。
2. **核心选型结论 (TL;DR)**：
   - 渠道能力呈现“基础消息易打通、文档与宿主控制存在生态壁垒”的明显分层。
   - 建议方案：采用“统一消息网关 + 宿主控制适配层”双层架构，首期打通飞书完整协同能力。
3. **关键产品与渠道能力断层比对**（Hermes vs Workbuddy vs 目标架构）。
4. **二人分工与推进计划**（按渠道与技术层级拆分并行推进）。
5. **需要领导/跨团队协助事项**（各渠道开发者账号审批、测试租户授权）。

---

#### 三、二人分工与执行推进追踪表（可直接认领）

| 渠道 / 模块 | 责任人 | 核心任务与交付项 | 预期产出格式 | 截止时间 | 当前状态 |
|---|---|---|---|---|---|
| **飞书 & 钉钉接入方案** | [认领人 A] | 验证长连接/Stream模式、打通文档API与卡片回调 | 《飞书/钉钉接入流程与Demo验证》 | T+2 | [待认领] |
| **企微 & 微信生态方案** | [认领人 B] | 梳理企微权限链条、输出微信风险报告与Hermes差异 | 《企微接入规范与微信风控分析》 | T+3 | [待认领] |
| **统一汇报材料整合** | [认领人 A + B] | 填充评估矩阵、编写汇报 PPT/飞书文档并组织对齐 | 《渠道接入选型评估与分工汇报》 | T+5 | [待认领] |`
    };
  }

  if (isPrd) {
    return {
      title: '【最终交付模版】标准产品需求文档 (PRD) 规范模版',
      body: `### 📐 标准交付物模版：产品需求文档 (PRD) 框架

#### 一、文档基本信息
- **文档版本**：V1.0
- **撰写人**：[PM姓名]
- **评审状态**：[待评审 / 评审中 / 已定稿]

#### 二、需求背景与业务价值
1. **业务背景**：[解决什么业务/产品背景下的什么痛点]
2. **目标用户**：[核心目标用户群体与典型画像]
3. **业务价值与目标**：[定性价值与定量核心指标目标]

#### 三、功能清单与优先级矩阵
| 功能模块 | 子功能点 | 需求描述 | 优先级 | 对应角色 | 交付排期 |
|---|---|---|---|---|---|
| [模块1] | [功能A] | [描述] | P0 | [用户/管理员] | [Sprint 1] |
| [模块1] | [功能B] | [描述] | P1 | [用户] | [Sprint 2] |

#### 四、核心业务流程与 Happy Path
- **主流程 (Happy Path)**：[步骤1 -> 步骤2 -> 步骤3 -> 成功闭环]
- **异常分支与容错机制**：
  - [异常分支 1]：网络超时或服务不可用 -> [降级与重试机制]
  - [异常分支 2]：输入格式不合法或校验失败 -> [明确错误提示]

#### 五、数据指标与上线验收标准 (DoD)
1. **关键埋点需求**：[事件名、触发时机、上报参数]
2. **上线验收标准 (Definition of Done)**：
   - [ ] 主流程与核心异常用例 100% 通过测试；
   - [ ] 关键业务指标监控与告警看板已配置；
   - [ ] 上线发版通知与用户操作指引已就绪。`
    };
  }

  if (isTask) {
    return {
      title: '【最终交付模版】任务执行推进与分工追踪模版 (WBS)',
      body: `### 📐 标准交付物模版：任务推进与分工追踪 (WBS)

#### 一、任务里程碑规划
| 里程碑节点 | 核心目标 | 预计完成时间 | 责任人 | 交付状态 |
|---|---|---|---|---|
| **M1: 方案对齐** | 完成方案细化与技术可行性评审 | T+2 | [负责人] | [进行中] |
| **M2: 开发联调** | 完成核心功能开发与联调 | T+7 | [负责人] | [待开始] |
| **M3: 验证上线** | 完成测试验收与上线发布 | T+10 | [负责人] | [待开始] |

#### 二、任务详细拆解与责任矩阵 (WBS)
| 模块/阶段 | 任务细项 | 详细要求与验收产出 | 责任人 | 依赖前置 | 截止时间 |
|---|---|---|---|---|---|
| [阶段一] | [任务 1.1] | [具体产出标准] | [责任人] | 无 | [时间] |
| [阶段一] | [任务 1.2] | [具体产出标准] | [责任人] | [任务 1.1] | [时间] |
| [阶段二] | [任务 2.1] | [具体产出标准] | [责任人] | [阶段一] | [时间] |

#### 三、风险登记与应对预案
| 风险项 | 影响程度 | 发生概率 | 应对预案与规避措施 | 责任人 |
|---|---|---|---|---|
| [风险 1] | 高 / 中 / 低 | 高 / 中 / 低 | [具体的降级、备选或止损方案] | [跟踪人] |`
    };
  }

  if (isMeeting) {
    return {
      title: '【最终交付模版】结构化会议纪要与行动项跟踪模版',
      body: `### 📐 标准交付物模版：结构化会议纪要与行动项

#### 一、会议基本信息
- **会议主题**：[填写会议主题]
- **会议时间**：[日期与时段]
- **参会人员**：[参会团队与名单]

#### 二、核心背景与讨论要点
1. **议题 1**：[核心议题背景与主要争论点]
2. **议题 2**：[各方诉求与技术/业务约束]

#### 三、关键决策结论 (Decisions)
- [x] **决策 1**：[达成一致的明确结论]
- [x] **决策 2**：[方案选型或排期敲定结果]

#### 四、行动项清单 (Action Items)
| 事项序号 | 行动项内容 | 责任人 | 交付产出要求 | 截止时间 | 当前状态 |
|---|---|---|---|---|---|
| 1 | [具体行动任务] | [责任人] | [可验收文档/成果] | [精确到日] | [待认领] |
| 2 | [具体行动任务] | [责任人] | [可验收文档/成果] | [精确到日] | [待认领] |`
    };
  }

  return {
    title: '【最终交付模版】标准化交付物框架与推进模版',
    body: `### 📐 标准交付物模版：交付框架与执行推进

#### 一、交付物核心目标与范围
- **目标陈述**：[简明扼要说明本次交付的核心价值与预期效果]
- **交付范围**：[明确包含项 In-scope 与不包含项 Out-of-scope]

#### 二、方案全景评估与执行标准
| 维度 / 模块 | 现状与核心诉求 | 推荐方案与标准 | 预期收益 | 关键验收指标 |
|---|---|---|---|---|
| [模块 1] | [现状分析] | [执行标准] | [收益点] | [衡量标准] |
| [模块 2] | [现状分析] | [执行标准] | [收益点] | [衡量标准] |

#### 三、下一步执行与推进安排
| 序号 | 交付任务 | 负责角色 | 预期输出成果 | 截止时间 |
|---|---|---|---|---|
| 1 | [任务 A] | [负责人] | [输出文档/成果] | [时间] |
| 2 | [任务 B] | [负责人] | [输出文档/成果] | [时间] |`
  };
}

function mergeSkillResults(results, request = '') {
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

  const hasTemplateCard = allCards.some(c => c.skill === 'deliverable-template' || /最终交付模版/.test(c.title || ''));
  if (!hasTemplateCard && request) {
    const template = buildDeliverableTemplate(request, results);
    if (template) {
      allCards.push({
        id: `skill-template-${Date.now()}`,
        skill: 'deliverable-template',
        skillLabel: '最终交付模版',
        icon: '📐',
        title: template.title,
        body: template.body,
        x: 80 + (allCards.length % 3) * 470,
        y: 80 + Math.floor(allCards.length / 3) * 390
      });
    }
  }

  let fullText = results.map(result => `【${result.skill}】\n${result.text}`).join('\n\n');
  if (allCards.some(c => c.skill === 'deliverable-template' || /最终交付模版/.test(c.title || ''))) {
    fullText += '\n\n---\n### 📐【最终交付模版】\n已在画板生成独立的【最终交付模版】卡片，包含规范评估矩阵、直接可用填报表格与汇报框架，可直接复制或按需填写交付给领导及团队。';
  }

  return {
    text: fullText,
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
function buildProjectGraph(project, request, conversationId, results = [], cards = []) {
  const now = Date.now();
  const projectId = project?.id || project?.name || 'unbound-project';
  const requirement = { id: `requirement-${now}`, projectId, type: 'requirement', title: String(request || '未命名需求').slice(0, 80), status: 'active', createdAt: now };
  const conversation = { id: conversationId || `conversation-${now}`, projectId, type: 'conversation', title: String(request || '新对话').slice(0, 32), createdAt: now };
  const nodes = [requirement, conversation];
  const edges = [
    { id: `edge-${now}-requirement`, source: requirement.id, target: conversation.id, kind: 'contains', createdBy: 'agent' }
  ];
  const addNode = (node, parent = conversation) => {
    nodes.push(node);
    edges.push({ id: `edge-${now}-${edges.length}`, source: parent.id, target: node.id, kind: 'agent_link', createdBy: 'agent', reason: `由 ${node.skill || node.type} 产生` });
  };
  cards.forEach((card, index) => addNode({ id: `deliverable-${now}-${index}`, projectId, conversationId: conversation.id, type: /模版|模板|PRD|汇报|纪要/.test(card.title || '') ? 'deliverable' : 'analysis', title: card.title, content: card.body, skill: card.skill, status: /模版|模板/.test(card.title || '') ? 'skeleton' : 'draft', position: { x: 520 + (index % 3) * 360, y: 140 + Math.floor(index / 3) * 280 }, createdAt: now }));
  results.forEach((result, index) => addNode({ id: `skill-${now}-${index}`, projectId, conversationId: conversation.id, type: 'analysis', title: result.skill, content: result.text, skill: result.skill, status: 'complete', position: { x: 100 + (index % 3) * 360, y: 480 + Math.floor(index / 3) * 280 }, createdAt: now }));
  const memoryResults = buildMemorySuggestions(results);
  memoryResults.forEach((memory, index) => addNode({ id: `memory-${now}-${index}`, projectId, conversationId: conversation.id, type: 'memory', title: `${memory.target === 'person' ? '人物' : '项目'}记忆候选`, content: memory.content, skill: memory.sourceSkill, status: 'needs_confirmation', requiresConfirmation: true, position: { x: 100 + index * 360, y: 900 }, createdAt: now }));
  return { projectId, requirement, conversation, nodes, edges, updatedAt: now };
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
      const results = await Promise.all(workflow.skills.map(async skill => ({ skill, ...(await modelReply(`你是 ${skill} 专家。只处理“${workflow.request}”，用户选择“${workflow.answer}”。严格依据项目资料，主动识别建议、风险、项目记忆和人物记忆变化。如果该任务属于调研、方案、PRD或推进类任务，请提供详细结构化内容与明确标准。`, state)) })));
      const reply = mergeSkillResults(results, workflow.request);
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
      const graph = buildProjectGraph(state.projects?.[0], workflow.request, state.currentConversationId || 'main', results, reply.cards);
      const existingGraph = state.graph || { projectId: graph.projectId, nodes: [], edges: [] };
      state.graph = { ...graph, nodes: [...existingGraph.nodes, ...graph.nodes], edges: [...existingGraph.edges, ...graph.edges], updatedAt: Date.now() };
      state.messages.push({ role: 'assistant', text: reply.text, at: Date.now() });
      await save(state);
      return json(res, 200, { workflow, cards: state.cards, text: reply.text });
    }
    if (req.method === 'POST' && url.pathname === '/api/cards') { const input = await body(req); const state = await load(); state.cards = input.cards || []; await save(state); return json(res, 200, state.cards); }
    if (req.method === 'GET' && url.pathname === '/api/project/cards') { const state = await load(); return json(res, 200, projectCanvas(state)); }
    if (req.method === 'GET' && url.pathname === '/api/graph') { const state = await load(); return json(res, 200, state.graph || { nodes: [], edges: [] }); }
    if (req.method === 'POST' && url.pathname === '/api/project/cards/import') {
      const input = await body(req); const state = await load();
      const card = projectCanvas(state).find(item => item.id === input.id);
      if (!card) return json(res, 404, { error: '画板不存在' });
      const pos = findNextAvailablePosition(state.cards, card.x, card.y);
      state.cards.push({ ...card, id: `${card.id}-copy-${Date.now()}`, sourceConversationId: state.currentConversationId, x: pos.x, y: pos.y });
      await save(state);
      return json(res, 200, state);
    }
    if (req.method === 'POST' && url.pathname === '/api/chat/open') { const input = await body(req); const state = await load(); const conversation = (state.conversations || []).find(item => item.id === input.id); if (!conversation) return json(res, 404, { error: '对话不存在' }); state.messages = conversation.messages; state.cards = conversation.cards; state.currentConversationId = conversation.id; await save(state); return json(res, 200, state); }
    if (req.method === 'POST' && url.pathname === '/api/chat/new') { const state = await load(); if (state.messages.length || state.cards.length) { const saved = createConversation(String(state.messages.find(m => m.role === 'user')?.text || '新对话').slice(0, 32), state.messages, state.cards); state.conversations = archiveConversation(state, saved).conversations; } state.messages = []; state.cards = []; state.workflow = null; state.currentConversationId = `main-${Date.now()}`; await save(state); return json(res, 200, state); }
    if (req.method === 'GET' || req.method === 'HEAD') { const file = url.pathname === '/' ? '/index.html' : url.pathname; try { const content = await readFile(join(root, 'public', file)); const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'; res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-cache' }); if (req.method === 'HEAD') return res.end(); return res.end(content); } catch {} }
    json(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器错误';
    if (res.headersSent) { res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`); res.end(); } else json(res, 500, { error: message });
  }
});
if (process.argv[1] === new URL(import.meta.url).pathname) server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () => console.log(`PM Workbench: http://127.0.0.1:${process.env.PORT || 4317}`));
export { parseCredentialRefs, resolveModelConfig, server, scanProject, classifyFile, selectSkills, buildMentorReview, createWorkflowQuestion, mergeSkillResults, buildDeliverableTemplate, analyzeProject, buildMemorySuggestions, buildProjectGraph, createConversation, archiveConversation, projectCanvas, loadProjectContext, modelReply };
