# Changelog

## 6.5.0 — 2026-10-21

插件页可视化开关。

- 插件配置改成 schemastery `Config`，`outputPolicy` 为 volatile 字段；Settings 可以编辑并写回 profile patch。
- Client 注册 `plugins.bundle.config` 页面，在「插件 → 智能界面」里提供「应出尽出 / 平衡模式」两个选项；保存后重载插件生效。
- 没有 Settings 的组合自动不显示该页，其它功能不受影响。

## 6.4.0 — 2026-10-21

输出策略开关。

- 新增配置 `outputPolicy`：`cards-first`（默认，应出尽出）或 `balanced`（只在结构化回答时优先卡片，简单问答直接文字）。
- 设置后重新加载插件生效；不设置时保持应出尽出。
- Host 测试 73 项。

## 6.3.0 — 2026-10-21

输出策略改为「应出尽出」。

- 系统提示词从“优先用卡片”改为“只要回答包含并列信息、参数、步骤、对比、数据、表格、图表、代码或可调选择，就直接用卡片”，纯文字只留给一句话事实和闲聊；拿不准时默认卡片，卡片后不再重复长段散文。
- 版本号升到 6.3.0，其它行为不变。

## 6.2.0 — 2026-10-21

流式控件预览（Phase 2）。

- `source` 流式期间容错解析部分 JSON，把已完整的控件规范化为只读预览树并逐步渲染；控件禁用、无提交/required/草稿/chart 选择，tabs 首面板、list 静态逐项。
- 无完整节点时回退标题/描述骨架；settle 后仍摘要，turnTail 最终卡不变。
- Client 测试 137 项。

## 6.1.0 — 2026-10-21

list 模板内交互。

- `list` 模板允许至多一个交互控件，按 item 重复渲染，每项独立状态；`itemLabel` 指定提交标签。
- 每项初值优先取 item 同名字段，否则用控件 initial；`required` 逐项校验；提交行 `<itemLabel> / <控件 label>: <value>`。
- program 升到 `v: 7`，Client 兼容 v2–v7。
- Host 测试 72 项，Client 测试 131 项。

## 6.0.0 — 2026-10-21

图表交互。

- 所有图表增加 hover/键盘聚焦 tooltip：柱/线/面积显示系列、category、值；饼/环显示值占比；scatter 显示 x/y；heatmap 显示行、列、值。
- `chart` 可带 `id` 变成可点击选择的交互控件（仅 bar/line/area/pie/donut）：点击选中 category，再点清除，选中高亮；支持 `label`/`initial`/`required`，提交选中 category。
- program 升到 `v: 6`，Client 兼容 v2–v6。
- Host 测试 67 项，Client 测试 122 项。

## 5.0.0 — 2026-10-21

交互与展示组件补齐。

- 新交互：`stepper`、`rating`、`checklist`（逗号分隔字符串状态，按选项顺序提交）。
- 新展示：`codeblock`、`quote`、`timeline`、`sparkline`（支持 `{= }` 表达式，随本地状态重算）。
- program 升到 `v: 5`，Client 兼容 v2–v5。
- Host 测试 61 项，Client 测试 115 项。

## 4.2.0 — 2026-10-21

默认优先结构化卡片。

- 系统提示词从“只在需要时调用”改为“结构化回答默认先考虑卡片”，覆盖对比、参数选择、表格、图表、步骤和可调参数；纯文字足够时仍可直接回答。
- 版本号升到 4.2.0，其它行为不变。

## 4.1.0 — 2026-10-21

流式骨架预览（Phase 1）。

- `render_ui` / `ask_with_ui` 新增可选 `source`：紧凑 JSON 文本，与 `spec` 恰好二选一；Host 严格解析后复用 `compileSpec`，产物与对象模式一致。
- Client 在 preparing/start 阶段用 `args.text('source')` 读取部分文本，容错提取标题/描述，在工具行渲染只读骨架卡；settle 后仍显示摘要，完整交互卡只在 turnTail。
- Host 测试 53 项，Client 测试 104 项。

## 4.0.0 — 2026-10-21

列表、图片白名单与新图表。

- `list` 容器：items 重复渲染 template，支持 `item.field` 一级作用域；模板内禁止交互控件与嵌套 list。
- 图片域名白名单：`imageHosts` / `allowHttpImages` 配置，Host 编译期校验，私有地址永远拒绝。
- 图表扩展 `scatter`（points）与 `heatmap`（categories × rows）。
- program 升到 `v: 4`，Client 兼容 v2/v3/v4。
- Host 测试 47 项，Client 测试 96 项。

## 3.0.0 — 2026-10-21

富卡片。

- 递归布局容器：`section`、`box`、`row`、`columns`、`grid`、`tabs`，最多 4 层、整卡 120 节点。
- 新控件：`image`、`link`、`keyValue`、`steps`、`choice`（选项卡片）。
- 内联富文本：`**粗体**`、`*斜体*`、`` `代码` ``、`[文字](https://…)`；链接只接受 http/https。
- 图表扩展 `area`、`pie`、`donut`，保留 `bar`/`line`。
- program 升到 `v: 3`，Client 兼容 v2 扁平卡片。
- Host 测试 39 项，Client 测试 83 项。

## 2.4.1 — 2026-10-21

提交消息清理。

- 可选 `input`/`textarea` 为空时不再输出 `- 标签: ` 这样的空行；必填字段仍由提交前校验拦截。

## 2.4.0 — 2026-10-21

草稿持久化。

- turnTail 卡片把当前字段值和备注写入 `window.sessionStorage`，键由 session、turn、kind、title 组成；同一标签页刷新后恢复草稿。
- 提交成功后清除草稿；存储不可用或写入失败时静默降级，不影响卡片。
- Client 测试 67 项。

## 2.3.0 — 2026-10-21

提交前必填校验。

- 交互控件支持可选 `required`；非交互控件带 `required` 在编译期报错。
- `ask_with_ui` 的 turnTail 卡片在提交前校验可见的必填字段：`input`/`textarea` 非空，`switch`/`checkbox` 为 true；不满足时不发送，字段显示错误与 `aria-invalid`，底部给汇总提示。
- Host 测试 29 项，Client 测试 64 项。

## 2.2.0 — 2026-10-21

工具行去重。

- `tool.call.toolview` 只渲染摘要（标题、类型、节点数、交互字段数）；完整可交互卡片只在 `conversation.chat.turnTail` 渲染。
- `ask_with_ui` 的唯一提交入口在 turnTail 卡片；toolview 不再注入 `submit`，不再持有卡片状态。
- Client 测试 62 项。

## 2.1.0 — 2026-10-21

动态图表。

- `chart.series[].values` 的每一项可以是数字，也可以是 `{= 表达式 }` 字符串；Host 编译成 RichText，Client 用当前本地状态求值，滑块/开关变化时图表立即重算，不调模型。
- 折线在表达式求值缺失处断开，单点段只画点；柱状图缺失的柱不画。
- 提示词补充动态图表说明与示例，仍然不含 `{{`。
- Host 测试 26 项，Client 测试 58 项；新增 `scripts/check.mjs` 发布前自检。

## 2.0.1 — 2026-10-21

修复 v2.0.0 的提示词模板事故。

- 系统提示词、README、CONTRACT 从 `{{ 表达式 }}` 改为 `{= 表达式 }`；编译器继续兼容旧 `{{ }}`。
- `test/host.test.mjs` 增加模拟 DSH 模板检查的回归用例，`scripts/check.mjs` 把“提示词不含 `{{`”变成安装前硬门禁。
- 版本升到 2.0.1，并在 v2.0.0 后按要求从 desktop profile 回滚。

## 2.0.0 — 2026-10-21

首个 v2 实现。

- 两个工具 `render_ui` / `ask_with_ui`，声明式 spec → Host 编译 → `presentationMeta` → Client 解释执行。
- 17 种控件、本地状态、显式提交、turnTail 成品卡片。
- 不执行模型生成的 JavaScript，没有 Worker / iframe / eval。
