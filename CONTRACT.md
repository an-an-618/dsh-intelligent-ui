# Intelligent UI v6.1 契约

版本：6.1（2026-10-21）。这份文件是 Host 半体与 Client 半体的唯一接口约定，两边按它独立实现，最后由 Lead 集成。任何需要改契约的地方先改这里，再改代码。

v2.1 到 v2.4 加了动态图表、工具行摘要、`required` 校验和草稿持久化；v3.0 加递归布局、内联富文本、图片/链接、选择卡和图表类型；v4.0 加循环/列表模板、图片域名白名单和 scatter/heatmap；v4.1 加 source 流式入口；v5.0 补 stepper/rating/checklist/codeblock/quote/timeline/sparkline；v6.0 加图表 tooltip 与点击选择；v6.1 允许 list 模板内的交互控件。program 升到 v7，Client 同时接受 v2 到 v7。

## 1. 目标与非目标

目标：在 DSH 里做一个可用的“模型生成界面”插件，借用 `@comeonzhj/dsh-intelligent-ui` 的分层（声明式 spec → Host 编译成 program → `presentationMeta` 持久化 → Client 解释执行 → 本地交互 → 显式提交），但换掉它不可靠的 Worker 沙箱。v2 不执行任何模型生成的 JavaScript，只解释 Host 编译出来的 JSON 程序。

非目标：DIL 的 `{@body}` JavaScript 状态、`{#each}` 循环、AppBlock、任意 HTML/CSS、外部图表库。这些留到 v3。

## 2. 包与文件

包名 `@an-an-618/dsh-intelligent-ui`，目录 `intelligent-ui/`。

| 文件 | 所有者 | 说明 |
|---|---|---|
| `CONTRACT.md` | Lead | 本文件 |
| `package.json`、`cordis.patch.yml`、`locale/*`、`icon.svg`、`README.md` | Lead | 清单与展示资源 |
| `index.js`、`lib/catalog.js`、`lib/expr.js`、`lib/compile.js`、`lib/prompt.js` | Host 工程师 | Host 半体 |
| `client.js` | Client 工程师 | 浏览器半体，单文件 |
| `test/host.test.mjs` | Host 工程师 | Host 与编译器测试 |
| `test/client.test.mjs` | Client 工程师 | 解释器、提交、注册测试 |

双方都不改对方的文件。集成、安装、验收由 Lead 做。

## 3. 两个工具

### 3.1 `render_ui`（交付卡）

参数 JSON Schema：

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["spec"],
  "properties": {
    "spec": { "type": "object" }
  }
}
```

交付卡只展示和探索，不提供提交入口。滑块、开关等只改本地状态，用来驱动卡片里的文字、图表预览。

### 3.2 `ask_with_ui`（提问卡）

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["spec", "ask"],
  "properties": {
    "spec": { "type": "object" },
    "ask": {
      "type": "object",
      "additionalProperties": false,
      "required": ["prompt"],
      "properties": {
        "prompt": { "type": "string" },
        "submitLabel": { "type": "string" },
        "noteLabel": { "type": "string" },
        "allowNote": { "type": "boolean" }
      }
    }
  }
}
```

提问卡底部有一个提交按钮，可附带一行可选备注。提交后回传一条普通用户消息，格式见 §7。

## 4. Spec

```json
{
  "title": "Team plan estimate",
  "description": "Drag the slider to see the monthly price.",
  "state": { "seats": 8, "yearly": true },
  "controls": [ ... ]
}
```

规则：

- `title`：必填，1 到 120 字符。
- `description`：可选，0 到 400 字符，支持表达式。
- `state`：可选，对象，键必须与后面某个交互控件的 `id` 对应，值只能是字符串、数字、布尔。用来给控件设初值；控件自己的 `initial` 优先。
- `controls`：必填，1 到 40 个。渲染顺序即数组顺序。

所有支持表达式的字段（下称 RichText）都写 `{= ... }`，例如 `"${= seats * 29 }/mo"`。`{=` 与其后第一个不在引号内的 `}` 之间的内容是 §5 的表达式；其余是字面文字。编译器同时接受旧写法 `{{ ... }}` 作为别名，但**模型可见的系统提示词段里不得出现任何双花括号**：DSH 把提示词段当模板渲染，`{{name}}` 是变量引用，其他 `{{ … }}` 会让每一轮直接报 `malformed prompt variable reference`。字面文字里的 `$`、`%`、`-` 等原样保留。

### 4.1 控件

每个控件是一个对象，共同字段：

- `kind`：见下表，必填。
- `id`：交互控件必填，1 到 40 字符，正则 `^[a-zA-Z_][a-zA-Z0-9_]*$`，同一张卡内唯一。
- `required`：可选布尔，只允许出现在交互控件上。`input`/`textarea` 要求非空，`switch`/`checkbox` 要求为 true；`select`/`radio`/`slider`/`number` 始终满足。非交互控件带这个字段直接报错。
- `visibleWhen`：可选，表达式字符串（不带 `{= }`），求值为真时才渲染。

| kind | 额外字段 | 说明 |
|---|---|---|
| `heading` | `text` RichText | 小节标题 |
| `text` | `text` RichText | 正文段落 |
| `divider` | 无 | 分隔线 |
| `callout` | `text` RichText，`tone` 可选 `neutral`/`info`/`success`/`warn`/`error` | 提示块 |
| `badge` | `text` RichText，`tone` 同上 | 行内标签 |
| `stat` | `label` RichText，`value` RichText，`hint` 可选 RichText | 指标块 |
| `progress` | `value` 数字 0 到 100，`label` 可选 RichText | 进度条 |
| `table` | `columns` 字符串数组 1 到 8 项，`rows` 二维字符串数组 1 到 100 行，每格 RichText | 表格 |
| `chart` | `chart` `bar`/`line`，`categories` 字符串数组 1 到 32 项，`series` 1 到 6 项，每项 `{name?, values: Array<number \| string>}`，`values` 每项是数字，或带 `{= }` 的表达式字符串；`height` 可选 120 到 400，`valueFormat` 可选 `number`/`currency`/`percent` | 内联 SVG 图，表达式值随本地状态变化 |
| `slider` | `label` RichText，`min` 数字，`max` 数字，`step` 数字可选，`initial` 数字可选 | 交互 |
| `switch` | `label` RichText，`initial` 布尔可选 | 交互 |
| `checkbox` | `label` RichText，`initial` 布尔可选 | 交互 |
| `select` | `label` RichText，`options` 1 到 20 项 `{value,label}`，`initial` 字符串可选 | 交互 |
| `radio` | 同 `select` | 交互 |
| `number` | `label` RichText，`min`/`max`/`step` 数字可选，`initial` 数字可选 | 交互 |
| `input` | `label` RichText，`placeholder` 可选字符串，`initial` 字符串可选 | 交互 |
| `textarea` | 同 `input`，另有 `rows` 可选 2 到 8 | 交互 |

交互控件的 `id` 同时是提交字段名。非交互控件不得带 `id`。

### 4.2 限制

整体 spec JSON 序列化后不超过 64 KiB。`title` 与 `description` 里的表达式不得超过 64 字符。不允许 URL、HTML、CSS、事件回调字段，遇到未知字段直接报错。

## 5. 表达式

### 5.1 语法

- 字面量：数字（整数或小数）、单双引号字符串、`true`/`false`。
- 变量：`state` 或控件 `id` 的名字。未知变量是编译错误。
- 一元：`!`、`-`。
- 二元：`* / %`、`+ -`、`< <= > >=`、`== !=`、`&&`、`||`。
- 三元：`cond ? a : b`。
- 括号。

没有函数调用、属性访问、赋值、逗号表达式。

### 5.2 求值规则

- `+`：两边都是数字时相加；任一边是字符串时转字符串拼接。
- `- * / %`：只接受数字，否则求值结果为 `undefined`。
- 比较：两边同为数字或同为字符串；否则 `undefined`。
- `&&` / `||`：按真值规则返回布尔。
- 真值：布尔本身；数字 0 为假，其余为真；空字符串为假，其余字符串为真；`undefined` 为假。
- 除零、类型不符、未知变量运行时一律得到 `undefined`。渲染时 `undefined` 显示为空字符串，不抛错。

### 5.3 AST

```ts
type Expr =
  | { t: 'lit'; v: string | number | boolean }
  | { t: 'ref'; name: string }
  | { t: 'un'; op: '!' | '-'; a: Expr }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>='; a: Expr; b: Expr }
  | { t: 'and' | 'or'; a: Expr; b: Expr }
  | { t: 'cond'; c: Expr; a: Expr; b: Expr }

type RichText = { parts: Array<{ k: 'lit'; v: string } | { k: 'expr'; e: Expr }> }
```

RichText 为纯字符串时仍然产出 `parts: [{k:'lit', v:...}]`，Client 不处理两套形态。

## 6. 编译产物（program）

Host 在 `output.presentationMeta(args, value)` 里返回：

```ts
interface CompiledMeta {
  v: 2
  kind: 'deliver' | 'ask'
  title: string
  description?: RichText
  submit?: { label: string; noteLabel?: string; allowNote: boolean }
  ask?: { prompt: string }
  nodes: Node[]
}
```

`Node` 就是 §4.1 的控件，但所有 RichText 已编译为 `RichText`，`visibleWhen` 已编译为 `Expr`，控件类型与字段已校验。`chart.series[].values` 里的字符串项也编译为 RichText。program 中不能再出现 `{= }` 或 `{{ }}` 原文。

`output.render(args, value)` 返回给模型看的一段短回执，例如：

```text
已在会话中渲染「Team plan estimate」：slider seats、switch yearly，共 12 个节点。
```

`output.schema` 描述回执对象，至少包含 `{ ok: boolean, kind: string, title: string, nodes: number, interactions: string[], receipt: string }`。

Host 编译失败时直接 `throw new Error(...)`，DSH 会把错误作为工具结果返回给模型；错误信息要指出第一个具体问题（控件序号与字段名）。

## 7. 提交格式

只有 `ask_with_ui` 有提交。Client 收集所有当前可见且有 `id` 的交互控件的值，拼成：

```text
[Intelligent UI] <title>
- <label 纯文本>: <value>
...
note: <备注>
```

- 标签取控件的 `label` RichText 求值后的纯文本；没有 label 时用 id。
- `switch`/`checkbox` 的值是 `on` 或 `off`。
- `select`/`radio` 的值是选中项的 `value`。
- 数字控件输出数字本身，字符串控件原样输出。
- 备注只在 `allowNote !== false` 且用户填写时出现，前缀固定为 `note: `。
- 提交前校验当前可见的 `required` 字段。有未满足项时不发送消息，在对应字段旁显示错误，并在底部给一行提示；修好后可以再次提交。
- 一个字段都没有、也没有备注时，提交按钮不发送任何消息。

提交通过 `ctx.sessions.scope(sessionId).get('conversation').send(text)` 完成，一次提交只发一条消息。

## 8. Client 渲染契约

- 文件形态：`window.__ModuleLoader__.load({ id: '@an-an-618/dsh-intelligent-ui', factory(require) { ... } })`，React 从 `require('react')` 取。
- `inject: ['slots', 'sessions', 'locale']`。
- 注册两个 keyed toolview：`tool.call.toolview` 的 key `render_ui` 和 `ask_with_ui`。工具行只显示**摘要**，不渲染交互控件、不持有本地状态、不提供提交按钮。摘要包含标题、类型（交付卡/提问卡）、节点数、交互字段数和一句“完整卡片见本轮末尾”。
- 注册两个 `conversation.chat.turnTail` 条目，`id` 分别为 `render-ui-tail`、`ask-ui-tail`。`turn` 是 Turn 对象，取 `turn.turn` 得到数字再查；查不到就渲染 null。交互卡片只在这个席位渲染，状态也只在这里持有。
- 提交只发生在 `ask_with_ui` 的 turnTail 卡片里。props 通过 `inject: (sessionId) => ({ submit })` 提供，`submit(text)` 内部走 §7 的会话通道。
- turnTail 卡片在提交前校验 `required`：未满足时阻止 `submit` 调用，字段显示 `aria-invalid` 与错误文案，底部显示汇总提示；满足后清空错误再发送。
- turnTail 卡片把当前字段值和备注写入 `window.sessionStorage`，键由 session、turn、kind、title 组成；同一标签页刷新后恢复草稿。提交成功后删除；存储不可用或写入失败时静默降级。
- 卡片状态只放在 React state，不写 DOM，不读其他插件的数据，不加载外部脚本或样式。
- 颜色、间距、圆角、字号只用 `--dsw-alias-*`、`--dsw-radius-*`、`--dsw-font-*` 变量，不写死颜色（图表系列色可以例外，但要从变量读或提供中性默认）。
- 所有控件可键盘操作，`switch` 用 `role="switch"` 加 `aria-checked`，`slider` 用原生 range。
- 卡片宽度自适应，不覆盖全屏，不设 `position: fixed`。
- 渲染错误要能降级：某个节点渲染失败时只丢这个节点，并显示一行“这个组件无法渲染”，不让整张卡崩掉。

## 9. 系统提示词

Host 在 `ctx.systemPrompt.section({ name: 'intelligent-ui', order: 2400, text })` 里加一段说明，内容包含：两个工具何时用、spec 结构、控件/容器/列表目录、表达式语法、一个完整示例、常见错误。目标长度 1800 到 2600 个 token。设置项 `prompt: false` 时不挂这段。

## 10. 配置

`cordis.patch.yml` 插入一行，config 至少支持：

```yaml
prompt: true
language: zh
```

`language` 影响工具描述与回执，不影响卡片结构。

## 11. 测试与验收

Host 测试至少覆盖：合法 spec 编译、未知控件、重复 id、越界、表达式解析与错误、RichText 分段、动态图表表达式值、`required` 只允许交互控件、两个工具的 schema 与回执、prompt section 文本、提示词段不得包含 `{{`。

Client 测试至少覆盖：表达式求值、RichText 拼字符串、可见性、提交文本格式、`required` 校验与阻止提交、草稿写入/恢复/清除、turn 归一化、两个 keyed 注册对象、turnTail 注册对象、图表数值随状态变化、工具行摘要。

集成验收（Lead 执行）：`node --check` 全部通过，测试全绿，安装到 desktop profile 后 `render_ui` 与 `ask_with_ui` 出现在工具表，真实调用渲染卡片，拖动滑块本地响应，`ask_with_ui` 提交后回到一条 `[Intelligent UI]` 用户消息。

## 12. 版本与兼容

`presentationMeta.v` 在 v7 中为 7。Client 同时接受 v2（扁平控件列表）、v3（递归节点树）、v4、v5、v6 和 v7；看到更大的版本号时渲染一行“这张卡片来自更新的插件版本”。旧 v1 卡片不要求兼容。

DSH 目标版本 0.2.1-rc.2。Client 只能依赖 `Slots` 目录里列出的标准 props；其余读取一律防御式。

## 13. v3.0 增补：递归布局、富文本、媒体与选择卡

### 13.1 递归节点树

`spec.controls` 的每一项是一个 Node，Node 可以是 §4 的控件，也可以是容器。容器可以嵌套，子节点同样可以是控件或容器。

| 容器 kind | 字段 | 说明 |
|---|---|---|
| `section` | `title?` RichText，`description?` RichText，`children` 1 到 20 个 | 带标题的小节 |
| `box` | `padding?` 0 到 8，`gap?` 0 到 8，`border?` 布尔，`radius?` `none`/`sm`/`md`/`lg`/`xl`，`background?` `base`/`layer-1`/`layer-2`/`muted`，`children` 1 到 20 个 | 带背景或边框的块 |
| `row` | `gap?` 0 到 8，`align?` `start`/`center`/`end`/`stretch`，`wrap?` 布尔，`children` 1 到 20 个 | 横向排列 |
| `columns` | `gap?` 0 到 8，`columns` 2 到 4 个 `{ children: Node[] }` | 指定列内容的并排布局 |
| `grid` | `columns` 2 到 4，`gap?` 0 到 8，`children` 1 到 20 个 | 按列数自动换行的网格 |
| `tabs` | `tabs` 2 到 6 个 `{ label: RichText, children: Node[] }` | 本地切换的标签页 |

规则：

- 容器不能带 `id`。`visibleWhen` 可以出现在任意节点上；容器被隐藏时整个子树不渲染。
- 嵌套深度从顶层算起，最多 4 层；整张卡的节点总数不超过 120 个；单个容器的 `children` 不超过 20 个。
- 交互控件的 `id` 在整棵树上全局唯一；表达式可以引用任意位置声明的交互控件。
- 提交顺序按深度优先的渲染顺序；`required`、`visibleWhen`、草稿持久化都按树遍历。
- spec 序列化后不超过 128 KiB。

### 13.2 新控件

| kind | 字段 | 说明 |
|---|---|---|
| `image` | `src` 必须是 http/https URL（≤2048 字符），`alt?` 字符串，`height?` 80 到 320，`radius?` token，`fit?` `cover`/`contain` | 图片，加载失败时显示 alt 或占位 |
| `link` | `href` 必须是 http/https URL（≤2048 字符），`text` RichText | 新标签页打开的链接 |
| `keyValue` | `items` 1 到 12 个 `{ label: RichText, value: RichText }`，`columns?` 1 到 2 | 键值列表 |
| `steps` | `items` 1 到 8 个 `{ label: RichText, description? RichText, state?: done/current/pending }` | 步骤条 |
| `choice` | `id` 必填，`label?` RichText，`options` 1 到 6 个 `{ value, label: RichText, description? RichText }`，`initial?` 字符串，`columns?` 1 到 3 | 交互控件，选项渲染成可点选卡片，提交选中项的 `value`；`required` 视为始终满足 |

`chart.chart` 扩展为 `bar`/`line`/`area`/`pie`/`donut`。`pie`/`donut` 使用第一个 series 的 `values` 与 `categories` 对应，其余 series 忽略；`area` 是带填充的折线。

### 13.3 内联富文本

所有 RichText 的字面文字（`k: 'lit'`）支持一组安全的行内标记：

- `**粗体**`、`*斜体*`、`` `代码` ``、`[文字](https://example.com)`。
- 链接只接受 http/https，长度不超过 2048；不合法时按字面文字显示。不解释 HTML。
- 表达式片段（`k: 'expr'`）不受影响，求值后作为普通文字插入。

### 13.4 Program v3

`CompiledMeta.v` 为 3，`nodes` 是递归树。Client 同时接受 v2 的扁平 `nodes`；v2 卡片按原有规则渲染。未知的大版本渲染“更新的插件版本”占位。

### 13.5 提示词

系统提示词段增加容器目录、新控件、内联富文本和嵌套限制，目标 1200 到 1800 token；仍然绝对不能出现 `{{`。

### 13.6 v3 测试

Host 至少覆盖：递归容器编译、深度/节点总数/children 上限、跨层重复 id、`image`/`link` 的协议校验、`choice` 编译、`area`/`pie`/`donut` 图表、prompt 无 `{{` 且长度在区间内。

Client 至少覆盖：递归渲染、容器 `visibleWhen` 隐藏子树、tabs 本地切换、内联富文本（含不安全链接按字面显示）、`image`/`link`、`choice` 提交、`area`/`pie`/`donut` 几何、v2 卡片兼容。

## 14. v4.0 增补：列表模板、图片白名单、scatter/heatmap

### 14.1 列表容器 `list`

```json
{
  "kind": "list",
  "items": [ { "name": "Pro", "price": 20 }, { "name": "Team", "price": 40 } ],
  "itemName": "item",
  "gap": 3,
  "template": { "kind": "box", "children": [ ... ] }
}
```

- `items`：1 到 50 个对象；每个对象的值只能是字符串、数字或布尔；键必须匹配 `^[a-zA-Z_][a-zA-Z0-9_]*$`。
- `itemName`：可选，默认 `item`，必须匹配标识符正则，不能与任何交互控件 id 重名。
- `template`：一个 Node；模板里可以放容器和展示控件，但**不能放交互控件**（避免 id 重复），也不能再嵌套 `list`。
- `gap`：可选，0 到 8。
- 模板里的表达式和 `visibleWhen` 可以引用 `itemName.field`，只允许一级属性访问；字段名必须出现在所有 items 的键并集里，否则编译报错。
- `list` 本身算一个节点，`template` 里的节点各算一个；`items` 不重复计节点数，但计入 spec 大小。

表达式语法增补：`itemName.field` 是唯一允许的属性访问形式；AST 仍是 `{t:'ref', name:'item.field'}`，Client 求值时按 `.` 拆成基础变量和一级字段，基础变量不是对象或字段不存在时得到 `undefined`。

### 14.2 图片域名白名单

插件配置新增（`cordis.patch.yml` 的 row config）：

| 设置 | 默认 | 说明 |
|---|---|---|
| `imageHosts` | `[]` | 允许加载图片的主机名列表；空数组表示不限制主机。匹配精确主机或其子域。 |
| `allowHttpImages` | `false` | 是否允许 `http://` 图片；默认只允许 `https://`。 |

Host 在编译期校验 `image.src`：

- 只接受 http/https URL，长度 ≤2048。
- 非 `allowHttpImages` 时拒绝 http。
- `imageHosts` 非空时，URL 主机必须是列表中的主机或子域（大小写不敏感）。
- 永远拒绝 `localhost`、`.local` 结尾、IPv4 私有/回环地址和 IPv6 回环/链路本地地址。

校验失败是编译错误，错误路径为对应 `image.src`。`link` 的规则不变，仍只接受 http/https。

### 14.3 scatter 与 heatmap

`chart.chart` 扩展为 `bar`/`line`/`area`/`pie`/`donut`/`scatter`/`heatmap`。

`scatter` 不用 `categories`，用 points：

```json
{
  "kind": "chart",
  "chart": "scatter",
  "series": [
    { "name": "A", "points": [ { "x": 1, "y": 4 }, { "x": 2, "y": 9 } ] }
  ],
  "height": 200,
  "valueFormat": "number"
}
```

- `series` 1 到 6 项；每项 `points` 1 到 200 个 `{x:number, y:number}`，x/y 必须是有限数字。
- 不接受 `categories` 或 `values`。

`heatmap` 用 categories 作列、rows 作行：

```json
{
  "kind": "chart",
  "chart": "heatmap",
  "categories": ["周一", "周二", "周三"],
  "rows": [
    { "label": "上午", "values": [1, 3, 5] },
    { "label": "下午", "values": [2, 4, 6] }
  ],
  "height": 200,
  "valueFormat": "number"
}
```

- `categories` 1 到 24 个字符串；`rows` 1 到 12 项，每项 `{label: string, values: number[]}`，`values` 长度必须等于 categories。
- 颜色按所有数值的最小/最大值线性映射到主题 token；全空或全相等时给中性色。

### 14.4 Program v4

`CompiledMeta.v` 为 4，其它结构与 v3 一致。Client 接受 2/3/4；未知大版本渲染“更新的插件版本”占位。

### 14.5 提示词与测试

系统提示词增加 `list`、`scatter`、`heatmap`、图片白名单说明；目标 1600 到 2200 token，仍然绝对不能出现 `{{`。

Host 测试至少覆盖：`list` 合法编译与 item 字段引用、交互控件/嵌套 list 被拒、深度与节点计数、`image` 白名单/协议/私有地址、scatter/heatmap 结构与长度校验、prompt 无 `{{` 且长度在区间内。

Client 至少覆盖：列表模板按 items 重复渲染、item 作用域与 `item.field` 求值、列表内 visibleWhen、scatter/heatmap 几何与空数据降级、v2/v3 卡片兼容。

### 14.6 流式半成品渲染（v4.1）

v4.1 的目标是模型还在写界面时卡片就逐步出现。DSH 的 `PartialArguments` 只能部分读取顶层字符串字段，`spec` 对象拿不到部分结构，`presentationMeta` 也只在 execute 后生成，因此采用**可选文本入口**：

- `render_ui` 与 `ask_with_ui` 新增可选参数 `source`：一段紧凑 JSON 文本，内容就是完整的 spec。`spec` 对象与 `source` 必须恰好提供一个；两个都给或都不给都是参数错误。
- Host 在 `execute`/`presentationMeta` 里对 `source` 做严格 `JSON.parse`，随后复用现有 `compileSpec`；编译产物、`meta.v`、回执、turnTail 与对象模式完全一致。解析失败时错误信息带 offset。
- Client 在 `preparing`/`start` 阶段用 `block.args.text('source')` 读取已经流出的文本，尝试提取 `title` 与 `description`，在工具行渲染一张**只读骨架卡**（标题、描述、进度提示），不渲染控件、不持有状态、不提交。`args` 读不到或文本还不完整时继续显示占位。
- settle 后工具行仍只显示摘要；完整卡片照旧由 turnTail 从 `presentationMeta` 渲染，交互只在最终卡片里。
- 预览是只读的，不代表最终程序；半成品解析失败不能影响最终 execute。
- Phase 1 只做标题/描述骨架；v6.2 的 Phase 2 在 Client 侧加一个**轻量预览规范化器**：容错解析部分 JSON，把已经完整出现的控件转成只读节点树并渲染，控件全部禁用、无可提交状态、不触发 chart 选择；tabs 只显示第一个面板，list 按 items 渲染静态模板。预览随 source 增量更新，settle 后让位给摘要和 turnTail 的最终卡片。预览不校验 required、不写草稿、不影响最终 execute。

测试：Host 覆盖 source 解析、spec/source 互斥、错误 offset、两种模式产物一致；Client 覆盖部分 source 骨架与控件预览、部分 JSON 修复、settle 后摘要、最终 turnTail 不变、预览无提交/无交互。

## 15. v5.0 增补：交互与展示组件

### 15.1 新的交互控件

| kind | 字段 | 提交值 |
|---|---|---|
| `stepper` | `id` 必填，`label` RichText 必填，`min?`/`max?`/`step?` 整数（默认 0/100/1），`initial?` 数字，`required?` 布尔（始终满足） | 数字 |
| `rating` | `id` 必填，`label` RichText 必填，`max?` 整数 3 到 10（默认 5），`initial?` 0 到 max（默认 0），`required?` 布尔（要求至少 1 星） | 数字 |
| `checklist` | `id` 必填，`label?` RichText，`options` 1 到 10 个 `{ value, label: RichText, description? RichText }`，`initial?` 逗号分隔的字符串（默认空），`columns?` 1 到 3，`required?` 布尔（要求至少选一项） | 选中项的 `value` 用逗号按选项顺序拼接 |

`stepper` 渲染减号、数值、加号；`rating` 渲染一排星；`checklist` 渲染可多选的卡片或勾选列表。三者都参与提交、`required` 校验与草稿持久化。`checklist` 的本地状态仍是字符串（逗号分隔），不引入数组 state。

### 15.2 新的展示控件

| kind | 字段 | 说明 |
|---|---|---|
| `codeblock` | `code` 字符串 1 到 4000 字符，`language?` 1 到 20 字符，`title?` RichText | 等宽代码块，纯文本，不解释 HTML；超过宽度横向滚动 |
| `quote` | `text` RichText，`cite?` RichText | 引用块，左侧强调线 |
| `timeline` | `items` 1 到 12 个 `{ label: RichText, description? RichText, time? RichText, state?: done/current/pending }` | 纵向时间线 |
| `sparkline` | `values` 2 到 32 项，每项是数字或 `{= }` 表达式字符串，`height?` 24 到 64（默认 40），`tone?` neutral/info/success/warn/error | 行内迷你折线，随本地状态重算 |

### 15.3 Program v5 与测试

`CompiledMeta.v = 5`，其它结构与 v4 一致。Host 新增对以上控件的目录与校验；Client 渲染并参与提交/校验/草稿。提示词目录同步更新，目标 1800 到 2400 token，仍然绝对不能出现 `{{`。

Host 测试至少覆盖：新控件合法编译、字段/范围校验、`checklist` initial 校验、`codeblock` 长度、`sparkline` 表达式、program v5、prompt 无 `{{` 且长度在区间内。

Client 至少覆盖：stepper/rating/checklist 渲染与提交、required 语义、codeblock/quote/timeline 渲染、sparkline 几何与空数据降级、v2/v3/v4 兼容。

## 16. v6.0 增补：图表 tooltip 与点击选择

### 16.1 tooltip

所有图表在 hover 或键盘聚焦时显示 tooltip：

- bar/line/area：系列名、category、格式化后的数值。
- pie/donut：category、格式化后的数值、占比。
- scatter：系列名、`x`、`y`。
- heatmap：行标签、列 category、数值。

tooltip 在卡片内部绝对定位，不设 `position: fixed`，不遮挡提交按钮；鼠标移出或失焦消失。原生 `<title>` 保留作为降级。

### 16.2 可点击选择的 chart

`chart` 新增可选字段：

| 字段 | 说明 |
|---|---|
| `id?` | 出现即表示这张图可交互；只有 `bar`/`line`/`area`/`pie`/`donut` 允许，`scatter`/`heatmap` 带 `id` 是编译错误 |
| `label?` | RichText，提交字段的标签；缺省用 `title` 或 “选择” |
| `select?` | 目前只允许 `category`（默认） |
| `initial?` | 字符串，初始选中的 category；必须在 categories 里 |
| `required?` | 布尔，要求至少选中一个 category |

交互规则：

- 点击柱、折线点、面积点或饼图扇区，把该 category 写入状态；再次点击同一个 category 清除选择。
- 选中的图形用主题 token 高亮；状态值为 category 字符串。
- 提交时输出选中的 category，格式与其它交互控件一致；`required` 时未选择会阻止提交并在图旁显示错误。
- 可选择的 chart 计入 `interactionIds`、`interactionCount`、`required` 校验和草稿持久化。
- 点击选择在本地完成，不调用模型；tooltip 与选择高亮不改变最终 program。

### 16.3 Program v6 与测试

`CompiledMeta.v = 6`，其它结构不变。Host 校验 `id` 只允许 bar/line/area/pie/donut、`initial` 必须在 categories 中、`required` 只能与 `id` 同时出现；scatter/heatmap 带 `id` 报错。提示词补充 tooltip 与可选择图表说明，仍然绝对不能出现 `{{`。

Host 测试至少覆盖：可选择 chart 编译、heatmap/scatter 带 id 报错、initial 越界、required 依赖 id、program v6、prompt 无 `{{`。

Client 至少覆盖：tooltip 内容与显示/隐藏、点击选择与取消、选中高亮、required 阻止提交、提交值、v2–v5 兼容。

## 17. v6.1 增补：list 模板内的交互控件

### 17.1 允许范围

`list.template` 里现在允许放**至多一个**交互控件（slider/switch/checkbox/select/radio/number/input/textarea/stepper/rating/checklist/choice/可选择的 chart）。规则：

- 模板内交互控件的 `id` 只在本模板内生效，不进入全树 `interactiveIds`，外部表达式不能引用；也不得与任何外部交互 id 重名。
- 模板内仍不允许嵌套 `list`。
- `list` 新增可选 `itemLabel?: string`：取 items 中一个字段名作为每项的标签；缺省取第一个字符串字段；都没有时用 `[index]`。字段值必须是字符串/数字/布尔。
- 每项的初值：如果 item 对象自身有与控件 `id` 同名的字段，且类型匹配，就用它；否则用控件的 `initial`（或 Host 补的默认值）。
- `required` 按每一项分别校验；只要有一项未满足就阻止提交，并在对应项的控件旁显示错误。

### 17.2 提交格式

对每个可见 item 及其可见模板控件，输出一行：

```text
- <itemLabel 的值> / <控件 label>: <value>
```

- 控件 label 的 RichText 在 item 作用域下求值；缺省用控件 id。
- 可选 `input`/`textarea` 为空时跳过该行；`switch`/`checkbox` 输出 `on`/`off`；`checklist` 输出逗号分隔值；数字输出数字。
- 多项控件不在 v6.1 范围内（每模板最多一个），避免提交行互相覆盖。
- 提交顺序按 items 顺序；`interactionCount` 只把模板控件算一次。

### 17.3 状态与实现

Client 用“节点索引路径 + item 序号 + 控件 id”生成内部状态键，逐项渲染时从 item 字段或控件 initial 初始化。该键不进入 program，Host 不感知。草稿持久化可以包含这些键，但重放时只恢复仍然存在的项。

### 17.4 Program v7 与测试

`CompiledMeta.v = 7`，其它结构不变。Host 校验 list 模板最多一个交互控件、id 规则、itemLabel 字段存在、item 字段类型、required 位置；提示词补充说明，仍然绝对不能出现 `{{`。

Host 测试至少覆盖：模板内单个交互控件通过、两个报错、id 与外部冲突报错、itemLabel 缺失/非法、item 字段类型、program v7、prompt 无 `{{`。

Client 至少覆盖：按 item 重复渲染控件、每项独立状态、item 字段初值、required 逐项拦截、提交行格式与顺序、可选空 input 跳过、v2–v6 兼容。
