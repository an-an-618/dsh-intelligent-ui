# Intelligent UI for DeepSeek Harness

让 DSH 的回答从「一段文字」变成「文字 + 可交互卡片」。

模型写一份声明式 spec，Host 编译成 JSON program，客户端用一个不执行模型代码的解释器渲染。拖动滑块、切换开关都在浏览器本地完成，不会消耗 token；只有 `ask_with_ui` 的提交会把答案作为一条普通用户消息送回模型。系统提示词采用「应出尽出」策略：只要回答包含并列信息、参数、步骤、对比、数据、表格、图表、代码或可调选择，就直接用卡片；纯文字只留给一句话事实和闲聊。

架构借鉴了社区实现 `@comeonzhj/dsh-intelligent-ui` 的分层（声明式 spec、宿主编译、`presentationMeta` 持久化、toolview + turnTail、本地交互、显式提交），但换掉了它不可靠的 Worker 沙箱：v4 不执行任何模型生成的 JavaScript，只解释 Host 编译出的纯数据 program。

## v6.1 的卡片能长什么样

`spec.controls` 是递归节点树，容器可以嵌套：

- 布局：`section`、`box`、`row`、`columns`、`grid`、`tabs`、`list`，最多 4 层、整卡 120 个节点。
- 展示：标题、正文、分隔线、提示块、标签、指标块、进度、表格、键值列表、步骤条、时间线、代码块、引用、迷你折线、图片、链接。
- 交互：滑块、开关、勾选框、下拉、单选、数字、单行输入、多行输入、步进器、评分、多选清单、选项卡片 `choice`。
- 图表：`bar`、`line`、`area`、`pie`、`donut`、`scatter`、`heatmap`，数据可以是数字或 `{= }` 表达式；hover/聚焦显示 tooltip，带 `id` 的 bar/line/area/pie/donut 可点击选择 category 并提交。
- 列表：`list` 用一份 `template` 重复渲染 `items`，模板里可以用 `item.field` 引用当前项；模板可含一个交互控件，按 item 独立状态并在提交时逐项输出。
- 文字：支持 `**粗体**`、`*斜体*`、`` `代码` ``、`[文字](https://…)`；链接只接受 http/https。
- 图片：只允许 http/https，默认仅 https，支持 `imageHosts` 域名白名单，私有地址永远拒绝。

## 两个工具

| 工具 | 用途 | 提交 |
|---|---|---|
| `render_ui` | 交付卡：信息、表格、图表、参数预览。卡片就是回答，调用后停下。 | 没有提交按钮，滑块/开关只驱动卡片内部文字和图表。 |
| `ask_with_ui` | 提问卡：需要用户确认、选择或填写参数，并把结果交回来。 | 底部一个提交按钮，可带一行可选备注。 |

两个工具都接受 `spec` 对象，或它的紧凑 JSON 文本 `source`，二者恰好提供一个。`source` 模式适合长卡片：模型还在写文本时，工具行会先出现只读预览，已经写完的控件逐步出现；settle 后再由 turnTail 渲染完整可交互卡片。最终编译产物和交互与对象模式完全一致。

提交回来的是这样一条普通用户消息：

```text
[Intelligent UI] Team plan estimate
- seats: 10
- yearly: on
note: 4 月开始，需要发票
```

## spec 示例

```json
{
  "spec": {
    "title": "Team plan estimate",
    "description": "每月约 ${= seats * 29 }，按年付 ${= seats * 29 * 12 }/年",
    "state": { "seats": 8, "yearly": true },
    "controls": [
      { "kind": "heading", "text": "席位与周期" },
      { "kind": "slider", "id": "seats", "label": "席位数", "min": 1, "max": 50, "step": 1 },
      { "kind": "switch", "id": "yearly", "label": "按年付费" },
      { "kind": "stat", "label": "预计月费", "value": "${= seats * 29 }", "hint": "不含税" },
      { "kind": "chart", "chart": "bar", "categories": ["Q1", "Q2", "Q3", "Q4"],
        "series": [{ "name": "收入", "values": [12, 18, "{= seats * 2}", "{= seats * 3}"] }], "height": 180 }
    ]
  }
}
```

表达式写作 `{= 表达式 }`（旧写法 `{{ }}` 仍可被编译器接受，但系统提示词里不得出现双花括号，否则 DSH 会把它当成模板变量并让每一轮都失败）。控件目录、容器目录、表达式语法、字段限制都写在 `CONTRACT.md` 和 Host 的系统提示词段里。

```json
{
  "kind": "section",
  "title": "季度概览",
  "children": [
    { "kind": "row", "children": [
      { "kind": "stat", "label": "收入", "value": "$12,480" },
      { "kind": "badge", "text": "**+12%**", "tone": "success" }
    ] },
    { "kind": "columns", "columns": [
      { "children": [{ "kind": "chart", "chart": "area", "categories": ["Q1","Q2","Q3"], "series": [{ "values": [12, 18, 24] }] }] },
      { "children": [{ "kind": "keyValue", "items": [{ "label": "客户", "value": "Acme" }] }] }
    ] }
  ]
}
```

交互控件可以加 `"required": true`。`ask_with_ui` 提交前会校验当前可见的必填字段，`input`/`textarea` 要求非空，`switch`/`checkbox` 要求打开；不满足时不发送消息，字段旁显示错误。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host 插件：注册两个工具，把 spec 编译成 `CompiledMeta`，挂系统提示词 |
| `lib/expr.js` | 表达式词法/语法分析，输出 AST，不执行、不 eval |
| `lib/catalog.js` | 控件目录、字段校验、RichText 编译、限制 |
| `lib/compile.js` | spec 到 program 的编译 |
| `lib/prompt.js` | 模型看到的 spec 说明与目录 |
| `client.js` | 浏览器半体：解释 program、渲染控件、本地状态、提交、turnTail |
| `CONTRACT.md` | Host 与 Client 的接口约定 |
| `test/` | Host 与 Client 两套零依赖测试 |
| `scripts/check.mjs` | 发布前自检：语法、测试、提示词模板、清单、源码卫生 |

## 安装

安装前先跑自检，并在隔离 profile 或新会话里试一轮普通对话，确认没有 `turn/end error`，再装进 desktop。v2.0.0 就是因为系统提示词里的 `{{ }}` 触发 DSH 模板错误，装完把每一轮都打瘫了。

```sh
node scripts/check.mjs
```

```text
plugin_manager(action: "install_bundle", target: "/Users/bytedance/Desktop/dsh try/intelligent-ui")
```

安装后 bundle 以链接方式加入 profile。移除：

```text
plugin_manager(action: "remove_bundle", target: "@an-an-618/dsh-intelligent-ui")
```

## 配置

`cordis.patch.yml` 里的 row 支持：

| 设置 | 默认 | 说明 |
|---|---|---|
| `prompt` | `true` | 是否把 spec 说明挂到系统提示词。关闭后模型只能靠工具 description 猜结构。 |
| `language` | `zh` | 工具描述、回执和 ask 默认按钮语言（`zh` / `en`）。卡片控件文案由 Client 自动跟随界面语言。 |
| `outputPolicy` | `cards-first` | `cards-first` 应出尽出；`balanced` 只在结构化回答时优先卡片，简单问答直接文字。 |
| `imageHosts` | `[]` | 允许加载图片的主机名列表，空数组表示不限制主机；匹配精确主机或子域。 |
| `allowHttpImages` | `false` | 是否允许 `http://` 图片；默认只允许 `https://`。 |

改 `cordis.patch.yml` 里的 `outputPolicy` 后重新加载插件（移除再安装，或重启 DSH）生效。

也可以直接在 **插件 → 智能界面** 的页面里切换「应出尽出 / 平衡模式」，点选后保存；保存会写入 profile patch，重载插件后生效。这个页面由 `plugins.bundle.config` 注册，依赖 Settings 服务；没有 Settings 的组合不显示该页，其它功能不受影响。

## 开发与测试

```sh
node scripts/check.mjs
```

它会依次跑 `node --check`、Host 与 Client 两套测试、提示词模板检查、清单与源码卫生检查，任何一项失败都返回非零。也可以单独跑：

```sh
node test/host.test.mjs
node test/client.test.mjs
```

零依赖，不需要 `npm install`。

## 已知限制

- 工具调用行只显示摘要（标题、节点数、交互数），完整可交互卡片在本轮末尾的 turnTail 里；追问或调整参数时请用卡片本身或 `ask_with_ui`。
- 卡片草稿会写进当前标签页的 `sessionStorage`，刷新后恢复；换会话、关标签页或提交成功后不再保留。
- 表达式只有算术、比较、逻辑、三元和 `item.field` 一级属性访问，没有函数、循环或数组索引。
- `render_ui` 没有提交入口；需要用户回传值时请用 `ask_with_ui`。
- 图表支持 bar/line/area/pie/donut/scatter/heatmap；`values` 可以是数字或 `{= }` 表达式，`categories` 仍是静态字符串，不接外部图表库。
- 流式预览是只读的：会逐步出现已完成的控件，但控件禁用、无提交、无 required 校验；完整交互仍要等最终卡片。
- 图片和链接只接受 http/https；图片默认仅 https，`imageHosts` 可限制域名，私有地址永远拒绝。不支持 HTML、原始 CSS、事件回调。
