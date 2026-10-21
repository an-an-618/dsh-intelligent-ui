/**
 * Intelligent UI v4 — model-facing text.
 *
 * Two exports:
 *  - `toolDescriptions(language)` feeds the `description` of both tools;
 *  - `buildPromptSection({ language })` is the §9 system-prompt section
 *    (name `intelligent-ui`, order 2400) that teaches the spec structure, the
 *    recursive node tree, the control/container catalogs, the expression
 *    grammar, inline rich-text markup, list templates, scatter/heatmap and the
 *    image allow-list, one complete example and the common mistakes.
 *
 * Never put a double-brace sequence in this text. DSH treats system-prompt
 * sections as templates (double-brace name = variable) and fails every turn on
 * any other double-brace content; expressions are therefore taught as `{= … }`.
 *
 * The catalogs are derived from `lib/catalog.js`, so adding a kind there does
 * not silently leave the prompt behind.
 *
 * @module intelligent-ui/lib/prompt
 */

import { CHART_KINDS, CONTROL_KINDS, KINDS, LIMITS, TONES } from './catalog.js'

/** Prompt section identity required by `ctx.systemPrompt.section()`. */
export const SECTION_NAME = 'intelligent-ui'
/** Section order: after the core tool instructions, before project context. */
export const SECTION_ORDER = 2400

const TONE_LIST = TONES.join('|')

/** One catalog line for one kind; containers also list their nested keys. */
function kindLine(kind, language) {
  const descriptor = CONTROL_KINDS[kind]
  if (kind === 'chart') {
    return language === 'en'
      ? `- chart: chart(${CHART_KINDS.join('|')}), categories+series (cartesian/pie/donut), series.points (scatter), categories+rows (heatmap), height, valueFormat`
      : `- chart: chart(${CHART_KINDS.join('|')})，categories+series（直角/饼图）、series.points（scatter）、categories+rows（heatmap）、height、valueFormat`
  }
  const parts = Object.keys(descriptor.fields)
  if (descriptor.list !== undefined) {
    parts.push(`items(${LIMITS.listItems.min}-${LIMITS.listItems.max})`, 'template(1 node)')
  }
  if (descriptor.children !== undefined) {
    parts.push(`${descriptor.children.key}(${descriptor.children.min === LIMITS.children.min && descriptor.children.max === LIMITS.children.max ? '1-20' : `${descriptor.children.min}-${descriptor.children.max}`})`)
  }
  if (descriptor.branches !== undefined) {
    parts.push(`${descriptor.branches.key}(${descriptor.branches.count.min}-${descriptor.branches.count.max})`)
  }
  const detail = parts.length === 0 ? (language === 'en' ? 'no extra fields' : '无额外字段') : parts.join(', ')
  return `- ${kind}: ${detail}`
}

/** Leaf control catalog, generated from the catalog (containers excluded). */
function controlCatalogLines(language) {
  return KINDS.filter((kind) => CONTROL_KINDS[kind].container !== true)
    .map((kind) => kindLine(kind, language))
    .join('\n')
}

/** Container catalog, generated from the catalog. */
function containerCatalogLines(language) {
  return KINDS.filter((kind) => CONTROL_KINDS[kind].container === true)
    .map((kind) => kindLine(kind, language))
    .join('\n')
}

const CONTROL_NOTES_ZH = [
  '- 交互控件必须带 `id`（1–40 字符，正则 `^[a-zA-Z_][a-zA-Z0-9_]*$`，整棵树唯一），它同时是提交字段名。',
  '- 非交互控件和容器**不能**带 `id`；未声明的字段会直接报错。',
  '- 任意节点可带 `visibleWhen`（不带 `{= }` 的表达式）；容器被隐藏时整个子树不渲染。',
  '- `required` 只用于交互控件：`input`/`textarea` 要求非空，`switch`/`checkbox` 要求为 true；`select`/`radio`/`slider`/`number`/`choice` 始终满足。',
  '- slider 必填 min/max（step 默认 1，initial 须在区间内）；progress.value 为 0–100；textarea.rows 为 2–8。',
  '- `table.columns` / `chart.categories` 是纯字符串数组；`table.rows` 每格是 RichText。',
  '- `chart.series[].values` 每项是数字或 `{= 表达式 }` 字符串，例如 `"values": [12, 18, "{= seats * 2}"]`；字符串项随本地状态重算，长度必须等于 categories。',
  '- `chart.chart` 可选 ' + '`' + CHART_KINDS.join('`/`') + '`' + '；pie 与 donut 只用第一个 series 的 values 对应 categories。给 bar/line/area/pie/donut 加 `id`（可带 label/select/initial/required）即可点击选择 category：initial 须属 categories，required 依赖 id；scatter/heatmap 禁带 id。tooltip 由 Client 渲染，Host 无字段。',
  '- `chart` 的 scatter 用 `series[].points: [{ x, y }]`（每系列 1–200 点，不能带 categories/values）；heatmap 用 `categories`（1–24）与 `rows: [{ label, values }]`（1–12 行，长度等于 categories）；其他图表用 categories+series。',
  '- `list` 容器按数组重复渲染：`items` 1–50 个对象（值只能是字符串/数字/布尔），`itemName` 默认 `item`，`template` 是一个节点。模板最多放 1 个交互控件（id 只在本模板生效，不参与全树交互、外部表达式不能引用，也不得与外部 id 重名；仍禁嵌套 list）；可选 `itemLabel` 指定每项标签字段（缺省第一个字符串字段，否则用序号）；每项初值可由同名 item 字段覆盖控件 initial，required 逐项校验；提交行形如 `- <itemLabel> / <控件 label>: <value>`。模板 RichText/visibleWhen 可用 `itemName.field`（一级，字段须在 items 键里）。',
  '- `image.src` 默认仅 https（部署可放开 http），可能有 imageHosts 主机白名单（精确/子域）；localhost/.local/私有/回环永远拒绝。`link.href` 仅需 http(s)，≤2048。',
  '- `keyValue.items` 是 `{ label, value }`；`steps.items` 是 `{ label, description?, state?: done|current|pending }`；`choice.options` 是 `{ value, label, description? }`，提交选中项的 value。',
  '- 所有 RichText 的字面文字支持内联标记：`**粗体**`、`*斜体*`、反引号包裹的 `代码`、`[文字](https://example.com)`；链接只接受 http/https（≤2048），不合法时按字面显示，不解释 HTML。',
  '- `stepper` 提交数字（默认 0/100/1）；`rating` 提交星数（默认 max 5，required≥1 星）；`checklist` 的 initial/提交值都是逗号分隔字符串，取值须为 options 的 value，required≥1 项。',
  '- `codeblock.code` 是纯文本（1–4000 字符，不解释 HTML），可带 language/title；`quote` 是 text + 可选 cite；`timeline.items` 每项 `{ label, description?, time?, state? }`；`sparkline.values` 2–32 项（数字或 `{= 表达式 }` 字符串），随本地状态重算，height 默认 40。',
  '- callout.tone / badge.tone / sparkline.tone 可选值：' + TONE_LIST + '。',
]

const CONTROL_NOTES_EN = [
  '- Interactive controls require `id` (1–40 chars, `^[a-zA-Z_][a-zA-Z0-9_]*$`, unique across the whole tree); it is also the submitted field name.',
  '- Non-interactive controls and containers must **not** carry `id`; undeclared fields fail compilation.',
  '- Any node may carry `visibleWhen` (an expression without `{= }`); hiding a container hides its whole subtree.',
  '- `required` applies to interactive controls only: `input`/`textarea` must be non-empty, `switch`/`checkbox` must be true; `select`/`radio`/`slider`/`number`/`choice` always qualify.',
  '- slider requires min/max (step defaults to 1, initial must be inside the range); progress.value is 0–100; textarea.rows is 2–8.',
  '- `table.columns` / `chart.categories` are plain string arrays; every `table.rows` cell is RichText.',
  '- `chart.series[].values` items are numbers or `{= expression }` strings, e.g. `"values": [12, 18, "{= seats * 2}"]`; string items recompute from local state and the length must equal categories.',
  '- `chart.chart` accepts ' + '`' + CHART_KINDS.join('`/`') + '`' + '; pie and donut use the first series values against categories. Add `id` (plus optional label/select/initial/required) to bar/line/area/pie/donut to make categories clickable: initial must be a category, required needs an id, and scatter/heatmap reject ids. Tooltips are client-rendered; the Host adds no field.',
  '- `chart` scatter uses `series[].points: [{ x, y }]` (1–200 finite points per series; no categories/values); heatmap uses `categories` (1–24) and `rows: [{ label, values }]` (1–12 rows whose values length equals categories); other charts use categories+series.',
  '- `list` repeats a template over `items` (1–50 objects whose values are strings/numbers/booleans); `itemName` defaults to `item`; `template` is exactly one node. A template may hold at most one interactive control (its id is template-local: it is not part of the card-wide interactions, external expressions cannot reference it, and it must not collide with an external id; nested lists are still rejected); optional `itemLabel` names the per-item label field (default: first string field, otherwise the index); a per-item initial comes from a same-named item field when present, otherwise the control initial; required is checked per item; submission lines look like `- <itemLabel> / <control label>: <value>`. Template RichText and visibleWhen may reference `itemName.field` (one level only, fields must appear in the items keys).',
  '- `image.src` is https-only by default (a deployment may allow http via allowHttpImages) and may be restricted by an imageHosts allow-list (exact host or subdomain); localhost, .local and private/loopback addresses are always rejected. `link.href` still only needs http(s), up to 2048 chars.',
  '- `keyValue.items` is `{ label, value }`; `steps.items` is `{ label, description?, state?: done|current|pending }`; `choice.options` is `{ value, label, description? }` and submits the selected value.',
  '- Literal RichText supports inline markup: `**bold**`, `*italic*`, backtick-wrapped `code`, `[text](https://example.com)`; links must be http/https (≤2048), invalid ones render literally, and HTML is never interpreted.',
  '- `stepper` submits a number (min/max/step default 0/100/1); `rating` submits 0..max stars (default max 5; required means at least 1); `checklist` initial and submitted values are comma-separated strings using option values, and required means at least one selection.',
  '- `codeblock.code` is plain text (1–4000 chars, HTML not interpreted) with optional language/title; `quote` has text plus optional cite; `timeline.items` entries are `{ label, description?, time?, state? }`; `sparkline.values` has 2–32 items, each a number or `{= expression }` string (same as chart values), recomputed from local state; height defaults to 40.',
  '- callout.tone / badge.tone / sparkline.tone accept: ' + TONE_LIST + '.',
]

function notes(language) {
  return (language === 'en' ? CONTROL_NOTES_EN : CONTROL_NOTES_ZH).join('\n')
}

function zhPolicy(outputPolicy) {
  return outputPolicy === 'balanced'
    ? '默认优先用于结构化回答：对比、参数选择、表格、图表、步骤或可调参数都先考虑卡片；纯文字足够时才直接回答。'
    : '**输出策略（应出尽出）**：只要回答包含并列信息、参数、步骤、对比、数据、表格、图表、代码或可调选择，就直接用卡片，不要用 Markdown 表格、长列表或散文罗列代替；一句话事实或闲聊才用纯文字，拿不准时也默认卡片。卡片已经包含文字说明，卡片后不要再重复长段散文。'
}

function enPolicy(outputPolicy) {
  return outputPolicy === 'balanced'
    ? 'Prefer these tools for structured answers: comparisons, parameter choices, tables, charts, steps, or adjustable values should start as a card; answer directly only when plain prose is enough.'
    : '**Output policy (cards by default, exhaustively)**: whenever an answer contains parallel items, parameters, steps, comparisons, data, tables, charts, code, or adjustable choices, use a card directly instead of Markdown tables, long lists, or prose enumeration; reply in plain text only for a one-line fact or casual chat, and default to a card when unsure. The card already carries the explanation, so do not repeat a long prose section after it.'
}

function zhSection(outputPolicy = 'cards-first') {
  return `## Intelligent UI（模型生成界面）

你有两个把可交互界面放进对话的工具，别再用散文罗列参数：

- **render_ui**：交付卡。展示信息、表格、图表、图片或可拖动参数预览；没有提交按钮，交互只驱动卡片内部文字和图表。调用后停下。
- **ask_with_ui**：提问卡。用户需要确认、选择或填写参数时用；提交后你会收到一条以 \`[Intelligent UI]\` 开头的用户消息，逐行列字段值，可能带 \`note: ...\`。
${zhPolicy(outputPolicy)}

### spec 结构

\`\`\`json
{ "title": "标题", "description": "可选说明", "state": { "seats": 8 }, "controls": [ ... ] }
\`\`\`

- \`title\` 必填纯文本 1–${LIMITS.title.max} 字符；\`description\` 可选 0–${LIMITS.description.max} 字符，支持表达式；\`state\` 可选，给交互控件设初值（键为交互 id，值限字符串/数字/布尔，控件 \`initial\` 优先）。
- \`controls\` 必填 ${LIMITS.controls.min}–${LIMITS.controls.max} 个顶层节点。节点可以是控件，也可以是布局容器；容器和控件都能再包含子节点，形成节点树。
- 嵌套层级从顶层算起最多 ${LIMITS.depth} 层；整卡节点总数 ≤${LIMITS.nodeTotal}；单个容器子节点 ${LIMITS.children.min}–${LIMITS.children.max} 个；整份 spec ≤${Math.round(LIMITS.specBytes / 1024)} KiB。
- 渲染/提交顺序为深度优先：父容器先于子节点，同层按数组次序。
- RichText 字段用 \`{= 表达式 }\` 插值，其余文字原样；title/description 里单个表达式 ≤${LIMITS.shortExpression} 字符。

### source 模式（流式骨架）

两个工具都可以用 \`source\` 代替 \`spec\`，二者恰好提供一个：
- \`source\` 是同一份 spec 的紧凑 JSON 文本（一个字符串）。较长、或希望用户尽早看到反馈的卡片优先用它。
- Client 用已流出的 source 文本渲染只读骨架（标题/描述/进度）；settle 后工具行只显示摘要，完整交互卡由最终编译结果渲染。
- Host 严格解析 JSON（不能有注释或结尾逗号），失败会返回带 offset、行、列的错误；解析成功后与直接给 \`spec\` 的编译产物完全一致。

### 控件目录（kind: 额外字段）

${controlCatalogLines('zh')}

### 容器目录（kind: 字段；容器不能带 id）

${containerCatalogLines('zh')}

${notes('zh')}

### 表达式语法

数字（整数/小数）、\`'字符串'\` / \`"字符串"\`、\`true\` / \`false\`、交互控件 id、一元 \`!\` \`-\`、\`* / %\`、\`+ -\`、\`< <= > >=\`、\`== !=\`、\`&&\`、\`||\`、三元 \`cond ? a : b\`、括号。
没有函数调用、赋值或逗号表达式；属性访问只有列表模板里的 \`itemName.field\` 一级形式，其他位置不允许。\`+\` 在任一边为字符串时拼接；\`- * / %\` 只接受数字；除零、类型不符、未知变量得到 \`undefined\`（显示为空），不会报错。

### 完整示例（ask_with_ui）

\`\`\`json
{
  "spec": {
    "title": "Team plan estimate",
    "description": "每月约 \${= seats * 29 }（按年付 \${= seats * 29 * 12 }/年）",
    "state": { "seats": 8, "yearly": true },
    "controls": [
      { "kind": "section", "title": "席位与周期", "children": [
        { "kind": "grid", "columns": 2, "children": [
          { "kind": "slider", "id": "seats", "label": "席位数", "min": 1, "max": 50 },
          { "kind": "switch", "id": "yearly", "label": "按年付费" }
        ] },
        { "kind": "chart", "chart": "line", "categories": ["月", "年"], "series": [
          { "name": "费用", "values": ["{= seats * 29 }", "{= seats * 29 * 12 }"] }
        ] }
      ] },
      { "kind": "choice", "id": "tier", "label": "档位", "options": [
        { "value": "pro", "label": "Pro" },
        { "value": "team", "label": "Team", "description": "含专属支持" }
      ] }
    ]
  },
  "ask": { "prompt": "确认这个方案吗？", "submitLabel": "确认方案", "noteLabel": "备注", "allowNote": true }
}
\`\`\`

### 常见错误

- 容器带 id；交互控件缺 id、id 重复或含中文/连字符。
- 嵌套超过 ${LIMITS.depth} 层、整卡超过 ${LIMITS.nodeTotal} 个节点、children 超过 ${LIMITS.children.max} 个。
- 非 http(s) 的 image.src / link.href；table 行格数与 columns 不一致；chart values 数量与 categories 不一致。
- 在 title 里写 \`{= }\`；表达式引用不存在的 id；表达式里写函数调用。
- slider initial 越界；select/choice initial 不在 options 的 value 里。
- 交付卡里请求用户确认——需要确认请改用 ask_with_ui。`
}

function enSection(outputPolicy = 'cards-first') {
  return `## Intelligent UI (model-generated interfaces)

Two tools put an interactive surface into the conversation instead of describing options in prose:

- **render_ui** — a delivery card: information, tables, charts, images, and parameter previews driven by local interactions. It has **no** submit button; interactions only update the card. The card is the answer; call it and stop.
- **ask_with_ui** — a question card: use it when the user must confirm, choose, or fill parameters, and the values must come back to you. After the user submits, you receive one ordinary user message starting with \`[Intelligent UI]\`, with one line per field and an optional \`note: ...\` line.
${enPolicy(outputPolicy)}

### spec

\`\`\`json
{ "title": "Title", "description": "Optional", "state": { "seats": 8 }, "controls": [ ... ] }
\`\`\`

- \`title\` is required plain text, 1–${LIMITS.title.max} characters; \`description\` is optional, 0–${LIMITS.description.max} characters, expressions allowed; \`state\` optionally seeds interactive controls (keys are interactive ids; values are string/number/boolean; a control's own \`initial\` wins).
- \`controls\` is required, ${LIMITS.controls.min}–${LIMITS.controls.max} top-level nodes. A node is either a control or a layout container; both containers and controls may hold child nodes, forming a node tree.
- Nesting depth from the top is at most ${LIMITS.depth}; the whole card holds at most ${LIMITS.nodeTotal} nodes; one container holds ${LIMITS.children.min}–${LIMITS.children.max} child nodes; the serialized spec is at most ${Math.round(LIMITS.specBytes / 1024)} KiB.
- Rendering and submission order are depth-first: a container precedes its children, and siblings keep array order.
- RichText fields interpolate with \`{= expression }\`; other text is literal. Expressions inside title/description are limited to ${LIMITS.shortExpression} characters.

### source mode (streaming skeleton)

Both tools accept the full spec either as the \`spec\` object or as \`source\`, a compact JSON string; provide exactly one:
- Prefer \`source\` for long cards, or when the user should see feedback early: the client renders a read-only skeleton (title/description/progress) from the partial text while the arguments stream, then a normal summary after settle.
- The host parses the JSON strictly (no comments, no trailing commas); a failure reports an offset with line/column. A successful parse compiles to exactly the same program as the object form.

### Control catalog (kind: extra fields)

${controlCatalogLines('en')}

### Container catalog (kind: fields; containers must not carry an id)

${containerCatalogLines('en')}

${notes('en')}

### Expressions

Numbers (integer/decimal), \`'strings'\` / \`"strings"\`, \`true\` / \`false\`, interactive control ids, unary \`!\` \`-\`, \`* / %\`, \`+ -\`, \`< <= > >=\`, \`== !=\`, \`&&\`, \`||\`, ternary \`cond ? a : b\`, parentheses.
No calls, assignment, or comma expressions; the only property access is the one-level \`itemName.field\` form inside a list template. \`+\` concatenates when either side is a string; \`- * / %\` accept numbers only; division by zero, type mismatches, and unknown variables evaluate to \`undefined\` (rendered as empty), never an error.

### Complete example (ask_with_ui)

\`\`\`json
{
  "spec": {
    "title": "Team plan estimate",
    "description": "About \${= seats * 29 }/mo (\${= seats * 29 * 12 }/yr if yearly)",
    "state": { "seats": 8, "yearly": true },
    "controls": [
      { "kind": "section", "title": "Seats and billing", "children": [
        { "kind": "grid", "columns": 2, "children": [
          { "kind": "slider", "id": "seats", "label": "Seats", "min": 1, "max": 50 },
          { "kind": "switch", "id": "yearly", "label": "Bill yearly" }
        ] },
        { "kind": "chart", "chart": "line", "categories": ["month", "year"], "series": [
          { "name": "cost", "values": ["{= seats * 29 }", "{= seats * 29 * 12 }"] }
        ] }
      ] },
      { "kind": "choice", "id": "tier", "label": "Plan tier", "options": [
        { "value": "pro", "label": "Pro" },
        { "value": "team", "label": "Team", "description": "With dedicated support" }
      ] }
    ]
  },
  "ask": { "prompt": "Confirm this plan?", "submitLabel": "Confirm", "noteLabel": "Note", "allowNote": true }
}
\`\`\`

### Common mistakes

- An id on a container; a missing/duplicate id, or one with dashes/unicode.
- Nesting deeper than ${LIMITS.depth}, more than ${LIMITS.nodeTotal} nodes, or more than ${LIMITS.children.max} children in one container.
- A non-http(s) image.src / link.href; a table row length that differs from columns; chart values whose length differs from categories.
- \`{= }\` inside title; an expression referencing an unknown id; calls in an expression.
- slider initial outside min/max; select/choice initial not among option values.
- Asking for confirmation from a delivery card — use ask_with_ui.`
}

/**
 * Build the §9 system-prompt section text.
 * @param {{ language?: 'zh' | 'en' }} [options]
 * @returns {string} prompt text (roughly 1200–1800 tokens).
 */
export function buildPromptSection(options = {}) {
  const policy = options.outputPolicy === 'balanced' ? 'balanced' : 'cards-first'
  return options.language === 'en' ? enSection(policy) : zhSection(policy)
}

/**
 * Localized tool descriptions, so `language` also affects what the model reads
 * in the tool list.
 * @param {'zh' | 'en'} language
 * @returns {{ render_ui: string, ask_with_ui: string }}
 */
export function toolDescriptions(language) {
  if (language === 'en') {
    return {
      render_ui:
        'Render an interactive delivery card into the conversation instead of describing the result in prose. The card has no submit button; interactions only update it locally. Pass `spec` (object) or `source` (the same spec as compact JSON text; exactly one) following the Intelligent UI system-prompt section: a title, optional description/state, and 1-40 top-level nodes — controls, or layout containers (section/box/row/columns/grid/tabs) nested up to 4 levels. Containers include section/box/row/columns/grid/tabs and `list` (repeat one template over item records, with `itemName.field` expressions). Controls include text, tables, charts (bar/line/area/pie/donut/scatter/heatmap), images (https only, possibly host-restricted), links, key-value lists, steps, badges, callouts, stats and progress; interactive controls include slider, switch, checkbox, select, radio, number, input, textarea, choice, stepper, rating and checklist; display controls include code blocks, quotes, timelines and sparklines; bar/line/area/pie/donut charts can be made clickable with `id` and show tooltips. Call it, then stop.',
      ask_with_ui:
        'Render a question card and receive the user\'s answer as one ordinary user message starting with `[Intelligent UI]`. Use it when the user must confirm, choose, or fill parameters. Pass either `spec` (object) or `source` (compact JSON text; exactly one, same tree structure as render_ui, with optional `required` on interactive controls) and `ask` ({ prompt, submitLabel?, noteLabel?, allowNote? }).',
    }
  }
  return {
    render_ui:
      '把可交互的交付卡渲染到会话中，而不是用散文描述结果。交付卡没有提交按钮，交互只在本地更新卡片。参数用 `spec` 对象或 `source`（同一 spec 的紧凑 JSON 文本，二选一；长卡片建议用 source 以便 Client 显示流式骨架）：title、可选 description/state、1–40 个顶层节点——控件或布局容器（section/box/row/columns/grid/tabs），最多嵌套 4 层。容器包括 section/box/row/columns/grid/tabs 和 `list`（按 item 记录重复一个模板，模板内可用 `itemName.field` 表达式）；控件包括文字、表格、图表（bar/line/area/pie/donut/scatter/heatmap）、图片（默认仅 https，可能受主机白名单限制）、链接、键值、步骤、徽标、提示、指标和进度；交互控件有 slider/switch/checkbox/select/radio/number/input/textarea/choice/stepper/rating/checklist；展示控件还有代码块、引用、时间线和迷你折线；bar/line/area/pie/donut 图表加 `id` 可点击选择 category，并带 tooltip。调用后停下。',
    ask_with_ui:
      '渲染一张提问卡，用户填写并提交后，你会收到一条以 `[Intelligent UI]` 开头的普通用户消息。用于需要用户确认、选择或填写参数的场合。参数 `spec`/`source`（同 render_ui，二选一）与 `ask`（{ prompt, submitLabel?, noteLabel?, allowNote? }）。',
  }
}
