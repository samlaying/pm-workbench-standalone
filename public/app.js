const app = document.querySelector('#app');
let state = { projects: [], messages: [], cards: [] }, scale = 1, pan = { x: 0, y: 0 }, drag = null, panning = null, sending = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const position = value => Number.isFinite(Number(value)) ? Math.max(-2000, Math.min(5000, Number(value))) : 0;
const cardData = card => ({ ...card, x: position(card.x), y: position(card.y), title: String(card.title || '未命名卡片'), body: String(card.body || '') });
function showError(message) { const error = document.createElement('div'); error.className = 'error'; error.textContent = message; app.append(error); setTimeout(() => error.remove(), 6000); }
function showQuestion(question) {
  state.pendingQuestion = question;
  document.querySelector('.question-card')?.remove();
  const card = document.createElement('div'); card.className = 'question-card';
  card.innerHTML = `<b>需要确认</b><p>${esc(question.question)}</p><div>${question.options.map(option => `<button data-answer="${esc(option.id)}"><strong>${esc(option.label)}</strong><small>${esc(option.description || '')}</small></button>`).join('')}</div>`;
  document.querySelector('.chat')?.append(card);
  card.querySelectorAll('[data-answer]').forEach(button => button.onclick = async () => { card.remove(); const response = await request('/api/workflow/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: button.dataset.answer }) }); const result = await response.json(); state = { ...state, ...result, workflow: result.workflow }; render(); });
}
async function request(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`请求失败（${response.status}）`); return response; }
function render() {
  const draft = document.querySelector('#text')?.value || '';
  app.innerHTML = `<aside class="left"><h1>PM Workbench</h1><input id="search" placeholder="⌕  搜索项目 / 需求 / 人"><h3>活跃项目</h3>${state.projects.map(p => `<section class="project"><b>▰ ${esc(p.name)}</b><button data-bind="${esc(p.path)}">画布</button><div>▾ 需求点</div><div>　V1 范围定义</div><div>　多模型路由</div><div>▾ 人物</div><div>　王总（产品VP）</div><div>　Lucy（算法）</div><div>▾ 文档</div><div>　PRD V1</div><div>　评审纪要0901</div><div>▾ 会议</div><div>　09-05 周会</div></section>`).join('') || '<p class="muted">绑定一个项目文件夹后，资料会出现在这里。</p>'}<button id="bind">＋ 绑定项目文件夹</button><footer>🏷 内部术语表<br>◌ 跨项目工作记录<br>⚙ Studio 偏好设置<br>◌ 能力画像</footer></aside><main class="chat"><header><strong>探索未至之境</strong><span>PM Workbench</span></header><div id="messages" class="messages">${state.messages.map(m => `<article class="${m.role}">${esc(m.text)}</article>`).join('') || '<div class="empty"><div class="whale">◒</div><h2>探索未至之境</h2><p>绑定项目后，思路、模板、文档和记忆会出现在右侧无限画布。</p></div>'}</div><form id="composer"><textarea id="text" ${sending ? 'disabled' : ''} placeholder="描述你想要构建的内容... / 调用指令 @ 文件或对话">${esc(draft)}</textarea><div><span>＋　📎　工作区内修改</span><button ${sending ? 'disabled' : ''}>${sending ? '…' : '↑'}</button></div></form></main><section class="canvas"><div class="canvas-head"><b>PM 画板</b><span>${esc(state.projectPath || '绑定项目以加载画布')}</span></div><div id="board" class="board" style="transform:scale(${scale})">${state.cards.map(raw => { const c = cardData(raw); return `<article class="card" data-id="${esc(c.id)}" style="left:${c.x}px;top:${c.y}px"><header>${esc(c.icon || '▧')}　<b>${esc(c.title)}</b><button data-close="${esc(c.id)}" aria-label="关闭卡片">×</button></header><p>${esc(c.body)}</p><footer><button data-action="preview" data-id="${esc(c.id)}">预览</button><button data-action="edit" data-id="${esc(c.id)}">修改此文件</button><button data-action="sync" data-id="${esc(c.id)}">同步生成</button></footer></article>`; }).join('')}</div><div class="zoom"><button data-zoom="-">−</button><input id="zoom" type="range" min=".5" max="1.5" step=".1" value="${scale}" aria-label="画布缩放"><button data-zoom="+">＋</button><b>${Math.round(scale * 100)}%</b><button data-fit>⊞ 适合</button></div></section>`;
  const picker = document.createElement('input');
  picker.id = 'project-picker'; picker.type = 'file'; picker.webkitdirectory = true; picker.multiple = false; picker.hidden = true;
  app.append(picker);
  wire();
  enableCanvasEditing();
  setupLayoutControls();
  if (state.pendingQuestion) { const question = state.pendingQuestion; state.pendingQuestion = null; showQuestion(question); }
  if (draft) { const textarea = document.querySelector('#text'); textarea.focus(); textarea.setSelectionRange(draft.length, draft.length); }
}
function setupLayoutControls() {
  const root = document.querySelector('#app');
  if (!root || root.querySelector('.layout-splitter')) return;
  const saved = JSON.parse(localStorage.getItem('pm-layout') || '{}');
  if (saved.columns) root.style.gridTemplateColumns = saved.columns;
  const left = document.querySelector('.left');
  const toggle = document.createElement('button'); toggle.className = 'collapse-sidebar'; toggle.textContent = '‹'; toggle.title = '收起侧边栏';
  left?.prepend(toggle);
  if (left) { const header = document.createElement('div'); header.className = 'sidebar-header'; left.insertBefore(header, left.children[1]); header.append(left.querySelector('h1'), toggle); }
  if (saved.collapsed) { root.classList.add('sidebar-collapsed'); toggle.textContent = '›'; }
  toggle.onclick = () => { root.classList.toggle('sidebar-collapsed'); const collapsed = root.classList.contains('sidebar-collapsed'); toggle.textContent = collapsed ? '›' : '‹'; toggle.title = collapsed ? '展开侧边栏' : '收起侧边栏'; localStorage.setItem('pm-layout', JSON.stringify({ ...saved, collapsed })); };
  const makeSplitter = (index) => { const splitter = document.createElement('div'); splitter.className = 'layout-splitter'; splitter.dataset.index = index; root.insertBefore(splitter, root.children[index + 1]); let startX = 0, startColumns = ''; splitter.onpointerdown = event => { startX = event.clientX; startColumns = getComputedStyle(root).gridTemplateColumns; splitter.setPointerCapture(event.pointerId); splitter.onpointermove = move => { const columns = startColumns.split(' '); const delta = move.clientX - startX; const first = Math.max(index === 0 ? 180 : 300, parseFloat(columns[index]) + delta); const second = Math.max(index === 0 ? 300 : 260, parseFloat(columns[index + 1]) - delta); columns[index] = `${first}px`; columns[index + 1] = `${second}px`; root.style.gridTemplateColumns = columns.join(' '); }; splitter.onpointerup = () => { splitter.onpointermove = null; localStorage.setItem('pm-layout', JSON.stringify({ columns: root.style.gridTemplateColumns, collapsed: root.classList.contains('sidebar-collapsed') })); }; }; };
  makeSplitter(0); makeSplitter(2);
  document.querySelectorAll('.layout-splitter').forEach((splitter, i) => { const anchor = i === 0 ? root.children[0] : root.children[2]; splitter.style.left = `${anchor.offsetLeft + anchor.offsetWidth}px`; });
}
function enableCanvasEditing() {
  document.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;
    const body = card.querySelector('p');
    const item = state.cards.find(c => c.id === id);
    if (!body || !item) return;
    body.contentEditable = 'true';
    body.spellcheck = true;
    body.title = '可直接编辑，修改后自动保存';
    body.addEventListener('input', () => { item.body = body.textContent; clearTimeout(body.saveTimer); body.saveTimer = setTimeout(persistCards, 500); });
    const preview = card.querySelector('[data-action="preview"]');
    preview?.addEventListener('click', () => { body.contentEditable = body.contentEditable !== 'true'; preview.textContent = body.contentEditable === 'true' ? '预览' : '编辑'; });
    const sync = card.querySelector('[data-action="sync"]');
    sync?.addEventListener('click', () => { const input = document.querySelector('#text'); if (!input) return; input.value = `@${item.title} 请根据画板内容继续修改：`; input.focus(); });
  });
  const input = document.querySelector('#text');
  input?.addEventListener('input', () => { input.title = /@[\u4e00-\u9fff\w]/.test(input.value) ? '已引用画板内容，可用自然语言描述修改要求' : ''; });
}
async function persistCards() { try { await request('/api/cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cards: state.cards.map(cardData) }) }); } catch (error) { showError(`保存画布失败：${error.message}`); } }
function wire() {
  const footer = document.querySelector('.left footer');
  if (footer) {
    footer.innerHTML = '<button data-tool="terms">🏷 内部术语表</button><button data-tool="cross-project">◌ 跨项目工作记录</button><button data-tool="settings">⚙ Studio 偏好设置</button><button data-tool="profile">◌ 能力画像</button>';
    footer.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => showError(`${button.textContent.trim()}：功能入口已就绪，后续将在对应工作区打开。`)));
  }
  const picker = document.querySelector('#project-picker');
  document.querySelector('#bind').onclick = () => picker?.click();
  picker?.addEventListener('change', async () => {
    const selected = picker.files?.[0];
    if (!selected) return;
    const path = selected.webkitRelativePath ? selected.webkitRelativePath.split('/')[0] : selected.name;
    try { state = await (await request('/api/bind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) })).json(); render(); }
    catch (error) { showError(`绑定失败：${error.message}`); }
  });
  const canvas = document.querySelector('.canvas');
  const board = document.querySelector('#board');
  if (canvas && board) {
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      scale = Math.max(.5, Math.min(1.5, scale * (event.deltaY < 0 ? 1.1 : .9)));
      board.style.transform = `scale(${scale})`;
      const zoom = document.querySelector('#zoom'); if (zoom) zoom.value = scale;
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
  document.querySelectorAll('[data-bind]').forEach(button => { button.onclick = () => document.querySelector('#bind').click(); });
  document.querySelector('#composer').onsubmit = async event => { event.preventDefault(); const text = document.querySelector('#text').value.trim(); if (!text || sending) return; sending = true; state.messages.push({ role: 'user', text }); render(); try { const response = await request('/api/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); if (!response.body) throw new Error('服务端没有返回消息流'); const reader = response.body.getReader(), decoder = new TextDecoder(); let reply = '', buffer = ''; while (true) { const chunk = await reader.read(); buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done }); const lines = buffer.split('\n'); buffer = lines.pop() || ''; for (const line of lines) { if (!line.startsWith('data: ')) continue; let data; try { data = JSON.parse(line.slice(6)); } catch { continue; } if (data.type === 'question') showQuestion(data.question); if (data.type === 'text') reply += String(data.text || ''); if (data.type === 'cards') state.cards = data.cards.map(cardData); if (data.type === 'error') throw new Error(data.message || '模型服务失败'); } if (chunk.done) break; } if (reply) state.messages.push({ role: 'assistant', text: reply }); } catch (error) { state.messages.push({ role: 'assistant', text: `请求失败：${error.message}` }); showError(`发送失败：${error.message}`); } finally { sending = false; render(); } };
  document.querySelectorAll('[data-zoom]').forEach(b => { b.onclick = () => { scale = Math.max(.5, Math.min(1.5, scale + (b.dataset.zoom === '+' ? .1 : -.1))); render(); }; }); document.querySelector('#zoom').oninput = e => { scale = Number(e.target.value); render(); }; document.querySelector('[data-fit]').onclick = () => { scale = .8; render(); };
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = async () => { state.cards = state.cards.filter(c => c.id !== b.dataset.close); await persistCards(); render(); }; }); document.querySelectorAll('[data-action]').forEach(b => { b.onclick = () => showError(`${b.dataset.action === 'preview' ? '预览' : b.dataset.action === 'edit' ? '修改此文件' : '同步生成'}功能将在连接项目文件后执行。`); });
  document.querySelectorAll('.card').forEach(element => { element.onpointerdown = e => { drag = { element, id: element.dataset.id, dx: e.clientX - element.offsetLeft, dy: e.clientY - element.offsetTop }; element.setPointerCapture(e.pointerId); }; element.onpointermove = e => { if (drag?.element === element) { element.style.left = `${position(e.clientX - drag.dx)}px`; element.style.top = `${position(e.clientY - drag.dy)}px`; } }; element.onpointerup = async () => { if (!drag || drag.element !== element) return; const c = state.cards.find(card => card.id === drag.id); if (c) { c.x = position(parseFloat(element.style.left)); c.y = position(parseFloat(element.style.top)); await persistCards(); } drag = null; }; });
}
fetch('/api/state').then(r => r.json()).then(next => { state = next; render(); }).catch(e => showError(`加载失败：${e.message}`));
