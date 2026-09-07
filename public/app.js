const app = document.querySelector('#app');
let state = { projects: [], messages: [], cards: [] }, scale = 1, pan = { x: 0, y: 0 }, drag = null, panning = null, sending = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const position = value => Number.isFinite(Number(value)) ? Math.max(-2000, Math.min(5000, Number(value))) : 0;
const cardData = card => ({ ...card, x: position(card.x), y: position(card.y), title: String(card.title || '未命名卡片'), body: String(card.body || '') });

/* Professional SVG Icon System */
function icon(name, size = 16) {
  const icons = {
    folder: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
    search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    'panel-left': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>`,
    plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    send: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
    sparkles: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
    'file-text': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    tag: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r=".5" fill="currentColor"/></svg>`,
    clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    settings: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    user: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`,
    x: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    edit: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    refresh: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    eye: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    maximize: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
    paperclip: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    chevronDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    chevronRight: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
    alert: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`
  };
  return icons[name] || '';
}

/* Lightweight, Safe Markdown Renderer */
function renderMarkdown(raw) {
  if (!raw) return '';
  const text = String(raw);

  // Parse code blocks first
  const codeBlocks = [];
  const textWithoutCode = text.replace(/```([a-z]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="language-${esc(lang)}">${esc(code.trim())}</code></pre>`);
    return `__CODE_BLOCK_${idx}__`;
  });

  const lines = textWithoutCode.split('\n');
  const out = [];
  let inList = false;
  let inTable = false;
  let tableHeaderParsed = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Table rows
    if (line.startsWith('|') && line.endsWith('|')) {
      if (inList) { out.push('</ul>'); inList = false; }
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        // separator row, skip
        tableHeaderParsed = true;
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableHeaderParsed = false;
        out.push('<table><thead><tr>' + cells.map(c => `<th>${formatInline(c)}</th>`).join('') + '</tr></thead><tbody>');
      } else {
        out.push('<tr>' + cells.map(c => `<td>${formatInline(c)}</td>`).join('') + '</tr>');
      }
      continue;
    } else if (inTable) {
      out.push('</tbody></table>');
      inTable = false;
    }

    // List items
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${formatInline(line.slice(2))}</li>`);
      continue;
    } else if (inList) {
      out.push('</ul>');
      inList = false;
    }

    if (!line) continue;

    // Headers
    if (line.startsWith('#### ')) {
      out.push(`<h4>${formatInline(line.slice(5))}</h4>`);
    } else if (line.startsWith('### ')) {
      out.push(`<h3>${formatInline(line.slice(4))}</h3>`);
    } else if (line.startsWith('## ')) {
      out.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      out.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (line.startsWith('> ')) {
      out.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
    } else if (line.startsWith('---')) {
      out.push('<hr style="border:0;border-top:1px solid var(--border-default);margin:12px 0;">');
    } else {
      out.push(`<p>${formatInline(line)}</p>`);
    }
  }

  if (inList) out.push('</ul>');
  if (inTable) out.push('</tbody></table>');

  let result = out.join('');
  result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[idx] || '');
  return result;
}

function formatInline(str) {
  let s = esc(str);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-600);">$1</a>');
  return s;
}

function showError(message) {
  const error = document.createElement('div');
  error.className = 'error';
  error.innerHTML = `${icon('alert', 16)} <div>${esc(message)}</div>`;
  app.append(error);
  setTimeout(() => error.remove(), 6000);
}

function showQuestion(question) {
  state.pendingQuestion = question;
  document.querySelector('.question-card')?.remove();
  const card = document.createElement('div');
  card.className = 'question-card';
  card.innerHTML = `
    <div class="question-card-header">${icon('sparkles', 14)} 需要决策确认</div>
    <p>${esc(question.question)}</p>
    <div class="question-card-options">
      ${question.options.map(option => `
        <button data-answer="${esc(option.id)}">
          <strong>${esc(option.label)}</strong>
          <small>${esc(option.description || '')}</small>
        </button>
      `).join('')}
    </div>
  `;
  document.querySelector('.chat')?.append(card);
  card.querySelectorAll('[data-answer]').forEach(button => {
    button.onclick = async () => {
      card.remove();
      const response = await request('/api/workflow/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer: button.dataset.answer })
      });
      const result = await response.json();
      state = { ...state, ...result, workflow: result.workflow };
      render();
    };
  });
}

async function request(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`请求失败（${response.status}）`);
  return response;
}

function render() {
  const draft = document.querySelector('#text')?.value || '';
  app.innerHTML = `
    <aside class="left">
      <div class="sidebar-header">
        <h1>${icon('sparkles', 18)} PM Workbench</h1>
      </div>
      <div class="search-box">
        ${icon('search', 14)}
        <input id="search" placeholder="搜索项目、需求、卡片...">
      </div>
      <div class="section-label">活跃项目</div>
      ${state.projects.map(p => `
        <section class="project">
          <div class="project-title-bar">
            <span class="project-name">${icon('folder', 14)} ${esc(p.name)}</span>
            <div class="project-actions">
              <button class="btn-project-action btn-primary" data-new-chat="${esc(p.path)}" title="在当前项目发起新对话">${icon('plus', 12)} 新对话</button>
              <button class="btn-project-action" data-bind="${esc(p.path)}" title="在画板聚焦此项目">${icon('maximize', 12)} 画布</button>
            </div>
          </div>
          <div class="project-items">
            <div class="project-item-group">
              <div class="project-item-header" style="justify-content:space-between;">
                <span style="display:flex;align-items:center;gap:4px;">${icon('chevronDown', 12)} 会话</span>
                <button class="btn-item-action" data-new-chat="${esc(p.path)}" title="新增对话">${icon('plus', 11)} 新对话</button>
              </div>
              <div class="project-chat-item active" data-new-chat="${esc(p.path)}" title="当前对话"><span>· 当前对话 ${state.messages.length ? `(${state.messages.length}条)` : '（新）'}</span></div>
              ${(state.conversations || []).map(c => `<div class="project-chat-item" data-conversation="${esc(c.id)}" title="切换历史对话"><span>· ${esc(c.title)} (${c.messages.length}条)</span></div>`).join('')}
            </div>
            <div class="project-item-group">
              <div class="project-item-header">${icon('chevronDown', 12)} 需求点</div>
              <div class="project-subitem">· V1 范围定义与定位转折</div>
              <div class="project-subitem">· 核心 Skill 链路与导流</div>
            </div>
            <div class="project-item-group">
              <div class="project-item-header">${icon('chevronDown', 12)} 关联文档</div>
              <div class="project-subitem">· 项目上下文.md</div>
              <div class="project-subitem">· 猎聘agent-prd.md</div>
            </div>
          </div>
        </section>
      `).join('') || '<p class="muted">关联一个项目工作区后，业务资料与术语库将在此处呈现。</p>'}
      <button id="bind" class="btn-bind">${icon('plus', 14)} 关联本地项目文件夹</button>
      <footer>
        <button data-tool="terms">${icon('tag', 14)} 内部术语表</button>
        <button data-tool="cross-project">${icon('clock', 14)} 跨项目工作记录</button>
        <button data-tool="settings">${icon('settings', 14)} 工作区偏好设置</button>
        <button data-tool="profile">${icon('user', 14)} PM 能力画像</button>
      </footer>
    </aside>

    <main class="chat">
      <header>
        <div class="chat-header-title">
          <strong>需求工作台</strong>
          <span>对话推演</span>
        </div>
        <button id="btn-header-new-chat" class="btn-new-chat-header" title="开启新对话">
          ${icon('plus', 13)} 新建对话
        </button>
      </header>
      <div id="messages" class="messages">
        ${state.messages.map(m => `
          <article class="${m.role}">
            ${m.role === 'assistant' ? renderMarkdown(m.text) : esc(m.text)}
          </article>
        `).join('') || `
          <div class="empty">
            <div class="empty-icon">${icon('sparkles', 22)}</div>
            <h2>准备就绪</h2>
            <p>在此输入业务需求、评审反馈或在左侧关联项目；AI 将自动结合真实项目资料库生成结构化 PRD 与画板卡片。</p>
          </div>
        `}
      </div>
      <form id="composer">
        <textarea id="text" ${sending ? 'disabled' : ''} placeholder="描述需求或改动要求...（输入 @ 引用画板卡片）">${esc(draft)}</textarea>
        <div class="composer-toolbar">
          <div class="composer-hints">
            <span>${icon('paperclip', 13)} 工作区资料已挂载</span>
          </div>
          <button class="btn-send" ${sending ? 'disabled' : ''} aria-label="发送消息">
            ${sending ? icon('refresh', 14) : icon('send', 14)}
          </button>
        </div>
      </form>
    </main>

    <section class="canvas">
      <div class="canvas-head">
        <div class="canvas-title-wrap">
          <b>PM 画板</b>
          <span>${esc(state.projectPath || '未关联项目')}</span>
        </div>
      </div>
      <div id="board" class="board" style="transform:translate(${pan.x}px,${pan.y}px) scale(${scale})">
        ${state.cards.map(raw => {
          const c = cardData(raw);
          const badge = c.skillLabel || c.skill ? `<span class="card-agent-badge">${esc(c.skillLabel || c.skill)}</span>` : '';
          return `
            <article class="card" data-id="${esc(c.id)}" style="left:${c.x}px;top:${c.y}px">
              <header>
                <div class="card-title-group">
                  <span class="card-icon">${c.icon ? esc(c.icon) : icon('file-text', 14)}</span>
                  <b>${esc(c.title)}</b>
                  ${badge}
                </div>
                <button class="card-close-btn" data-close="${esc(c.id)}" aria-label="关闭卡片">${icon('x', 14)}</button>
              </header>
              <div class="card-body" contenteditable="true" spellcheck="false">${renderMarkdown(c.body)}</div>
              <footer>
                <button data-action="preview" data-id="${esc(c.id)}">${icon('eye', 13)} 预览</button>
                <button data-action="edit" data-id="${esc(c.id)}">${icon('edit', 13)} 就地编辑</button>
                <button data-action="sync" data-id="${esc(c.id)}">${icon('refresh', 13)} 引用修改</button>
              </footer>
            </article>
          `;
        }).join('')}
      </div>
      <div class="zoom">
        <button data-zoom="-" aria-label="缩小">−</button>
        <input id="zoom" type="range" min=".5" max="1.5" step=".05" value="${scale}" aria-label="画布缩放">
        <button data-zoom="+" aria-label="放大">＋</button>
        <b>${Math.round(scale * 100)}%</b>
        <button data-fit>${icon('maximize', 12)} 适合</button>
      </div>
    </section>
  `;

  const picker = document.createElement('input');
  picker.id = 'project-picker';
  picker.type = 'file';
  picker.webkitdirectory = true;
  picker.multiple = false;
  picker.hidden = true;
  app.append(picker);

  wire();
  enableCanvasEditing();
  setupLayoutControls();

  if (state.pendingQuestion) {
    const q = state.pendingQuestion;
    state.pendingQuestion = null;
    showQuestion(q);
  }
  if (draft) {
    const textarea = document.querySelector('#text');
    textarea.focus();
    textarea.setSelectionRange(draft.length, draft.length);
  }
}

function setupLayoutControls() {
  const root = document.querySelector('#app');
  if (!root || root.querySelector('.layout-splitter')) return;

  const saved = JSON.parse(localStorage.getItem('pm-layout') || '{}');
  if (saved.columns) root.style.gridTemplateColumns = saved.columns;

  const left = document.querySelector('.left');
  const toggle = document.createElement('button');
  toggle.className = 'collapse-sidebar';
  toggle.innerHTML = icon('panel-left', 14);
  toggle.title = '收起侧边栏';

  const sidebarHeader = left?.querySelector('.sidebar-header');
  sidebarHeader?.append(toggle);

  if (saved.collapsed) {
    root.classList.add('sidebar-collapsed');
  }
  const chatToggle = document.createElement('button');
  chatToggle.className = 'chat-visibility-toggle';
  chatToggle.textContent = saved.chatHidden ? '显示对话' : '隐藏对话';
  chatToggle.title = '切换中间对话栏';
  left?.append(chatToggle);
  if (saved.chatHidden) root.classList.add('chat-hidden');
  chatToggle.onclick = () => { const hidden = root.classList.toggle('chat-hidden'); chatToggle.textContent = hidden ? '显示对话' : '隐藏对话'; localStorage.setItem('pm-layout', JSON.stringify({ ...saved, chatHidden: hidden })); };

  toggle.onclick = () => {
    root.classList.toggle('sidebar-collapsed');
    const collapsed = root.classList.contains('sidebar-collapsed');
    toggle.title = collapsed ? '展开侧边栏' : '收起侧边栏';
    localStorage.setItem('pm-layout', JSON.stringify({ ...saved, collapsed }));
  };

  const makeSplitter = index => {
    const splitter = document.createElement('div');
    splitter.className = 'layout-splitter';
    splitter.dataset.index = index;
    root.insertBefore(splitter, root.children[index + 1]);

    let startX = 0, startColumns = '';
    splitter.onpointerdown = event => {
      startX = event.clientX;
      startColumns = getComputedStyle(root).gridTemplateColumns;
      splitter.setPointerCapture(event.pointerId);
      splitter.onpointermove = move => {
        const columns = startColumns.split(' ');
        const delta = move.clientX - startX;
        const first = Math.max(index === 0 ? 180 : 320, parseFloat(columns[index]) + delta);
        const second = Math.max(index === 0 ? 320 : 280, parseFloat(columns[index + 1]) - delta);
        columns[index] = `${first}px`;
        columns[index + 1] = `${second}px`;
        root.style.gridTemplateColumns = columns.join(' ');
      };
      splitter.onpointerup = () => {
        splitter.onpointermove = null;
        localStorage.setItem('pm-layout', JSON.stringify({
          columns: root.style.gridTemplateColumns,
          collapsed: root.classList.contains('sidebar-collapsed')
        }));
      };
    };
  };

  makeSplitter(0);
  makeSplitter(2);

  const updateSplitterPositions = () => {
    document.querySelectorAll('.layout-splitter').forEach((splitter, i) => {
      const anchor = i === 0 ? root.children[0] : root.children[2];
      if (anchor) splitter.style.left = `${anchor.offsetLeft + anchor.offsetWidth}px`;
    });
  };
  updateSplitterPositions();
  window.addEventListener('resize', updateSplitterPositions);
}

function enableCanvasEditing() {
  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    const body = card.querySelector('.card-body');
    const item = state.cards.find(c => c.id === id);
    if (!body || !item) return;

    body.title = '可直接编辑，修改后自动保存';
    body.addEventListener('input', () => {
      item.body = body.innerText;
      clearTimeout(body.saveTimer);
      body.saveTimer = setTimeout(persistCards, 600);
    });

    const preview = card.querySelector('[data-action="preview"]');
    preview?.addEventListener('click', () => {
      const isEditing = body.contentEditable === 'true';
      body.contentEditable = isEditing ? 'false' : 'true';
      if (isEditing) {
        body.innerHTML = renderMarkdown(item.body);
        preview.innerHTML = `${icon('edit', 13)} 编辑`;
      } else {
        body.innerText = item.body;
        preview.innerHTML = `${icon('eye', 13)} 预览`;
      }
    });

    const sync = card.querySelector('[data-action="sync"]');
    sync?.addEventListener('click', () => {
      const input = document.querySelector('#text');
      if (!input) return;
      input.value = `@${item.title} 请结合画板内容继续推演优化：`;
      input.focus();
    });
  });

  const input = document.querySelector('#text');
  input?.addEventListener('input', () => {
    input.title = /@[\u4e00-\u9fff\w]/.test(input.value) ? '已引用画板卡片，按自然语言继续发起指令' : '';
  });
}

async function persistCards() {
  try {
    await request('/api/cards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cards: state.cards.map(cardData) })
    });
  } catch (error) {
    showError(`保存画布失败：${error.message}`);
  }
}

function wire() {
  const canvasHead = document.querySelector('.canvas-head');
  if (canvasHead && !canvasHead.querySelector('[data-cross-canvas]')) {
    const button = document.createElement('button'); button.dataset.crossCanvas = 'true'; button.className = 'cross-canvas-button'; button.textContent = '跨对话画板'; canvasHead.append(button);
    button.onclick = async () => { const cards = await (await request('/api/project/cards')).json(); const choices = cards.filter(card => card.sourceConversationId !== state.currentConversationId).slice(0, 12); if (!choices.length) return showError('同项目暂无其他对话画板'); const selected = prompt(`输入要加入的画板编号：\n${choices.map((card, index) => `${index + 1}. ${card.title}（${card.sourceConversationTitle}）`).join('\n')}`); const index = Number(selected) - 1; if (!choices[index]) return; state = await (await request('/api/project/cards/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: choices[index].id }) })).json(); render(); };
  }
  const footer = document.querySelector('.left footer');
  if (footer) {
    footer.querySelectorAll('[data-tool]').forEach(button => {
      button.addEventListener('click', () => {
        showError(`${button.textContent.trim()}：功能入口已就绪，可在对应模块下使用。`);
      });
    });
  }

  const picker = document.querySelector('#project-picker');
  const bindBtn = document.querySelector('#bind');
  if (bindBtn && picker) {
    bindBtn.onclick = () => picker.click();
    picker.addEventListener('change', async () => {
      const selected = picker.files?.[0];
      if (!selected) return;
      const path = selected.webkitRelativePath ? selected.webkitRelativePath.split('/')[0] : selected.name;
      try {
        state = await (await request('/api/bind', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path })
        })).json();
        render();
      } catch (error) {
        showError(`绑定失败：${error.message}`);
      }
    });
  }

  const canvas = document.querySelector('.canvas');
  const board = document.querySelector('#board');
  if (canvas && board) {
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      scale = Math.max(0.4, Math.min(1.8, scale * (event.deltaY < 0 ? 1.08 : 0.92)));
      board.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
      const zoom = document.querySelector('#zoom');
      if (zoom) zoom.value = scale;
      const zoomLabel = document.querySelector('.zoom b');
      if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
    }, { passive: false });

    board.addEventListener('pointerdown', event => {
      if (event.target !== board) return;
      panning = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      board.setPointerCapture(event.pointerId);
    });

    board.addEventListener('pointermove', event => {
      if (!panning) return;
      pan.x = panning.panX + event.clientX - panning.x;
      pan.y = panning.panY + event.clientY - panning.y;
      board.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
    });

    board.addEventListener('pointerup', () => { panning = null; });
  }

  const handleNewChat = async (projectPath) => {
    if (projectPath && projectPath !== state.projectPath) {
      try {
        state = await (await request('/api/bind', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: projectPath })
        })).json();
      } catch {}
    }
    try {
      const res = await request('/api/chat/new', { method: 'POST' });
      const next = await res.json();
      state = { ...state, ...next };
      render();
      const textarea = document.querySelector('#text');
      if (textarea) {
        textarea.value = '';
        textarea.focus();
      }
      showError('已开启新会话，可以开始推演新的需求。');
    } catch (err) {
      showError(`新建会话失败：${err.message}`);
    }
  };

  document.querySelectorAll('[data-new-chat]').forEach(button => {
    button.onclick = e => {
      e.stopPropagation();
      handleNewChat(button.dataset.newChat);
    };
  });
  document.querySelectorAll('[data-conversation]').forEach(button => { button.onclick = async () => { state = await (await request('/api/chat/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: button.dataset.conversation }) })).json(); render(); }; });

  const headerNewChat = document.querySelector('#btn-header-new-chat');
  if (headerNewChat) {
    headerNewChat.onclick = () => handleNewChat(state.projectPath);
  }

  document.querySelectorAll('[data-bind]').forEach(button => {
    button.onclick = () => document.querySelector('#bind').click();
  });

  document.querySelector('#composer').onsubmit = async event => {
    event.preventDefault();
    const text = document.querySelector('#text').value.trim();
    if (!text || sending) return;
    sending = true;
    state.messages.push({ role: 'user', text });
    render();

    try {
      const response = await request('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.body) throw new Error('服务端未返回消息流');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reply = '', buffer = '';

      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.type === 'question') showQuestion(data.question);
          if (data.type === 'text') reply += String(data.text || '');
          if (data.type === 'cards') state.cards = data.cards.map(cardData);
          if (data.type === 'error') throw new Error(data.message || '模型响应异常');
        }
        if (chunk.done) break;
      }
      if (reply) state.messages.push({ role: 'assistant', text: reply });
    } catch (error) {
      state.messages.push({ role: 'assistant', text: `请求失败：${error.message}` });
      showError(`发送失败：${error.message}`);
    } finally {
      sending = false;
      render();
    }
  };

  // Zoom controls
  document.querySelectorAll('[data-zoom]').forEach(b => {
    b.onclick = () => {
      scale = Math.max(0.4, Math.min(1.8, scale + (b.dataset.zoom === '+' ? 0.1 : -0.1)));
      const bEl = document.querySelector('#board');
      if (bEl) bEl.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
      const zoomInput = document.querySelector('#zoom');
      if (zoomInput) zoomInput.value = scale;
      const zoomText = document.querySelector('.zoom b');
      if (zoomText) zoomText.textContent = `${Math.round(scale * 100)}%`;
    };
  });

  const zoomSlider = document.querySelector('#zoom');
  if (zoomSlider) {
    zoomSlider.oninput = e => {
      scale = Number(e.target.value);
      const bEl = document.querySelector('#board');
      if (bEl) bEl.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
      const zoomText = document.querySelector('.zoom b');
      if (zoomText) zoomText.textContent = `${Math.round(scale * 100)}%`;
    };
  }

  const fitBtn = document.querySelector('[data-fit]');
  if (fitBtn) {
    fitBtn.onclick = () => {
      scale = 0.85;
      pan = { x: 40, y: 30 };
      const bEl = document.querySelector('#board');
      if (bEl) bEl.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
      const zoomInput = document.querySelector('#zoom');
      if (zoomInput) zoomInput.value = scale;
      const zoomText = document.querySelector('.zoom b');
      if (zoomText) zoomText.textContent = `${Math.round(scale * 100)}%`;
    };
  }

  // Card close button
  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = async () => {
      state.cards = state.cards.filter(c => c.id !== b.dataset.close);
      await persistCards();
      render();
    };
  });

  // Card dragging
  document.querySelectorAll('.card').forEach(element => {
    const header = element.querySelector('header');
    if (!header) return;

    header.onpointerdown = e => {
      if (e.target.closest('.card-close-btn')) return;
      drag = {
        element,
        id: element.dataset.id,
        dx: (e.clientX - pan.x) / scale - element.offsetLeft,
        dy: (e.clientY - pan.y) / scale - element.offsetTop
      };
      element.setPointerCapture(e.pointerId);
    };

    header.onpointermove = e => {
      if (drag?.element === element) {
        const newX = position((e.clientX - pan.x) / scale - drag.dx);
        const newY = position((e.clientY - pan.y) / scale - drag.dy);
        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
      }
    };

    header.onpointerup = async () => {
      if (!drag || drag.element !== element) return;
      const c = state.cards.find(card => card.id === drag.id);
      if (c) {
        c.x = position(parseFloat(element.style.left));
        c.y = position(parseFloat(element.style.top));
        await persistCards();
      }
      drag = null;
    };
  });
}

function initLiveSync() {
  let es = null;
  const connect = () => {
    if (es) try { es.close(); } catch {}
    es = new EventSource('/api/events');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state' && data.state) {
          if (!drag && !panning && !sending) {
            const hasChanged = JSON.stringify(data.state) !== JSON.stringify(state);
            if (hasChanged) {
              state = data.state;
              render();
            }
          }
        }
      } catch {}
    };
    es.onerror = () => {
      try { es.close(); } catch {}
      setTimeout(connect, 3000);
    };
  };
  connect();

  window.addEventListener('focus', () => {
    fetch('/api/state')
      .then(r => r.json())
      .then(next => {
        if (!drag && !panning && !sending) {
          const hasChanged = JSON.stringify(next) !== JSON.stringify(state);
          if (hasChanged) {
            state = next;
            render();
          }
        }
      })
      .catch(() => {});
  });
}

fetch('/api/state')
  .then(r => r.json())
  .then(next => {
    state = next;
    render();
    initLiveSync();
  })
  .catch(e => showError(`加载数据失败：${e.message}`));
