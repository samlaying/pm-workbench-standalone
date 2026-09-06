# 飞书云文档格式参考

## 目录

- 一、创建文档的方式
- 二、文字格式语法
- 三、块级样式
- 四、完整示例
- 五、颜色语义速查

## 一、创建文档的方式

### 1. 原生 XML 创建（推荐，支持全部富文本样式）

```bash
lark-cli docs +create --api-version v2 \
  --content '<title>文档标题</title><h1>章节</h1><p>内容</p>'
```

- 支持加粗、背景色、字体颜色、callout、grid、表格底色等全部样式
- 创建到指定文件夹：加 `--parent-token fldcnXXXX`
- 创建到个人知识库：加 `--parent-position my_library`

### 2. 追加内容到已有文档

```bash
# 在文档末尾追加
lark-cli docs +update --api-version v2 --doc "<doc_id或URL>" \
  --command append --content '<h2>新章节</h2><p>内容</p>'

# 在指定 block 后插入
lark-cli docs +update --api-version v2 --doc "<doc_id或URL>" \
  --command block_insert_after --block-id "blkcnXXXX" --content '<p>内容</p>'

# 替换指定 block
lark-cli docs +update --api-version v2 --doc "<doc_id或URL>" \
  --command block_replace --block-id "blkcnXXXX" --content '<p>新内容</p>'
```

### 3. Markdown 导入（仅支持基础格式）

```bash
lark-cli drive +import --file ./README.md --type docx --name "文档名"
```

- 仅支持加粗、斜体、删除线、行内代码、链接、列表、表格等基础格式
- **不支持**：文字背景色、字体颜色、callout、grid、checkbox 等

### 4. 原生 Markdown 文件上传（不是 docx）

```bash
lark-cli markdown +create --file ./README.md
```

- 上传为 `.md` 文件，飞书渲染显示 Markdown 格式
- 不是在线文档 docx，不能在飞书里直接编辑富文本

### 方式选择

| 需求 | 方式 |
|------|------|
| 需要标黄/字体颜色/callout 等富文本 | `docs +create` + XML |
| 只有基础格式、已有 Markdown 源文件 | `drive +import --type docx` |
| 保持 Markdown 源文件可下载 | `markdown +create` |

---

## 二、文字格式语法

### 行内样式标签

| 标签 | 效果 | 语法 |
|------|------|------|
| `<b>` | **加粗** | `<b>文字</b>` |
| `<em>` | *斜体* | `<em>文字</em>` |
| `<del>` | ~~删除线~~ | `<del>文字</del>` |
| `<u>` | 下划线 | `<u>文字</u>` |
| `<code>` | 行内代码 | `<code>文字</code>` |

### 文字背景色（标黄等）

使用 `<span background-color="颜色名">`：

```xml
<p>普通文本，<span background-color="light-yellow">标黄文本</span>。</p>
```

**可用颜色：**

| 属性 | 支持的命名色 |
|------|------------|
| `<span background-color>` | 基础色 + `light-{色}` + `medium-gray` |
| 基础色（7色） | `red` `orange` `yellow` `green` `blue` `purple` `gray` |
| 浅色变体 | `light-red` `light-orange` `light-yellow` `light-green` `light-blue` `light-purple` |
| 其他 | `medium-gray` |

常用示例：
- 标黄：`light-yellow`
- 浅绿：`light-green`
- 浅红：`light-red`
- 灰底：`medium-gray`

### 字体颜色

使用 `<span text-color="颜色名">`：

```xml
<p><span text-color="red">红色文字</span>，<span text-color="green">绿色文字</span></p>
```

支持基础 7 色：`red` `orange` `yellow` `green` `blue` `purple` `gray`。也支持 `rgb(r,g,b)` / `rgba(r,g,b,a)`。

### 组合格式（加粗 + 标黄）

嵌套顺序（外 → 内）**必须**遵守：

```
<a> → <b> → <em> → <del> → <u> → <code> → <span> → 文本内容
```

常用组合：

```xml
<!-- 加粗 + 标黄 -->
<b><span background-color="light-yellow">加粗且标黄</span></b>

<!-- 加粗 + 红色字 -->
<b><span text-color="red">红色加粗</span></b>

<!-- 标黄 + 红色字 -->
<span background-color="light-yellow"><span text-color="red">黄底红字</span></span>

<!-- 加粗 + 标黄 + 红色字 -->
<b><span background-color="light-yellow"><span text-color="red">全部组合</span></span></b>

<!-- 链接 + 加粗 + 标黄 -->
<a href="https://example.com"><b><span background-color="light-yellow">带链接的黄底加粗</span></b></a>
```

---

## 三、块级样式

### 表格单元格背景色

```xml
<table>
  <thead><tr>
    <th background-color="light-gray">表头1</th>
    <th background-color="light-gray">表头2</th>
  </tr></thead>
  <tbody><tr>
    <td>普通单元格</td>
    <td background-color="light-yellow">标黄单元格</td>
  </tr></tbody>
</table>
```

`<th>` / `<td>` 的 `background-color` 颜色范围同 `<span background-color>`。

### 高亮框 (callout)

```xml
<callout emoji="⚠️" background-color="light-yellow" border-color="yellow">
  <p><b>注意：</b>这是重要信息。</p>
</callout>

<callout emoji="✅" background-color="light-green" border-color="green">
  <p>已完成的项目。</p>
</callout>
```

- `emoji`：常用 💡✅❌⚠️📝❓❗👍❤️📌🏁⭐
- `background-color`：`gray` + `light-{色}` + `medium-{色}`
- `border-color`：基础 7 色
- `text-color`：基础 7 色
- 子块仅支持文本、标题、列表、待办、引用

### 对齐

`align` 属性适用于 `p` / `h1-h9` / `li` / `checkbox`：

```xml
<p align="center">居中文本</p>
<p align="right">右对齐文本</p>
```

---

## 四、完整示例

```xml
<title>格式演示文档</title>

<h1>行内样式</h1>
<p>普通文本，<b>加粗</b>，<span background-color="light-yellow">标黄</span>，<b><span background-color="light-yellow">加粗标黄</span></b>。</p>

<p><span background-color="light-red">红底</span> <span background-color="light-orange">橙底</span> <span background-color="light-green">绿底</span> <span background-color="light-blue">蓝底</span> <span background-color="light-purple">紫底</span></p>

<h1>列表中的格式</h1>
<ul>
  <li><b>加粗项目</b> — 说明文字</li>
  <li><span background-color="light-yellow">标黄项目</span> — 需关注</li>
  <li><b><span background-color="light-yellow">加粗标黄</span></b> — 重点关注</li>
</ul>

<h1>带格式的表格</h1>
<table>
  <thead><tr><th background-color="light-gray">字段</th><th background-color="light-gray">状态</th><th background-color="light-gray">备注</th></tr></thead>
  <tbody>
    <tr><td><b>名称</b></td><td><span background-color="light-yellow">待确认</span></td><td>优先级高</td></tr>
    <tr><td>版本</td><td><b>已完成</b></td><td><span background-color="light-green">通过</span></td></tr>
    <tr><td><b><span background-color="light-red">风险项</span></b></td><td><span background-color="light-red">阻塞</span></td><td>需立即处理</td></tr>
  </tbody>
</table>

<h1>高亮框</h1>
<callout emoji="⚠️" background-color="light-yellow" border-color="yellow">
  <p><b>注意：</b>这是需要特别关注的信息。</p>
</callout>

<callout emoji="✅" background-color="light-green" border-color="green">
  <p>已完成的事项用绿色框。</p>
</callout>
```

---

## 五、颜色语义速查

| 语义 | 背景色 | 适用场景 |
|------|--------|---------|
| 重点/需关注 | `light-yellow` | 需要确认、待处理、待审核 |
| 成功/通过 | `light-green` | 已完成、已通过、正常 |
| 风险/阻塞/紧急 | `light-red` | 阻塞、紧急、高风险 |
| 提示/补充 | `light-blue` | 备注、补充说明 |
| 次要/中性 | `medium-gray` | 废弃、可选、低优先级 |
| 警告/注意 | `light-orange` | 有风险但非阻塞 |
| 信息/引用 | `light-purple` | 参考信息、外部依赖 |
