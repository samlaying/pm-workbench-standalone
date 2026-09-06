# Phase 4：飞书上传

## 触发

- 用户要求上传、同步、发飞书。
- Phase 3 评审稿确认后，需要生成可评审链接。

## 依赖

- `lark-cli`
- 飞书 skills：`lark-doc`、`lark-drive`、`lark-whiteboard`、`lark-wiki`

## 动作

1. 通过结构化确认来确认上传文件、目标文件夹、同名文档处理方式。
2. 读取 `prd-visual-format.md` 和 `../lark-docx-formatting.md`。
3. 将 Markdown 转成飞书 DocxXML。
4. 文档中新建或更新白板占位，按图表类型渲染：
   - Mermaid：时序图、状态图、简单流程图、甘特图、饼图。
   - DSL：复杂流程图、泳道图、架构/协作/对比/时间线。
   - SVG：高设计感或自定义视觉需求。
5. 创建或更新飞书文档。
6. 将 `document_id`、飞书链接、上传时间写回 `项目上下文.md` 和过程记录。

## 常用命令示例

```bash
lark-cli docs +create --api-version v2 \
  --parent-token <folder_token> \
  --title "<文档标题>" \
  --content '<DocxXML 内容>'

lark-cli docs +update --api-version v2 \
  --doc-id <document_id> \
  --action overwrite \
  --content '<DocxXML 内容>'
```

## 输出

| 本地文件 | 飞书标题 | 飞书链接 | 白板渲染 | 状态 |
|----------|----------|----------|----------|------|

暂停点：必须通过结构化确认来检查飞书文档可打开、格式和图表正常。
