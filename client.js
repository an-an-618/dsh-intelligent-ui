/**
 * Intelligent UI v2 — browser half of `@an-an-618/dsh-intelligent-ui`.
 *
 * Registers two keyed `tool.call.toolview` entries (`render_ui`, `ask_with_ui`)
 * for the stateless tool-row summary, and two `conversation.chat.turnTail`
 * entries for the one interactive card (v2.2, CONTRACT.md §8). It interprets
 * the Host's compiled JSON program (`CompiledMeta`, CONTRACT.md §6). The
 * program is pure data: this module never creates dynamic code, never loads an
 * external resource, and never reads another plugin's DOM.
 *
 * Interaction is local React state. Only `ask_with_ui` submits, and it submits
 * one ordinary user message through the session-scoped conversation Client
 * service, so the answer is durable in the session log (CONTRACT.md §7/§8).
 *
 * v3 (CONTRACT.md §13): `nodes` is a recursive tree with layout containers,
 * inline RichText markup, media/choice controls, and area/pie/donut charts.
 * Program `v` 2 (flat) and 3 (tree) are both accepted.
 */
window.__ModuleLoader__.load({
  id: '@an-an-618/dsh-intelligent-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-intelligent-ui'

    /**
     * Inline dictionaries so the card never depends on a separate locale file.
     * The Host half owns tool descriptions and receipts; this half owns card
     * chrome only.
     */
    const MESSAGES = {
      zh: {
        'card.brand': '智能界面',
        'card.preparing': '正在准备界面…',
        'card.invalid': '这个工具结果没有携带可渲染的界面。',
        'card.errorResult': '这个工具执行失败，没有可渲染的内容。',
        'card.newer': '这张卡片来自更新的插件版本。',
        'card.nodeError': '这个组件无法渲染',
        'card.submit': '提交',
        'card.sending': '发送中…',
        'card.sent': '已提交，下一条消息会把你的选择发给模型。',
        'card.failed': '发送失败：{message}',
        'card.notePlaceholder': '补充说明（可选）',
        'card.empty': '没有可提交的内容',
        'card.required': '此项必填',
        'card.requiredSummary': '请先填写必填项。',
        'card.imageFailed': '图片无法加载',
        'card.generating': '正在生成界面…',
        'card.stepper.decrease': '减少',
        'card.stepper.increase': '增加',
        'card.rating.set': '设为 {value} 星',
        'card.sparkline': '迷你图：{count} 个数据点',
        'card.chart.selectLabel': '选择',
        'card.preview': '预览',
        'card.chart.summary': '图表：{categories} 个类别、{series} 个数据系列',
        'card.chart.scatter': '图表：{points} 个数据点、{series} 个数据系列',
        'card.chart.heatmap': '热力图：{rows} 行 × {columns} 列',
        'card.chart.series': '系列 {index}',
        'card.progress': '进度',
        'card.summary.kind.deliver': '交付卡',
        'card.summary.kind.ask': '提问卡',
        'card.summary.nodes': '{count} 个节点',
        'card.summary.interactions': '{count} 个交互字段',
        'card.summary.hint': '完整卡片见本轮末尾',
        'policy.title': '输出策略',
        'policy.description': '控制模型什么时候用卡片回答。',
        'policy.cardsFirst': '应出尽出',
        'policy.cardsFirstHint': '结构化内容都先用卡片；纯文字只留给一句话事实和闲聊。',
        'policy.balanced': '平衡模式',
        'policy.balancedHint': '只在对比、参数、表格、图表、步骤时优先卡片；简单问答直接文字。',
        'policy.reload': '保存后重载插件生效。',
        'policy.saved': '已保存，重载插件后生效。',
        'policy.failed': '保存失败，请重试。',
        'policy.unavailable': '当前组合没有提供 Settings，无法编辑。',
      },
      en: {
        'card.brand': 'Intelligent UI',
        'card.preparing': 'Preparing interface…',
        'card.invalid': 'This tool result carries no renderable interface.',
        'card.errorResult': 'This tool call failed, so there is nothing to render.',
        'card.newer': 'This card comes from a newer version of the plugin.',
        'card.nodeError': 'This component could not be rendered',
        'card.submit': 'Submit',
        'card.sending': 'Sending…',
        'card.sent': 'Submitted. Your values arrive in the next message.',
        'card.failed': 'Could not send: {message}',
        'card.notePlaceholder': 'Anything to add? (optional)',
        'card.empty': 'There is nothing to submit yet',
        'card.required': 'This field is required',
        'card.requiredSummary': 'Please fill in the required fields.',
        'card.imageFailed': 'Image could not be loaded',
        'card.generating': 'Generating interface…',
        'card.stepper.decrease': 'Decrease',
        'card.stepper.increase': 'Increase',
        'card.rating.set': 'Rate {value}',
        'card.sparkline': 'Sparkline with {count} points',
        'card.chart.selectLabel': 'Select',
        'card.preview': 'Preview',
        'card.chart.summary': 'Chart with {categories} categories and {series} series',
        'card.chart.scatter': 'Chart with {points} points and {series} series',
        'card.chart.heatmap': 'Heatmap with {rows} rows × {columns} columns',
        'card.chart.series': 'Series {index}',
        'card.progress': 'Progress',
        'card.summary.kind.deliver': 'Delivery card',
        'card.summary.kind.ask': 'Question card',
        'card.summary.nodes': '{count} nodes',
        'card.summary.interactions': '{count} interactive fields',
        'card.summary.hint': 'The full card is at the end of this turn',
        'policy.title': 'Output policy',
        'policy.description': 'Controls when the model answers with a card.',
        'policy.cardsFirst': 'Cards first',
        'policy.cardsFirstHint': 'Use a card for any structured content; plain text is only for one-line facts and chat.',
        'policy.balanced': 'Balanced',
        'policy.balancedHint': 'Prefer cards for comparisons, parameters, tables, charts, and steps; answer simple questions in text.',
        'policy.reload': 'Reload the plugin after saving.',
        'policy.saved': 'Saved. Reload the plugin to apply.',
        'policy.failed': 'Could not save. Try again.',
        'policy.unavailable': 'Settings is not available in this composition.',
      },
    }

    /** Last-resort dictionary for a composition without the locale service. */
    const FALLBACK_MESSAGES = MESSAGES.zh

    /**
     * Theme-token-only styling. The `<style>` element is rendered by the card
     * itself, so React removes it with the card on unmount (CONTRACT.md §8).
     * Chart series colours read the state palette through variables and carry
     * neutral fallbacks; every other colour is a token.
     */
    const CSS = [
      '.dsh-iu2-card{display:flex;flex-direction:column;gap:10px;box-sizing:border-box;width:100%;max-width:640px;min-width:0;margin:6px 0;padding:14px 16px;border:0.5px solid var(--dsw-alias-border-l1,#e3e5ea);border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-module-platform,#fff);color:var(--dsw-alias-label-primary,#1b1f27);font-family:var(--dsw-font-family,inherit);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);overflow-wrap:anywhere}',
      '.dsh-iu2-placeholder{color:var(--dsw-alias-label-tertiary,#8a93a3)}',
      '.dsh-iu2-head{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dsh-iu2-title{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-s-14-font-size,14px);line-height:var(--dsw-font-s-14-line-height,22px);font-weight:600}',
      '.dsh-iu2-desc{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-invalid{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      // v2.2 tool-row summary: title, kind, node and interaction counts, hint.
      '.dsh-iu2-summary{display:flex;flex-direction:column;gap:2px;box-sizing:border-box;width:100%;max-width:640px;min-width:0;padding:4px 2px;font-family:var(--dsw-font-family,inherit);overflow-wrap:anywhere}',
      '.dsh-iu2-summary-title{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-strong-13-font-size,13px);line-height:var(--dsw-font-xs-strong-13-line-height,20px);font-weight:500}',
      '.dsh-iu2-summary-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-summary-kind{display:inline-flex;align-items:center;padding:0 7px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#eceef4);color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px);font-weight:500}',
      '.dsh-iu2-summary-kind[data-kind="ask"]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6bff) 12%,transparent);color:var(--dsw-alias-state-business-primary,#2f6bff)}',
      '.dsh-iu2-summary-sep{color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary,#8a93a3))}',
      '.dsh-iu2-summary-hint{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px)}',
      '.dsh-iu2-nodes{display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.dsh-iu2-node-error{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);font-style:italic}',
      '.dsh-iu2-error{color:var(--dsw-alias-state-error-primary,#c62828);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);margin-top:2px}',
      '.dsh-iu2-heading{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);font-weight:600;margin:2px 0 0}',
      '.dsh-iu2-text{color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);white-space:pre-wrap}',
      '.dsh-iu2-divider{height:0.5px;background:var(--dsw-alias-border-l2,rgba(20,26,40,.1));margin:2px 0}',
      '.dsh-iu2-callout{padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-left-width:3px;border-left-color:var(--dsw-alias-border-l3,rgba(20,26,40,.16));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#f5f6f9);color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);white-space:pre-wrap}',
      '.dsh-iu2-callout[data-tone="info"]{border-left-color:var(--dsw-alias-state-idle-primary,#3b6fd4)}',
      '.dsh-iu2-callout[data-tone="success"]{border-left-color:var(--dsw-alias-state-success-primary,#12854a)}',
      '.dsh-iu2-callout[data-tone="warn"]{border-left-color:var(--dsw-alias-state-warn-primary,#b06a00)}',
      '.dsh-iu2-callout[data-tone="error"]{border-left-color:var(--dsw-alias-state-error-primary,#c62828)}',
      '.dsh-iu2-badge{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#eceef4);color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px);font-weight:500}',
      '.dsh-iu2-badge[data-tone="info"]{background:color-mix(in srgb,var(--dsw-alias-state-idle-primary,#3b6fd4) 14%,transparent);color:var(--dsw-alias-state-idle-primary,#3b6fd4)}',
      '.dsh-iu2-badge[data-tone="success"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#12854a) 14%,transparent);color:var(--dsw-alias-state-success-primary,#12854a)}',
      '.dsh-iu2-badge[data-tone="warn"]{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#b06a00) 16%,transparent);color:var(--dsw-alias-state-warn-primary,#b06a00)}',
      '.dsh-iu2-badge[data-tone="error"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#c62828) 14%,transparent);color:var(--dsw-alias-state-error-primary,#c62828)}',
      '.dsh-iu2-stat{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#f5f6f9);min-width:0}',
      '.dsh-iu2-stat-label{color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-stat-value{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-l-20-font-size,20px);line-height:var(--dsw-font-l-20-line-height,28px);font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsh-iu2-stat-hint{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px)}',
      '.dsh-iu2-progress{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-iu2-progress-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-progress-track{height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#eceef4);overflow:hidden}',
      '.dsh-iu2-progress-fill{height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#2f6bff);transition:width .28s ease}',
      '.dsh-iu2-table-wrap{overflow-x:auto;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-md,8px);min-width:0}',
      '.dsh-iu2-table{width:100%;border-collapse:collapse;color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-table th{padding:7px 10px;text-align:left;white-space:nowrap;color:var(--dsw-alias-label-secondary,#5a6474);font-weight:500;background:var(--dsw-alias-bg-layer-2,#f5f6f9);border-bottom:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1))}',
      '.dsh-iu2-table td{padding:7px 10px;text-align:left;vertical-align:top;border-bottom:0.5px solid var(--dsw-alias-border-l1,#e3e5ea);white-space:pre-wrap}',
      '.dsh-iu2-table tr:last-child td{border-bottom:none}',
      '.dsh-iu2-chart{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-iu2-chart-legend{display:flex;flex-wrap:wrap;gap:4px 12px}',
      '.dsh-iu2-chart-legend-item{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px)}',
      '.dsh-iu2-chart-dot{width:7px;height:7px;border-radius:50%;flex:none}',
      '.dsh-iu2-chart-svg{display:block;width:100%;height:auto}',
      '.dsh-iu2-chart-grid{stroke:var(--dsw-alias-border-l2,rgba(20,26,40,.1));stroke-width:0.5}',
      '.dsh-iu2-chart-axis{fill:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxxs-11-font-size,11px);font-family:var(--dsw-font-family,inherit)}',
      '.dsh-iu2-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-iu2-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}',
      '.dsh-iu2-label{color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-value{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);font-variant-numeric:tabular-nums;flex:none}',
      '.dsh-iu2-range{width:100%;accent-color:var(--dsw-alias-state-business-primary,#2f6bff)}',
      '.dsh-iu2-switch{position:relative;width:36px;height:20px;flex:none;box-sizing:border-box;padding:0;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f5f6f9);cursor:pointer}',
      '.dsh-iu2-switch[aria-checked="true"]{background:var(--dsw-alias-button-primary-fill,#2f6bff);border-color:var(--dsw-alias-button-primary-fill,#2f6bff)}',
      '.dsh-iu2-switch:disabled{opacity:.55;cursor:default}',
      '.dsh-iu2-knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform .12s ease}',
      '.dsh-iu2-switch[aria-checked="true"] .dsh-iu2-knob{transform:translateX(16px)}',
      '.dsh-iu2-check{display:flex;align-items:flex-start;gap:8px;cursor:pointer;min-width:0}',
      '.dsh-iu2-check input{margin:2px 0 0;width:15px;height:15px;flex:none;accent-color:var(--dsw-alias-state-business-primary,#2f6bff)}',
      '.dsh-iu2-choice{display:flex;align-items:flex-start;gap:8px;cursor:pointer;min-width:0}',
      '.dsh-iu2-choice input{margin:2px 0 0;width:15px;height:15px;flex:none;accent-color:var(--dsw-alias-state-business-primary,#2f6bff)}',
      '.dsh-iu2-input{box-sizing:border-box;width:100%;min-width:0;padding:5px 8px;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1b1f27);font-family:var(--dsw-font-family,inherit);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px)}',
      '.dsh-iu2-input:disabled{opacity:.6}',
      '.dsh-iu2-textarea{resize:vertical;min-height:44px}',
      '.dsh-iu2-foot{display:flex;flex-direction:column;gap:8px;margin-top:2px;padding-top:10px;border-top:0.5px solid var(--dsw-alias-border-l1,#e3e5ea)}',
      '.dsh-iu2-foot-hint{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);white-space:pre-wrap}',
      '.dsh-iu2-foot-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
      '.dsh-iu2-submit{border:none;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-button-primary-fill,#2f6bff);color:var(--dsw-alias-label-primary-inverted,#fff);font-family:inherit;font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);padding:5px 14px;cursor:pointer}',
      '.dsh-iu2-submit:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#2458d8)}',
      '.dsh-iu2-submit:disabled{opacity:.55;cursor:default}',
      '.dsh-iu2-status{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-status[data-error="true"]{color:var(--dsw-alias-state-error-primary,#c62828)}',
      // v3 inline RichText markup.
      '.dsh-iu2-strong{font-weight:600;color:inherit}',
      '.dsh-iu2-em{font-style:italic}',
      '.dsh-iu2-code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:0.92em;padding:0 4px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-markdown-code-block,#f0f1f5);color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.dsh-iu2-inline-link{color:var(--dsw-alias-link,#2f6bff);text-decoration:underline;text-underline-offset:2px}',
      // v3 layout containers.
      '.dsh-iu2-section{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-iu2-section-title{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-strong-13-font-size,13px);line-height:var(--dsw-font-xs-strong-13-line-height,20px);font-weight:500}',
      '.dsh-iu2-section-desc{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-container-children{display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.dsh-iu2-box{display:flex;flex-direction:column;min-width:0}',
      '.dsh-iu2-lrow{display:flex;min-width:0}',
      '.dsh-iu2-columns{display:grid;min-width:0}',
      '.dsh-iu2-column{display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.dsh-iu2-grid{display:grid;min-width:0}',
      '.dsh-iu2-tabs{display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.dsh-iu2-tablist{display:flex;flex-wrap:wrap;gap:4px;border-bottom:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));padding-bottom:4px}',
      '.dsh-iu2-tab{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#5a6474);font-family:inherit;font-size:var(--dsw-font-xxs-strong-12-font-size,12px);line-height:var(--dsw-font-xxs-strong-12-line-height,18px);padding:4px 10px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}',
      '.dsh-iu2-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-2,#f5f6f9);color:var(--dsw-alias-label-primary,#1b1f27);font-weight:500}',
      '.dsh-iu2-tabpanel{display:flex;flex-direction:column;gap:8px;min-width:0}',
      // v3 media / key-value / steps / choice controls.
      '.dsh-iu2-image{display:block;width:100%;max-width:100%;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-skeleton,#f0f1f5)}',
      '.dsh-iu2-image-fallback{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;padding:10px;border:0.5px dashed var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2,#f5f6f9);color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);text-align:center}',
      '.dsh-iu2-link{color:var(--dsw-alias-link,#2f6bff);text-decoration:underline;text-underline-offset:2px}',
      '.dsh-iu2-kv{display:grid;gap:8px 16px;min-width:0}',
      '.dsh-iu2-kv-item{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsh-iu2-kv-label{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-kv-value{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px)}',
      '.dsh-iu2-steps{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;min-width:0}',
      '.dsh-iu2-step{display:flex;align-items:flex-start;gap:8px;min-width:0}',
      '.dsh-iu2-step-marker{flex:none;box-sizing:border-box;width:16px;height:16px;margin-top:1px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l3,rgba(20,26,40,.16));background:var(--dsw-alias-bg-layer-1,#fff)}',
      '.dsh-iu2-step[data-state="done"] .dsh-iu2-step-marker{border-color:var(--dsw-alias-state-success-primary,#12854a);background:var(--dsw-alias-state-success-primary,#12854a)}',
      '.dsh-iu2-step[data-state="current"] .dsh-iu2-step-marker{border-color:var(--dsw-alias-state-business-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6bff) 24%,transparent)}',
      '.dsh-iu2-step-body{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsh-iu2-step-label{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px)}',
      '.dsh-iu2-step-desc{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-choice-grid{display:grid;gap:8px;min-width:0}',
      '.dsh-iu2-choice-card{display:flex;align-items:flex-start;gap:8px;box-sizing:border-box;padding:9px 11px;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,#fff);cursor:pointer;min-width:0}',
      '.dsh-iu2-choice-card[data-selected="true"]{border-color:var(--dsw-alias-state-business-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6bff) 8%,transparent)}',
      '.dsh-iu2-choice-card input{flex:none;width:15px;height:15px;margin:2px 0 0;accent-color:var(--dsw-alias-state-business-primary,#2f6bff)}',
      '.dsh-iu2-choice-body{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsh-iu2-choice-label{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px)}',
      '.dsh-iu2-choice-desc{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      // v4 list template + heatmap chrome.
      '.dsh-iu2-list{display:flex;flex-direction:column;min-width:0}',
      '.dsh-iu2-list-item{display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.dsh-iu2-heatmap{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.dsh-iu2-heatmap-value{fill:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xxxs-11-font-size,11px);font-family:var(--dsw-font-family,inherit)}',
      // v4.1 streaming source skeleton: read-only preview chrome.
      '.dsh-iu2-skeleton{border-style:dashed}',
      '.dsh-iu2-skeleton-hint{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-skeleton-bar{height:2px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#eceef4);overflow:hidden}',
      '.dsh-iu2-skeleton-bar-fill{width:35%;height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#2f6bff);animation:dsh-iu2-skeleton-sweep 1.4s ease-in-out infinite}',
      '@keyframes dsh-iu2-skeleton-sweep{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}',
      '@media (prefers-reduced-motion:reduce){.dsh-iu2-skeleton-bar-fill{animation:none;width:100%;opacity:.35}}',
      // v5 stepper / rating / checklist / codeblock / quote / timeline / sparkline.
      '.dsh-iu2-stepper{display:inline-flex;align-items:center;gap:2px;box-sizing:border-box;padding:2px;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,#fff);flex:none}',
      '.dsh-iu2-stepper-button{width:26px;height:26px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,#5a6474);font-family:inherit;font-size:15px;line-height:1;cursor:pointer}',
      '.dsh-iu2-stepper-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid,#eceef4);color:var(--dsw-alias-label-primary,#1b1f27)}',
      '.dsh-iu2-stepper-button:disabled{opacity:.5;cursor:default}',
      '.dsh-iu2-stepper-value{min-width:44px;text-align:center;color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);font-variant-numeric:tabular-nums}',
      '.dsh-iu2-rating{display:inline-flex;align-items:center;gap:2px}',
      '.dsh-iu2-star{padding:0 1px;border:none;background:transparent;color:var(--dsw-alias-border-l3,rgba(20,26,40,.16));font-family:inherit;font-size:17px;line-height:20px;cursor:pointer}',
      '.dsh-iu2-star[data-filled="true"]{color:var(--dsw-alias-state-warn-primary,#b06a00)}',
      '.dsh-iu2-star:disabled{opacity:.6;cursor:default}',
      '.dsh-iu2-checklist{display:grid;gap:8px;min-width:0}',
      '.dsh-iu2-codeblock{display:flex;flex-direction:column;min-width:0;overflow:hidden;border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-markdown-code-block,#f0f1f5)}',
      '.dsh-iu2-codeblock-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1))}',
      '.dsh-iu2-codeblock-title{color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);min-width:0}',
      '.dsh-iu2-codeblock-lang{flex:none;color:var(--dsw-alias-label-tertiary,#8a93a3);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px)}',
      '.dsh-iu2-codeblock-pre{margin:0;padding:10px 12px;overflow-x:auto;color:var(--dsw-alias-label-primary,#1b1f27);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px);white-space:pre;tab-size:2}',
      '.dsh-iu2-quote{display:flex;flex-direction:column;gap:4px;margin:0;padding:2px 0 2px 12px;border-left:3px solid var(--dsw-alias-border-l3,rgba(20,26,40,.16))}',
      '.dsh-iu2-quote-text{color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px);white-space:pre-wrap}',
      '.dsh-iu2-quote-cite{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-timeline{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;min-width:0}',
      '.dsh-iu2-timeline-item{display:flex;align-items:flex-start;gap:8px;min-width:0}',
      '.dsh-iu2-timeline-marker{flex:none;box-sizing:border-box;width:9px;height:9px;margin-top:5px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l3,rgba(20,26,40,.16));background:var(--dsw-alias-bg-layer-1,#fff)}',
      '.dsh-iu2-timeline-item[data-state="done"] .dsh-iu2-timeline-marker{border-color:var(--dsw-alias-state-success-primary,#12854a);background:var(--dsw-alias-state-success-primary,#12854a)}',
      '.dsh-iu2-timeline-item[data-state="current"] .dsh-iu2-timeline-marker{border-color:var(--dsw-alias-state-business-primary,#2f6bff);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6bff) 30%,transparent)}',
      '.dsh-iu2-timeline-body{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dsh-iu2-timeline-time{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px)}',
      '.dsh-iu2-timeline-label{color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xs-13-font-size,13px);line-height:var(--dsw-font-xs-13-line-height,20px)}',
      '.dsh-iu2-timeline-desc{color:var(--dsw-alias-label-tertiary,#8a93a3);font-size:var(--dsw-font-xxs-12-font-size,12px);line-height:var(--dsw-font-xxs-12-line-height,18px)}',
      '.dsh-iu2-sparkline{display:block;min-width:0}',
      '.dsh-iu2-sparkline-svg{display:block;width:100%}',
      '.dsh-iu2-sparkline-line{fill:none;stroke:var(--dsw-alias-state-business-primary,#2f6bff);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round}',
      '.dsh-iu2-sparkline-dot{fill:var(--dsw-alias-state-business-primary,#2f6bff)}',
      '.dsh-iu2-sparkline[data-tone="info"] .dsh-iu2-sparkline-line,.dsh-iu2-sparkline[data-tone="info"] .dsh-iu2-sparkline-dot{stroke:var(--dsw-alias-state-idle-primary,#3b6fd4);fill:var(--dsw-alias-state-idle-primary,#3b6fd4)}',
      '.dsh-iu2-sparkline[data-tone="success"] .dsh-iu2-sparkline-line,.dsh-iu2-sparkline[data-tone="success"] .dsh-iu2-sparkline-dot{stroke:var(--dsw-alias-state-success-primary,#12854a);fill:var(--dsw-alias-state-success-primary,#12854a)}',
      '.dsh-iu2-sparkline[data-tone="warn"] .dsh-iu2-sparkline-line,.dsh-iu2-sparkline[data-tone="warn"] .dsh-iu2-sparkline-dot{stroke:var(--dsw-alias-state-warn-primary,#b06a00);fill:var(--dsw-alias-state-warn-primary,#b06a00)}',
      '.dsh-iu2-sparkline[data-tone="error"] .dsh-iu2-sparkline-line,.dsh-iu2-sparkline[data-tone="error"] .dsh-iu2-sparkline-dot{stroke:var(--dsw-alias-state-error-primary,#c62828);fill:var(--dsw-alias-state-error-primary,#c62828)}',
      '.dsh-iu2-sparkline[data-tone="neutral"] .dsh-iu2-sparkline-line,.dsh-iu2-sparkline[data-tone="neutral"] .dsh-iu2-sparkline-dot{stroke:var(--dsw-alias-label-secondary,#5a6474);fill:var(--dsw-alias-label-secondary,#5a6474)}',
      // v6 chart tooltip + click selection.
      '.dsh-iu2-chart-wrap{position:relative;min-width:0}',
      '.dsh-iu2-chart-tooltip{position:absolute;z-index:1;max-width:240px;padding:4px 8px;transform:translate(-50%,-115%);border:0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1));border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1b1f27);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px);box-shadow:var(--dsw-elevation-panel,0 2px 8px rgba(0,0,0,.08));pointer-events:none;white-space:nowrap}',
      '.dsh-iu2-chart-tooltip-line{display:block}',
      '.dsh-iu2-chart-mark[data-selected="true"]{stroke:var(--dsw-alias-state-business-primary,#2f6bff);stroke-width:2}',
      '.dsh-iu2-chart-wrap[data-selectable="true"] .dsh-iu2-chart-mark{cursor:pointer}',
      '.dsh-iu2-chart-mark:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#2f6bff);outline-offset:1px}',
      // v6.2 Phase 2 streaming control preview.
      '.dsh-iu2-preview{border-style:dashed}',
      '.dsh-iu2-preview-head{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dsh-iu2-preview-badge{flex:none;display:inline-flex;align-items:center;padding:0 7px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6bff) 12%,transparent);color:var(--dsw-alias-state-business-primary,#2f6bff);font-size:var(--dsw-font-xxxs-11-font-size,11px);line-height:var(--dsw-font-xxxs-11-line-height,14px);font-weight:500}',
      '.dsh-iu2-preview-tab-label{color:var(--dsw-alias-label-secondary,#5a6474);font-size:var(--dsw-font-xxs-strong-12-font-size,12px);line-height:var(--dsw-font-xxs-strong-12-line-height,18px);font-weight:500}',
      '.dsh-iu2-card :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#2f6bff);outline-offset:1px}',
    ].join('')

    /** Palette roles for chart series; tokens first, neutral literals as fallback. */
    const SERIES_COLORS = [
      'var(--dsw-alias-state-business-primary,#2f6bff)',
      'var(--dsw-alias-state-success-primary,#12854a)',
      'var(--dsw-alias-state-warn-primary,#b06a00)',
      'var(--dsw-alias-state-error-primary,#c62828)',
      'var(--dsw-alias-state-idle-primary,#3b6fd4)',
      'var(--dsw-alias-label-tertiary,#8a93a3)',
    ]

    const CHART_WIDTH = 320
    const CHART_PADDING = { top: 10, right: 8, bottom: 22, left: 44 }
    const INTERACTIVE_KINDS = ['slider', 'switch', 'checkbox', 'select', 'radio', 'number', 'input', 'textarea', 'choice', 'stepper', 'rating', 'checklist', 'chart']
    /** v6: only these chart modes can carry an `id` and be click-selected. */
    const SELECTABLE_CHART_MODES = ['bar', 'line', 'area', 'pie', 'donut']
    /** v3 layout containers; their children recurse through the same NodeView. */
    const CONTAINER_KINDS = ['section', 'box', 'row', 'columns', 'grid', 'tabs', 'list']
    /** Inline RichText link bound (CONTRACT.md §13.3). */
    const INLINE_URL_MAX = 2048
    /** v3 chart modes beyond the v2 bar/line pair. */
    const CHART_MODES = ['bar', 'line', 'area', 'pie', 'donut', 'scatter', 'heatmap']

    /* ------------------------------------------------------------------ *
     * Small data helpers
     * ------------------------------------------------------------------ */

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }

    function hasOwn(target, key) {
      return isRecord(target) && Object.prototype.hasOwnProperty.call(target, key)
    }

    function isFiniteNumber(value) {
      return typeof value === 'number' && Number.isFinite(value)
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    function round2(value) {
      return Math.round(value * 100) / 100
    }

    function isInteractiveKind(kind) {
      return INTERACTIVE_KINDS.indexOf(kind) !== -1
    }

    function isContainerKind(kind) {
      return CONTAINER_KINDS.indexOf(kind) !== -1
    }

    /**
     * Direct child arrays of one node, in render order. Plain containers carry
     * `children`; `columns` carries one array per column; `tabs` one per tab.
     */
    function childGroupsOf(node) {
      if (!isRecord(node)) return []
      if (node.kind === 'section' || node.kind === 'box' || node.kind === 'row' || node.kind === 'grid') {
        return Array.isArray(node.children) ? [node.children] : []
      }
      if (node.kind === 'columns') {
        const groups = []
        if (Array.isArray(node.columns)) {
          for (const column of node.columns) {
            if (isRecord(column) && Array.isArray(column.children)) groups.push(column.children)
          }
        }
        return groups
      }
      if (node.kind === 'tabs') {
        const groups = []
        if (Array.isArray(node.tabs)) {
          for (const tab of node.tabs) {
            if (isRecord(tab) && Array.isArray(tab.children)) groups.push(tab.children)
          }
        }
        return groups
      }
      // v4 list: the template is one node subtree; items never repeat nodes.
      if (node.kind === 'list') {
        return isRecord(node.template) ? [[node.template]] : []
      }
      return []
    }

    /** Depth-first walk of every node, hidden or not, in render order. */
    function walkNodes(nodes, visit) {
      if (!Array.isArray(nodes)) return
      for (const node of nodes) {
        if (!isRecord(node)) continue
        visit(node)
        if (!isContainerKind(node.kind)) continue
        for (const group of childGroupsOf(node)) walkNodes(group, visit)
      }
    }

    /** Deterministic child path groups, mirroring the render prefixes. */
    function childPathGroups(node, path) {
      if (!isRecord(node)) return []
      if (node.kind === 'section' || node.kind === 'box' || node.kind === 'row' || node.kind === 'grid') {
        return Array.isArray(node.children) ? [{ nodes: node.children, path }] : []
      }
      if (node.kind === 'columns') {
        const groups = []
        if (Array.isArray(node.columns)) {
          for (let index = 0; index < node.columns.length; index++) {
            const column = node.columns[index]
            if (isRecord(column) && Array.isArray(column.children)) groups.push({ nodes: column.children, path: path + '.c' + index })
          }
        }
        return groups
      }
      if (node.kind === 'tabs') {
        const groups = []
        if (Array.isArray(node.tabs)) {
          for (let index = 0; index < node.tabs.length; index++) {
            const tab = node.tabs[index]
            if (isRecord(tab) && Array.isArray(tab.children)) groups.push({ nodes: tab.children, path: path + '.t' + index })
          }
        }
        return groups
      }
      return []
    }

    /** v3/v4: depth-first walk with a deterministic node path; lists are leaves. */
    function walkTree(nodes, pathPrefix, visit) {
      if (!Array.isArray(nodes)) return
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index]
        if (!isRecord(node)) continue
        const path = pathPrefix + '.' + index
        visit(node, path)
        if (node.kind === 'list') continue
        if (!isContainerKind(node.kind)) continue
        for (const group of childPathGroups(node, path)) walkTree(group.nodes, group.path, visit)
      }
    }

    /** Same walk, skipping hidden nodes and hidden container subtrees. */
    function walkVisibleTree(nodes, pathPrefix, scope, visit) {
      if (!Array.isArray(nodes)) return
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index]
        if (!isRecord(node)) continue
        if (!isVisibleNode(node, scope)) continue
        const path = pathPrefix + '.' + index
        visit(node, path)
        if (node.kind === 'list') continue
        if (!isContainerKind(node.kind)) continue
        for (const group of childPathGroups(node, path)) walkVisibleTree(group.nodes, group.path, scope, visit)
      }
    }

    /** Resolved `itemName` for one list (default `item`, invalid → `item`). */
    function itemNameOf(node) {
      return isRecord(node) && typeof node.itemName === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.itemName)
        ? node.itemName
        : 'item'
    }

    /**
     * v6.1 internal state key: node path + item index + control id. Never part
     * of the program and deliberately stable across renders/draft replays.
     */
    function listItemKey(listPath, itemIndex, controlId) {
      return String(listPath) + '#i' + String(itemIndex) + '#' + String(controlId)
    }

    /** The field used as each item's label (§17.1): explicit, else first string. */
    function listLabelField(node) {
      if (!isRecord(node)) return undefined
      if (typeof node.itemLabel === 'string' && node.itemLabel !== '') return node.itemLabel
      const items = Array.isArray(node.items) ? node.items : []
      for (const item of items) {
        if (!isRecord(item)) continue
        for (const key of Object.keys(item)) {
          if (typeof item[key] === 'string') return key
        }
      }
      return undefined
    }

    /** One item's label value, falling back to `[index]`. */
    function listItemLabelText(field, item, index) {
      if (typeof field === 'string' && isRecord(item) && hasOwn(item, field)) {
        const value = item[field]
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
      }
      return '[' + String(index) + ']'
    }

    /** Whether an item's own field has the value type a template control wants. */
    function itemValueMatches(control, value) {
      if (!isRecord(control)) return false
      if (control.kind === 'switch' || control.kind === 'checkbox') return typeof value === 'boolean'
      if (control.kind === 'slider' || control.kind === 'number' || control.kind === 'stepper' || control.kind === 'rating') {
        return typeof value === 'number' && Number.isFinite(value)
      }
      return typeof value === 'string'
    }

    /** Per-item start value: item's own same-named field, else the control initial. */
    function itemInitialValue(control, item) {
      if (!isRecord(control) || typeof control.id !== 'string') return undefined
      if (isRecord(item) && hasOwn(item, control.id) && itemValueMatches(control, item[control.id])) {
        return coerceInitial(control, item[control.id])
      }
      return coerceInitial(control, hasOwn(control, 'initial') ? control.initial : undefined)
    }

    /** The single interactive control inside a list template, if any (§17.1). */
    function findTemplateControl(template) {
      let found
      const walk = (node) => {
        if (found !== undefined || !isRecord(node)) return
        if (isInteractiveKind(node.kind) && typeof node.id === 'string' && node.id !== '') {
          found = node
          return
        }
        if (!isContainerKind(node.kind) || node.kind === 'list') return
        for (const group of childGroupsOf(node)) {
          for (const child of group) walk(child)
        }
      }
      walk(template)
      return found
    }

    /** Visible interactive controls of a template under one item scope (≤1). */
    function visibleTemplateControls(template, scope) {
      const output = []
      const walk = (node, visible) => {
        if (!visible || !isRecord(node)) return
        if (isInteractiveKind(node.kind) && typeof node.id === 'string' && node.id !== '') {
          output.push(node)
          return
        }
        if (!isContainerKind(node.kind) || node.kind === 'list') return
        for (const group of childGroupsOf(node)) {
          for (const child of group) walk(child, isVisibleNode(child, scope))
        }
      }
      walk(template, isVisibleNode(template, scope))
      return output
    }

    /** Whether one required control is unsatisfied (§7/§17.1). */
    function requiredIssue(node, value) {
      if (!isRecord(node)) return false
      if (node.kind === 'input' || node.kind === 'textarea') return !(typeof value === 'string' && value.trim() !== '')
      if (node.kind === 'switch' || node.kind === 'checkbox') return value !== true
      if (node.kind === 'rating') return !(typeof value === 'number' && Number.isFinite(value) && value >= 1)
      if (node.kind === 'checklist') return checklistValues(node, value).length === 0
      if (node.kind === 'chart') {
        const categories = Array.isArray(node.categories) ? node.categories : []
        return !(typeof value === 'string' && value !== '' && categories.some((category) => String(category) === value))
      }
      return false
    }

    /** Total node count of one program tree (containers included). */
    function nodeCount(meta) {
      let count = 0
      if (!isRecord(meta)) return count
      walkNodes(meta.nodes, () => {
        count += 1
      })
      return count
    }

    /** One http/https URL, or `undefined` for anything else (§13.2/§13.3). */
    function safeHttpUrl(value) {
      if (typeof value !== 'string') return undefined
      const text = value.trim()
      if (text === '' || text.length > INLINE_URL_MAX) return undefined
      return /^https?:\/\/\S+$/i.test(text) ? text : undefined
    }

    /** Border-radius token name → theme variable, or `undefined`. */
    function radiusOf(token) {
      if (token === 'none') return '0'
      if (token === 'sm') return 'var(--dsw-radius-sm,4px)'
      if (token === 'md') return 'var(--dsw-radius-md,8px)'
      if (token === 'lg') return 'var(--dsw-radius-lg,12px)'
      if (token === 'xl') return 'var(--dsw-radius-xl,16px)'
      return undefined
    }

    /** Numeric 0..8 spacing fields (box gap/padding, row gap, grid gap). */
    function spaceOf(value) {
      return isFiniteNumber(value) ? clamp(value, 0, 8) + 'px' : undefined
    }

    /** v3 box background role → theme token. */
    function backgroundOf(token) {
      if (token === 'base') return 'var(--dsw-alias-bg-base,#fff)'
      if (token === 'layer-1') return 'var(--dsw-alias-bg-layer-1,#fff)'
      if (token === 'layer-2') return 'var(--dsw-alias-bg-layer-2,#f5f6f9)'
      if (token === 'muted') return 'var(--dsw-alias-bg-layer-3,#eceef4)'
      return undefined
    }

    /**
     * Inline RichText markup (§13.3): `**bold**`, `*italic*`, `` `code` `` and
     * `[text](target)`. Only safe http(s) targets become links; HTML is never
     * interpreted and an unsafe/unparsable link stays literal. Returns a flat
     * token list; nesting recurses for bold/italic.
     */
    function parseInlineText(text, depth) {
      if (typeof text !== 'string' || text === '') return []
      const level = isFiniteNumber(depth) ? depth : 0
      if (level > 8) return [text]
      const output = []
      let buffer = ''
      let index = 0
      const flush = () => {
        if (buffer !== '') {
          output.push(buffer)
          buffer = ''
        }
      }
      while (index < text.length) {
        const char = text[index]
        if (char === '`') {
          const end = text.indexOf('`', index + 1)
          if (end > index + 1) {
            flush()
            output.push({ kind: 'code', text: text.slice(index + 1, end) })
            index = end + 1
            continue
          }
        }
        if (char === '*' && text[index + 1] === '*') {
          const end = text.indexOf('**', index + 2)
          if (end > index + 2) {
            flush()
            output.push({ kind: 'strong', children: parseInlineText(text.slice(index + 2, end), level + 1) })
            index = end + 2
            continue
          }
        }
        if (char === '*') {
          let end = -1
          for (let cursor = index + 1; cursor < text.length; cursor++) {
            if (text[cursor] !== '*') continue
            if (text[cursor + 1] === '*') break
            end = cursor
            break
          }
          if (end > index + 1 && text[index + 1] !== ' ' && text[end - 1] !== ' ') {
            flush()
            output.push({ kind: 'em', children: parseInlineText(text.slice(index + 1, end), level + 1) })
            index = end + 1
            continue
          }
        }
        if (char === '[') {
          const close = text.indexOf(']', index + 1)
          if (close > index + 1 && text[close + 1] === '(') {
            const end = text.indexOf(')', close + 2)
            if (end > close + 2) {
              const href = safeHttpUrl(text.slice(close + 2, end))
              if (href !== undefined) {
                flush()
                output.push({ kind: 'link', href, children: parseInlineText(text.slice(index + 1, close), level + 1) })
                index = end + 1
                continue
              }
            }
          }
        }
        buffer += char
        index += 1
      }
      flush()
      return output
    }

    /** Turn inline tokens into React children (keys per sibling list). */
    function inlineNodes(tokens, keyPrefix) {
      const output = []
      if (!Array.isArray(tokens)) return output
      for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index]
        const key = keyPrefix + '-' + index
        if (typeof token === 'string') {
          output.push(token)
          continue
        }
        if (!isRecord(token)) continue
        if (token.kind === 'strong') {
          output.push(h('strong', { key, className: 'dsh-iu2-strong' }, inlineNodes(token.children, key)))
        } else if (token.kind === 'em') {
          output.push(h('em', { key, className: 'dsh-iu2-em' }, inlineNodes(token.children, key)))
        } else if (token.kind === 'code') {
          output.push(h('code', { key, className: 'dsh-iu2-code' }, typeof token.text === 'string' ? token.text : ''))
        } else if (token.kind === 'link') {
          output.push(h('a', {
            key,
            className: 'dsh-iu2-inline-link',
            href: token.href,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, inlineNodes(token.children, key)))
        }
      }
      return output
    }

    /**
     * RichText → React children with inline markup. Expression parts are plain
     * text (§13.3), literals go through the inline tokenizer.
     */
    function richContent(rich, scope, keyPrefix) {
      const prefix = typeof keyPrefix === 'string' ? keyPrefix : 'rich'
      if (rich === undefined || rich === null) return []
      if (typeof rich === 'string') return inlineNodes(parseInlineText(rich), prefix)
      if (typeof rich === 'number' || typeof rich === 'boolean') return [String(rich)]
      if (!isRecord(rich) || !Array.isArray(rich.parts)) return []
      const output = []
      for (let index = 0; index < rich.parts.length; index++) {
        const part = rich.parts[index]
        if (!isRecord(part)) continue
        if (part.k === 'lit') {
          const text = typeof part.v === 'string' ? part.v : part.v === undefined || part.v === null ? '' : String(part.v)
          output.push.apply(output, inlineNodes(parseInlineText(text), prefix + '-' + index))
        } else if (part.k === 'expr') {
          const value = evalExpr(part.e, scope)
          if (value !== undefined && value !== null) output.push(String(value))
        }
      }
      return output
    }

    /** Substituted, fallback-backed card text (CONTRACT.md §8 locale seat). */
    function translator(t) {
      return function translate(key, params) {
        let text
        if (typeof t === 'function') {
          try {
            text = t(key, params)
          } catch (error) {
            text = undefined
          }
        }
        if (typeof text !== 'string' || text === key) text = FALLBACK_MESSAGES[key] !== undefined ? FALLBACK_MESSAGES[key] : key
        if (isRecord(params)) {
          for (const name of Object.keys(params)) text = text.split('{' + name + '}').join(String(params[name]))
        }
        return text
      }
    }

    function errorMessage(reason) {
      if (reason === undefined || reason === null) return 'unknown error'
      if (typeof reason === 'string') return reason
      if (typeof reason.message === 'string' && reason.message !== '') return reason.message
      return String(reason)
    }

    /** Format one chart value according to `valueFormat` (CONTRACT.md §4.1). */
    function formatNumber(value, mode) {
      if (!isFiniteNumber(value)) return ''
      if (mode === 'percent') return String(Number(value.toFixed(1))) + '%'
      if (mode === 'currency') {
        try {
          return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
        } catch (error) {
          return '$' + String(round2(value))
        }
      }
      try {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
      } catch (error) {
        return String(value)
      }
    }

    /* ------------------------------------------------------------------ *
     * Expression interpreter (CONTRACT.md §5)
     * ------------------------------------------------------------------ */

    /** Truthiness exactly as §5.2 defines it. */
    function truthy(value) {
      if (value === undefined || value === null || value === false) return false
      if (value === true) return true
      if (typeof value === 'number') return value !== 0
      if (typeof value === 'string') return value !== ''
      return true
    }

    function evalBinary(expr, scope) {
      const op = expr.op
      const left = evalExpr(expr.a, scope)
      const right = evalExpr(expr.b, scope)
      if (op === '+') {
        if (isFiniteNumber(left) && isFiniteNumber(right)) return left + right
        if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right)
        return undefined
      }
      if (op === '-' || op === '*' || op === '/' || op === '%') {
        if (!isFiniteNumber(left) || !isFiniteNumber(right)) return undefined
        if ((op === '/' || op === '%') && right === 0) return undefined
        let result
        if (op === '-') result = left - right
        else if (op === '*') result = left * right
        else if (op === '/') result = left / right
        else result = left % right
        return Number.isFinite(result) ? result : undefined
      }
      if (op === '<' || op === '<=' || op === '>' || op === '>=') {
        const bothNumbers = isFiniteNumber(left) && isFiniteNumber(right)
        const bothStrings = typeof left === 'string' && typeof right === 'string'
        if (!bothNumbers && !bothStrings) return undefined
        if (op === '<') return left < right
        if (op === '<=') return left <= right
        if (op === '>') return left > right
        return left >= right
      }
      if (op === '==' || op === '!=') {
        const sameType = typeof left === typeof right && (typeof left === 'number' || typeof left === 'string' || typeof left === 'boolean')
        if (!sameType) return undefined
        return op === '==' ? left === right : left !== right
      }
      return undefined
    }

    /**
     * Evaluate one compiled expression. Anything malformed, unknown, or
     * ill-typed evaluates to `undefined`; rendering turns that into ``.
     */
    function evalExpr(expr, scope) {
      if (!isRecord(expr)) return undefined
      if (expr.t === 'lit') return expr.v
      if (expr.t === 'ref') {
        if (typeof expr.name !== 'string' || !isRecord(scope)) return undefined
        const dot = expr.name.indexOf('.')
        if (dot === -1) return hasOwn(scope, expr.name) ? scope[expr.name] : undefined
        // v4 (§14.1): the only allowed property access is `itemName.field`,
        // exactly one level. A non-object base or a missing field is undefined.
        const base = expr.name.slice(0, dot)
        const field = expr.name.slice(dot + 1)
        if (base === '' || field === '' || field.indexOf('.') !== -1) return undefined
        if (!hasOwn(scope, base)) return undefined
        const container = scope[base]
        if (!isRecord(container)) return undefined
        return hasOwn(container, field) ? container[field] : undefined
      }
      if (expr.t === 'un') {
        const value = evalExpr(expr.a, scope)
        if (expr.op === '!') return !truthy(value)
        if (expr.op === '-') return isFiniteNumber(value) ? -value : undefined
        return undefined
      }
      if (expr.t === 'bin') return evalBinary(expr, scope)
      if (expr.t === 'and') return truthy(evalExpr(expr.a, scope)) && truthy(evalExpr(expr.b, scope))
      if (expr.t === 'or') return truthy(evalExpr(expr.a, scope)) || truthy(evalExpr(expr.b, scope))
      if (expr.t === 'cond') return truthy(evalExpr(expr.c, scope)) ? evalExpr(expr.a, scope) : evalExpr(expr.b, scope)
      return undefined
    }

    /** Evaluate one RichText into plain text; `undefined` renders as ``. */
    function evalRichText(rich, scope) {
      if (rich === undefined || rich === null) return ''
      if (typeof rich === 'string') return rich
      if (typeof rich === 'number' || typeof rich === 'boolean') return String(rich)
      if (!isRecord(rich) || !Array.isArray(rich.parts)) return ''
      let text = ''
      for (const part of rich.parts) {
        if (!isRecord(part)) continue
        if (part.k === 'lit') {
          text += typeof part.v === 'string' ? part.v : part.v === undefined || part.v === null ? '' : String(part.v)
        } else if (part.k === 'expr') {
          const value = evalExpr(part.e, scope)
          text += value === undefined || value === null ? '' : String(value)
        }
      }
      return text
    }

    /** Tolerate a cell that is still a plain string while the contract says RichText. */
    function plainText(value, scope) {
      return evalRichText(value, scope)
    }

    /* ------------------------------------------------------------------ *
     * Program interpretation helpers (CONTRACT.md §6)
     * ------------------------------------------------------------------ */

    /**
     * Scope visible to expressions: exactly the current control values. The
     * Host folds `spec.state` into each node's `initial`, so the compiled
     * program carries no separate state table (confirmed against lib/compile.js).
     */
    function buildScope(values) {
      const scope = {}
      if (isRecord(values)) {
        for (const key of Object.keys(values)) scope[key] = values[key]
      }
      return scope
    }

    /** v4 list item scope: the current scope with `itemName` overlaid (§14.1). */
    function itemScopeOf(scope, itemName, item) {
      const merged = {}
      if (isRecord(scope)) {
        for (const key of Object.keys(scope)) merged[key] = scope[key]
      }
      merged[itemName] = item
      return merged
    }

    function coerceInitial(node, raw) {
      if (node.kind === 'slider') {
        const min = isFiniteNumber(node.min) ? node.min : 0
        const max = isFiniteNumber(node.max) ? node.max : 100
        const number = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(number)) return min
        return clamp(number, Math.min(min, max), Math.max(min, max))
      }
      if (node.kind === 'number') {
        const number = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(number)) return isFiniteNumber(node.min) ? node.min : 0
        let value = number
        if (isFiniteNumber(node.min)) value = Math.max(node.min, value)
        if (isFiniteNumber(node.max)) value = Math.min(node.max, value)
        return value
      }
      if (node.kind === 'stepper') {
        // The Host owns the validated `initial`; only clamp it here. Step
        // alignment is applied by the +/- nudge, never to a stored value.
        const min = isFiniteNumber(node.min) ? node.min : 0
        const max = isFiniteNumber(node.max) ? node.max : 100
        const number = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(number)) return min
        return clamp(number, Math.min(min, max), Math.max(min, max))
      }
      if (node.kind === 'rating') {
        const max = isFiniteNumber(node.max) ? Math.round(node.max) : 5
        const number = typeof raw === 'number' ? raw : Number(raw)
        if (!Number.isFinite(number)) return 0
        return clamp(Math.round(number), 0, max)
      }
      if (node.kind === 'checklist') {
        if (typeof raw === 'string') return raw
        return raw === undefined || raw === null ? '' : String(raw)
      }
      if (node.kind === 'chart') {
        if (typeof raw === 'string') return raw
        return raw === undefined || raw === null ? '' : String(raw)
      }
      if (node.kind === 'switch' || node.kind === 'checkbox') return raw === true
      if (node.kind === 'select' || node.kind === 'radio' || node.kind === 'choice') {
        if (raw === undefined || raw === null) {
          const options = Array.isArray(node.options) ? node.options : []
          const first = options.find((option) => isRecord(option) && typeof option.value === 'string')
          return first === undefined ? '' : first.value
        }
        return raw
      }
      if (node.kind === 'input' || node.kind === 'textarea') {
        if (typeof raw === 'string') return raw
        return raw === undefined || raw === null ? '' : String(raw)
      }
      return raw
    }

    /**
     * Local initial values. The Host has already folded `spec.state`, the
     * control's own `initial`, and the kind default into `node.initial`, so
     * that is the only source read here (CONTRACT.md §4/§6).
     */
    function initialState(meta) {
      const values = {}
      if (!isRecord(meta)) return values
      walkTree(meta.nodes, 'n', (node, path) => {
        if (node.kind === 'list') {
          // v6.1: the template's one interactive control gets one value per item,
          // under a stable internal key; it is never a global field id.
          const control = findTemplateControl(node.template)
          if (control === undefined || typeof control.id !== 'string') return
          const items = Array.isArray(node.items) ? node.items : []
          for (let index = 0; index < items.length; index++) {
            values[listItemKey(path, index, control.id)] = itemInitialValue(control, items[index])
          }
          return
        }
        if (!isInteractiveKind(node.kind)) return
        if (typeof node.id !== 'string' || node.id === '') return
        values[node.id] = coerceInitial(node, hasOwn(node, 'initial') ? node.initial : undefined)
      })
      return values
    }

    /** Whether one node should render under the current local values. */
    function isVisibleNode(node, scope) {
      if (!isRecord(node)) return false
      const visibleWhen = node.visibleWhen
      if (visibleWhen === undefined || visibleWhen === null) return true
      if (!isRecord(visibleWhen)) return true
      return truthy(evalExpr(visibleWhen, scope))
    }

    /** Plain label for one interactive control; chart labels fall back to §16.2. */
    function labelOf(node, scope) {
      const text = plainText(node.label, scope).trim()
      if (text !== '') return text
      if (node.kind === 'chart') {
        const title = typeof node.title === 'string' ? node.title.trim() : ''
        if (title !== '') return title
        return FALLBACK_MESSAGES['card.chart.selectLabel'] !== undefined ? FALLBACK_MESSAGES['card.chart.selectLabel'] : String(node.id)
      }
      return String(node.id)
    }

    /**
     * v5 checklist state is a comma-separated string in option order. This
     * normalizes any stored draft into the canonical selected values.
     */
    function checklistValues(node, raw) {
      const options = isRecord(node) && Array.isArray(node.options) ? node.options : []
      const text = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw)
      const chosen = {}
      if (text !== '') {
        for (const part of text.split(',')) {
          const value = part.trim()
          if (value !== '') chosen[value] = true
        }
      }
      const output = []
      for (const option of options) {
        if (!isRecord(option)) continue
        const value = typeof option.value === 'string' ? option.value : String(option.value)
        if (chosen[value] === true) output.push(value)
      }
      return output
    }

    /** One submitted value in the fixed message format (CONTRACT.md §7). */
    function fieldValue(node, value) {
      if (node.kind === 'switch' || node.kind === 'checkbox') return value === true ? 'on' : 'off'
      if (node.kind === 'checklist') return checklistValues(node, value).join(',')
      if (value === undefined || value === null) return ''
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      return String(value)
    }

    /**
     * The exact user-message text for one ask card submission, or `''` when the
     * card has nothing to send.
     */
    function formatSubmission(meta, values, note) {
      if (!isRecord(meta)) return ''
      const scope = buildScope(values)
      const title = typeof meta.title === 'string' && meta.title !== '' ? meta.title : 'Intelligent UI'
      const lines = ['[Intelligent UI] ' + title]
      let fields = 0
      const read = (key) => (values === undefined || values === null ? undefined : values[key])
      const appendField = (node, nodeScope, value, prefix) => {
        // An optional empty text field is not an answer; keep it out of the
        // message instead of emitting a dangling "- Label: " line.
        if ((node.kind === 'input' || node.kind === 'textarea') && node.required !== true) {
          if (typeof value !== 'string' || value.trim() === '') return
        }
        lines.push('- ' + (prefix === undefined ? '' : prefix + ' / ') + labelOf(node, nodeScope) + ': ' + fieldValue(node, value))
        fields += 1
      }
      // v3/v6.1: depth-first render order; a hidden container hides its subtree,
      // and each list item contributes its own line.
      walkVisibleTree(meta.nodes, 'n', scope, (node, path) => {
        if (node.kind === 'list') {
          const control = findTemplateControl(node.template)
          if (control === undefined || typeof control.id !== 'string') return
          const items = Array.isArray(node.items) ? node.items : []
          const itemName = itemNameOf(node)
          const labelField = listLabelField(node)
          for (let index = 0; index < items.length; index++) {
            const item = items[index]
            if (!isRecord(item)) continue
            const itemScope = itemScopeOf(scope, itemName, item)
            for (const templateControl of visibleTemplateControls(node.template, itemScope)) {
              const key = listItemKey(path, index, templateControl.id)
              appendField(templateControl, itemScope, read(key), listItemLabelText(labelField, item, index))
            }
          }
          return
        }
        if (!isInteractiveKind(node.kind)) return
        if (typeof node.id !== 'string' || node.id === '') return
        appendField(node, scope, read(node.id), undefined)
      })
      const allowNote = !(isRecord(meta.submit) && meta.submit.allowNote === false)
      const noteText = typeof note === 'string' ? note.trim() : ''
      const withNote = allowNote && noteText !== ''
      if (withNote) lines.push('note: ' + noteText)
      if (fields === 0 && !withNote) return ''
      return lines.join('\n')
    }

    /**
     * The required fields that are currently visible and still empty, per
     * CONTRACT.md §7/§8. Only `input`/`textarea` (non-empty after trim) and
     * `switch`/`checkbox` (true) can fail; the other interactive kinds always
     * hold a value.
     */
    function validationIssues(meta, values, scope) {
      if (!isRecord(meta)) return []
      const viewScope = isRecord(scope) ? scope : buildScope(values)
      const issues = []
      const read = (key) => (values === undefined || values === null ? undefined : values[key])
      walkVisibleTree(meta.nodes, 'n', viewScope, (node, path) => {
        if (node.kind === 'list') {
          const items = Array.isArray(node.items) ? node.items : []
          const itemName = itemNameOf(node)
          for (let index = 0; index < items.length; index++) {
            const item = items[index]
            if (!isRecord(item)) continue
            const itemScope = itemScopeOf(viewScope, itemName, item)
            for (const templateControl of visibleTemplateControls(node.template, itemScope)) {
              if (templateControl.required !== true) continue
              const key = listItemKey(path, index, templateControl.id)
              if (requiredIssue(templateControl, read(key))) {
                issues.push({ id: templateControl.id, kind: templateControl.kind, key })
              }
            }
          }
          return
        }
        if (node.required !== true) return
        if (typeof node.id !== 'string' || node.id === '') return
        if (requiredIssue(node, read(node.id))) issues.push({ id: node.id, kind: node.kind })
      })
      return issues
    }

    /* ------------------------------------------------------------------ *
     * Draft persistence (sessionStorage, v2.4)
     *
     * The card's local state is React state, but typing should survive a page
     * reload in the same tab. Drafts are keyed by session, turn, kind and
     * title, and are removed once a submission succeeds. Storage failures are
     * ignored: a card must keep working with storage disabled.
     * ------------------------------------------------------------------ */

    function storageOf() {
      try {
        if (typeof window === 'undefined' || window === null) return undefined
        const storage = window.sessionStorage
        return storage !== undefined && storage !== null && typeof storage.getItem === 'function' ? storage : undefined
      } catch (error) {
        return undefined
      }
    }

    function draftKeyOf(sessionId, turn, kind, title) {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined
      if (typeof turn !== 'number' || !Number.isFinite(turn)) return undefined
      const name = typeof title === 'string' ? title : ''
      return 'dsh-iu2:draft:' + sessionId + ':' + turn + ':' + (kind === 'ask' ? 'ask' : 'deliver') + ':' + encodeURIComponent(name.slice(0, 80))
    }

    function readDraft(storage, key) {
      if (storage === undefined || storage === null || typeof key !== 'string') return undefined
      try {
        const raw = storage.getItem(key)
        if (typeof raw !== 'string' || raw === '') return undefined
        const parsed = JSON.parse(raw)
        return isRecord(parsed) ? parsed : undefined
      } catch (error) {
        return undefined
      }
    }

    function saveDraft(storage, key, values, note) {
      if (storage === undefined || storage === null || typeof key !== 'string' || !isRecord(values)) return
      try {
        storage.setItem(key, JSON.stringify({ values, note: typeof note === 'string' ? note : '' }))
      } catch (error) {
        /* quota, private mode, disabled storage */
      }
    }

    function clearDraft(storage, key) {
      if (storage === undefined || storage === null || typeof key !== 'string') return
      try {
        storage.removeItem(key)
      } catch (error) {
        /* disabled storage */
      }
    }

    /** Merge a stored draft into fresh initial values, type-checked. */
    function draftValues(meta, stored) {
      const base = initialState(meta)
      if (!isRecord(stored)) return base
      const source = isRecord(stored.values) ? stored.values : {}
      for (const key of Object.keys(base)) {
        if (!hasOwn(source, key)) continue
        const current = base[key]
        const next = source[key]
        if (typeof current === 'number' && typeof next === 'number' && Number.isFinite(next)) base[key] = next
        else if (typeof current === 'boolean' && typeof next === 'boolean') base[key] = next
        else if (typeof current === 'string' && typeof next === 'string') base[key] = next
      }
      return base
    }

    /* ------------------------------------------------------------------ *
     * Tool result / turn lookup
     * ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ *
     * v4.1 streaming source skeleton (CONTRACT.md §14.6)
     *
     * While a call is still streaming, only the top-level string argument
     * `source` is partially readable (`block.args.text('source')`). The preview
     * never compiles or interacts; it only surfaces a tolerant title/description
     * so the user sees the card taking shape.
     * ------------------------------------------------------------------ */

    /** Decode one JSON string token from `start` (the opening quote), tolerantly. */
    function decodeJsonStringPrefix(text, start) {
      let index = start + 1
      let value = ''
      while (index < text.length) {
        const char = text[index]
        if (char === '"') return { value, end: index + 1, complete: true }
        if (char !== '\\') {
          value += char
          index += 1
          continue
        }
        const next = text[index + 1]
        if (next === undefined) {
          value += '\\'
          index += 1
          continue
        }
        if (next === '"' || next === '\\' || next === '/') {
          value += next
          index += 2
          continue
        }
        if (next === 'b') { value += '\b'; index += 2; continue }
        if (next === 'f') { value += '\f'; index += 2; continue }
        if (next === 'n') { value += '\n'; index += 2; continue }
        if (next === 'r') { value += '\r'; index += 2; continue }
        if (next === 't') { value += '\t'; index += 2; continue }
        if (next === 'u') {
          const hex = text.slice(index + 2, index + 6)
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            value += String.fromCharCode(parseInt(hex, 16))
            index += 6
            continue
          }
          // Incomplete or malformed unicode escape: keep the fragment we have.
          value += text.slice(index)
          index = text.length
          continue
        }
        // Unknown escape: keep it literal instead of throwing.
        value += '\\' + next
        index += 2
      }
      return { value, end: text.length, complete: false }
    }

    /** Top-level `title` / `description` of a possibly-incomplete spec JSON text. */
    function extractPartialSource(text) {
      const result = {}
      if (typeof text !== 'string' || text === '') return result
      let index = 0
      let depth = 0
      while (index < text.length) {
        const char = text[index]
        if (char === '"') {
          const token = decodeJsonStringPrefix(text, index)
          let cursor = token.end
          while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1
          if (depth === 1 && text[cursor] === ':') {
            let valueStart = cursor + 1
            while (valueStart < text.length && /\s/.test(text[valueStart])) valueStart += 1
            if (text[valueStart] === '"' && (token.value === 'title' || token.value === 'description') &&
              result[token.value] === undefined) {
              const value = decodeJsonStringPrefix(text, valueStart)
              result[token.value] = value.value
              index = value.end
              continue
            }
          }
          index = token.end
          continue
        }
        if (char === '{' || char === '[') {
          depth += 1
          index += 1
          continue
        }
        if (char === '}' || char === ']') {
          depth = Math.max(0, depth - 1)
          index += 1
          continue
        }
        index += 1
      }
      return result
    }

    /** The partial `source` argument text a streaming block carries so far. */
    function sourceTextOf(block) {
      if (!isRecord(block)) return ''
      const args = block.args
      if (!isRecord(args) || typeof args.text !== 'function') return ''
      try {
        const text = args.text('source')
        return typeof text === 'string' ? text : ''
      } catch (error) {
        return ''
      }
    }

    /**
     * Skeleton data for a streaming block, or `undefined` while no `source`
     * text has arrived (the generic preparing placeholder stays in that case).
     */
    function sourceSkeletonOf(block) {
      const text = sourceTextOf(block)
      // No usable text yet (absent, empty or whitespace) keeps the placeholder.
      if (typeof text !== 'string' || text.trim() === '') return undefined
      const partial = extractPartialSource(text)
      return {
        title: typeof partial.title === 'string' ? partial.title : '',
        description: typeof partial.description === 'string' ? partial.description : '',
      }
    }

    /* ------------------------------------------------------------------ *
     * v6.2 Phase 2: tolerant preview of a still-streaming spec (§14.6)
     *
     * The preview never compiles, evaluates or validates. It repairs the JSON
     * text as far as it is complete, keeps only fully closed nodes, and renders
     * them through the normal component tree with a disabled, read-only context.
     * ------------------------------------------------------------------ */

    function skipJsonSpace(state) {
      while (state.index < state.text.length && /\s/.test(state.text[state.index])) state.index += 1
    }

    function parsePartialString(state) {
      const result = decodeJsonStringPrefix(state.text, state.index)
      state.index = result.end
      return { value: result.value, complete: result.complete }
    }

    function parsePartialLiteral(state) {
      const text = state.text
      const index = state.index
      for (const literal of ['true', 'false', 'null']) {
        if (text.startsWith(literal, index)) {
          state.index = index + literal.length
          return { value: literal === 'null' ? null : literal === 'true', complete: true }
        }
      }
      return undefined
    }

    function parsePartialNumber(state) {
      const text = state.text
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(state.index))
      if (match === null) return undefined
      const raw = match[0]
      const end = state.index + raw.length
      const next = end >= text.length ? '' : text[end]
      if (next !== '' && !/[\s,\]}]/.test(next)) return undefined
      const value = Number(raw)
      state.index = end
      return { value, complete: true }
    }

    function parsePartialValue(state) {
      skipJsonSpace(state)
      if (state.index >= state.text.length) return undefined
      const char = state.text[state.index]
      if (char === '{') return parsePartialObject(state)
      if (char === '[') return parsePartialArray(state)
      if (char === '"') return parsePartialString(state)
      if (char === 't' || char === 'f' || char === 'n') return parsePartialLiteral(state)
      if (char === '-' || (char >= '0' && char <= '9')) return parsePartialNumber(state)
      return undefined
    }

    function parsePartialObject(state) {
      const object = {}
      state.index += 1
      for (;;) {
        skipJsonSpace(state)
        if (state.index >= state.text.length) return { value: object, complete: false }
        const char = state.text[state.index]
        if (char === '}') {
          state.index += 1
          return { value: object, complete: true }
        }
        if (char === ',') {
          state.index += 1
          continue
        }
        if (char !== '"') return { value: object, complete: false }
        const key = parsePartialString(state)
        if (key === undefined || !key.complete) return { value: object, complete: false }
        skipJsonSpace(state)
        if (state.index >= state.text.length || state.text[state.index] !== ':') {
          return { value: object, complete: false }
        }
        state.index += 1
        const value = parsePartialValue(state)
        if (value === undefined) return { value: object, complete: false }
        if (!value.complete) {
          // Keep the largest stable value: partial strings for the title
          // skeleton, partial arrays/objects so already-closed controls remain
          // previewable. Arrays never include an unfinished element.
          object[key.value] = value.value
          return { value: object, complete: false }
        }
        object[key.value] = value.value
        skipJsonSpace(state)
        if (state.index >= state.text.length) return { value: object, complete: false }
        if (state.text[state.index] === ',') {
          state.index += 1
          continue
        }
        if (state.text[state.index] === '}') {
          state.index += 1
          return { value: object, complete: true }
        }
        return { value: object, complete: false }
      }
    }

    function parsePartialArray(state) {
      const array = []
      state.index += 1
      for (;;) {
        skipJsonSpace(state)
        if (state.index >= state.text.length) return { value: array, complete: false }
        const char = state.text[state.index]
        if (char === ']') {
          state.index += 1
          return { value: array, complete: true }
        }
        if (char === ',') {
          state.index += 1
          continue
        }
        const value = parsePartialValue(state)
        if (value === undefined) return { value: array, complete: false }
        if (!value.complete) return { value: array, complete: false }
        array.push(value.value)
        skipJsonSpace(state)
        if (state.index >= state.text.length) return { value: array, complete: false }
        if (state.text[state.index] === ',') {
          state.index += 1
          continue
        }
        if (state.text[state.index] === ']') {
          state.index += 1
          return { value: array, complete: true }
        }
        return { value: array, complete: false }
      }
    }

    /** Repair one possibly-incomplete JSON text into the largest stable value. */
    function parsePartialJson(text) {
      if (typeof text !== 'string' || text.trim() === '') return { value: undefined, complete: false }
      const state = { text, index: 0 }
      try {
        skipJsonSpace(state)
        if (state.index >= text.length) return { value: undefined, complete: false }
        const result = parsePartialValue(state)
        if (result === undefined) return { value: undefined, complete: false }
        return { value: result.value, complete: result.complete }
      } catch (error) {
        return { value: undefined, complete: false }
      }
    }

    /* ---- Preview normalizer: raw spec JSON → read-only node tree ---- */

    function previewTextValue(value) {
      return typeof value === 'string' ? value : undefined
    }

    function previewNumberValue(value) {
      return isFiniteNumber(value) ? value : undefined
    }

    function previewOptions(value) {
      const output = []
      if (!Array.isArray(value)) return output
      for (const option of value) {
        if (!isRecord(option) || typeof option.value !== 'string') continue
        const normalized = { value: option.value }
        if (typeof option.label === 'string') normalized.label = option.label
        if (typeof option.description === 'string') normalized.description = option.description
        output.push(normalized)
      }
      return output
    }

    function previewNodes(value) {
      const output = []
      if (!Array.isArray(value)) return output
      for (const raw of value) {
        // A streaming source is not compiled yet; keep the preview bounded even
        // if the model writes far beyond the eventual node limit.
        if (output.length >= 120) break
        const node = normalizePreviewNode(raw)
        if (node !== undefined) output.push(node)
      }
      return output
    }

    function normalizePreviewChart(raw) {
      const allowed = ['bar', 'line', 'area', 'pie', 'donut', 'scatter', 'heatmap']
      const chart = allowed.indexOf(raw.chart) !== -1 ? raw.chart : 'bar'
      const node = { kind: 'chart', chart }
      if (Array.isArray(raw.categories)) node.categories = raw.categories.filter((value) => typeof value === 'string')
      if (isFiniteNumber(raw.height)) node.height = raw.height
      if (raw.valueFormat === 'number' || raw.valueFormat === 'currency' || raw.valueFormat === 'percent') {
        node.valueFormat = raw.valueFormat
      }
      // Charts are never selectable in a preview: id/initial/select/required drop.
      if (chart === 'scatter') {
        node.series = (Array.isArray(raw.series) ? raw.series : []).map((series) => ({
          name: isRecord(series) && typeof series.name === 'string' ? series.name : '',
          points: isRecord(series) && Array.isArray(series.points)
            ? series.points.filter((point) => isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y))
              .map((point) => ({ x: point.x, y: point.y }))
            : [],
        })).filter((series) => series.points.length > 0)
      } else if (chart === 'heatmap') {
        node.rows = (Array.isArray(raw.rows) ? raw.rows : []).map((row) => ({
          label: isRecord(row) && typeof row.label === 'string' ? row.label : '',
          values: isRecord(row) && Array.isArray(row.values) ? row.values.map((value) => (isFiniteNumber(value) ? value : undefined)) : [],
        }))
      } else {
        node.series = (Array.isArray(raw.series) ? raw.series : []).map((series) => ({
          name: isRecord(series) && typeof series.name === 'string' ? series.name : '',
          values: isRecord(series) && Array.isArray(series.values)
            ? series.values.map((value) => (isFiniteNumber(value) ? value : undefined))
            : [],
        }))
      }
      return node
    }

    function normalizePreviewInteractive(raw) {
      const node = { kind: raw.kind }
      if (typeof raw.id === 'string') node.id = raw.id
      if (typeof raw.label === 'string') node.label = raw.label
      if (raw.kind === 'slider') {
        if (isFiniteNumber(raw.min)) node.min = raw.min
        if (isFiniteNumber(raw.max)) node.max = raw.max
        if (isFiniteNumber(raw.step)) node.step = raw.step
        if (isFiniteNumber(raw.initial)) node.initial = raw.initial
      } else if (raw.kind === 'number' || raw.kind === 'stepper') {
        if (isFiniteNumber(raw.min)) node.min = raw.min
        if (isFiniteNumber(raw.max)) node.max = raw.max
        if (isFiniteNumber(raw.step)) node.step = raw.step
        if (isFiniteNumber(raw.initial)) node.initial = raw.initial
      } else if (raw.kind === 'rating') {
        if (isFiniteNumber(raw.max)) node.max = raw.max
        if (isFiniteNumber(raw.initial)) node.initial = raw.initial
      } else if (raw.kind === 'switch' || raw.kind === 'checkbox') {
        if (typeof raw.initial === 'boolean') node.initial = raw.initial
      } else if (raw.kind === 'select' || raw.kind === 'radio' || raw.kind === 'choice' || raw.kind === 'checklist') {
        node.options = previewOptions(raw.options)
        if (raw.kind === 'choice' || raw.kind === 'checklist') {
          if (isFiniteNumber(raw.columns)) node.columns = raw.columns
        }
        if (typeof raw.initial === 'string') node.initial = raw.initial
      } else if (raw.kind === 'input' || raw.kind === 'textarea') {
        if (typeof raw.placeholder === 'string') node.placeholder = raw.placeholder
        if (typeof raw.initial === 'string') node.initial = raw.initial
        if (raw.kind === 'textarea' && isFiniteNumber(raw.rows)) node.rows = raw.rows
      }
      return node
    }

    function normalizePreviewNode(raw) {
      if (!isRecord(raw) || typeof raw.kind !== 'string') return undefined
      const kind = raw.kind
      if (kind === 'chart') return normalizePreviewChart(raw)
      if (isInteractiveKind(kind)) return normalizePreviewInteractive(raw)
      if (kind === 'heading' || kind === 'text') {
        if (typeof raw.text !== 'string') return undefined
        return { kind, text: raw.text }
      }
      if (kind === 'divider') return { kind }
      if (kind === 'callout' || kind === 'badge') {
        if (typeof raw.text !== 'string') return undefined
        const node = { kind, text: raw.text }
        if (raw.tone === 'neutral' || raw.tone === 'info' || raw.tone === 'success' || raw.tone === 'warn' || raw.tone === 'error') node.tone = raw.tone
        return node
      }
      if (kind === 'stat') {
        if (typeof raw.label !== 'string' || typeof raw.value !== 'string') return undefined
        const node = { kind, label: raw.label, value: raw.value }
        if (typeof raw.hint === 'string') node.hint = raw.hint
        return node
      }
      if (kind === 'progress') {
        const node = { kind, value: isFiniteNumber(raw.value) ? raw.value : 0 }
        if (typeof raw.label === 'string') node.label = raw.label
        return node
      }
      if (kind === 'table') {
        const columns = Array.isArray(raw.columns) ? raw.columns.filter((value) => typeof value === 'string') : []
        const rows = Array.isArray(raw.rows) ? raw.rows.filter((row) => Array.isArray(row)).map((row) => row.map((cell) => (typeof cell === 'string' ? cell : String(cell === undefined || cell === null ? '' : cell)))) : []
        if (columns.length === 0) return undefined
        return { kind, columns, rows }
      }
      if (kind === 'image') {
        // Preview never fetches media: fall back to the alt text placeholder.
        if (typeof raw.src !== 'string') return undefined
        const node = { kind, src: '' }
        if (typeof raw.alt === 'string') node.alt = raw.alt
        return node
      }
      if (kind === 'link') {
        if (typeof raw.text !== 'string') return undefined
        return { kind, text: raw.text }
      }
      if (kind === 'keyValue') {
        const items = (Array.isArray(raw.items) ? raw.items : []).filter((item) => isRecord(item) && typeof item.label === 'string' && typeof item.value === 'string')
          .map((item) => ({ label: item.label, value: item.value }))
        if (items.length === 0) return undefined
        const node = { kind, items }
        if (isFiniteNumber(raw.columns)) node.columns = raw.columns
        return node
      }
      if (kind === 'steps' || kind === 'timeline') {
        const items = (Array.isArray(raw.items) ? raw.items : []).filter((item) => isRecord(item) && typeof item.label === 'string')
          .map((item) => {
            const normalized = { label: item.label }
            if (typeof item.description === 'string') normalized.description = item.description
            if (kind === 'steps' && (item.state === 'done' || item.state === 'current' || item.state === 'pending')) normalized.state = item.state
            if (kind === 'timeline' && typeof item.time === 'string') normalized.time = item.time
            return normalized
          })
        if (items.length === 0) return undefined
        return { kind, items }
      }
      if (kind === 'codeblock') {
        if (typeof raw.code !== 'string') return undefined
        const node = { kind, code: raw.code }
        if (typeof raw.language === 'string') node.language = raw.language
        if (typeof raw.title === 'string') node.title = raw.title
        return node
      }
      if (kind === 'quote') {
        if (typeof raw.text !== 'string') return undefined
        const node = { kind, text: raw.text }
        if (typeof raw.cite === 'string') node.cite = raw.cite
        return node
      }
      if (kind === 'sparkline') {
        const values = Array.isArray(raw.values) ? raw.values.filter((value) => isFiniteNumber(value)) : []
        if (values.length < 2) return undefined
        const node = { kind, values }
        if (isFiniteNumber(raw.height)) node.height = raw.height
        if (raw.tone === 'neutral' || raw.tone === 'info' || raw.tone === 'success' || raw.tone === 'warn' || raw.tone === 'error') node.tone = raw.tone
        return node
      }
      if (kind === 'section') {
        const node = { kind, children: previewNodes(raw.children) }
        if (typeof raw.title === 'string') node.title = raw.title
        if (typeof raw.description === 'string') node.description = raw.description
        return node
      }
      if (kind === 'box' || kind === 'row' || kind === 'grid') {
        const node = { kind, children: previewNodes(raw.children) }
        for (const field of ['padding', 'gap', 'columns', 'border', 'radius', 'background', 'align', 'wrap']) {
          if (raw[field] !== undefined) node[field] = raw[field]
        }
        return node
      }
      if (kind === 'columns') {
        const columns = (Array.isArray(raw.columns) ? raw.columns : [])
          .filter((column) => isRecord(column))
          .map((column) => ({ children: previewNodes(column.children) }))
        if (columns.length === 0) return undefined
        const node = { kind, columns }
        if (isFiniteNumber(raw.gap)) node.gap = raw.gap
        return node
      }
      if (kind === 'tabs') {
        const tabs = (Array.isArray(raw.tabs) ? raw.tabs : [])
          .filter((tab) => isRecord(tab) && typeof tab.label === 'string')
          .map((tab) => ({ label: tab.label, children: previewNodes(tab.children) }))
        if (tabs.length === 0) return undefined
        return { kind, tabs }
      }
      if (kind === 'list') {
        const items = (Array.isArray(raw.items) ? raw.items : []).filter((item) => isRecord(item)).map((item) => {
          const copy = {}
          for (const key of Object.keys(item)) {
            if (typeof item[key] === 'string' || typeof item[key] === 'number' || typeof item[key] === 'boolean') copy[key] = item[key]
          }
          return copy
        })
        const template = normalizePreviewNode(raw.template)
        if (template === undefined || template.kind === 'list') return undefined
        const node = { kind, items, template }
        if (typeof raw.itemName === 'string') node.itemName = raw.itemName
        if (typeof raw.itemLabel === 'string') node.itemLabel = raw.itemLabel
        if (isFiniteNumber(raw.gap)) node.gap = raw.gap
        return node
      }
      return undefined
    }

    /**
     * Tolerant preview of one `source` text: title/description plus the fully
     * closed nodes that the normalizer can understand. Never throws.
     */
    function previewFromSource(text) {
      if (typeof text !== 'string' || text.trim() === '') return undefined
      try {
        const parsed = parsePartialJson(text)
        const partial = extractPartialSource(text)
        let title = typeof partial.title === 'string' ? partial.title : ''
        let description = typeof partial.description === 'string' ? partial.description : ''
        let nodes = []
        if (isRecord(parsed.value)) {
          if (typeof parsed.value.title === 'string') title = parsed.value.title
          if (typeof parsed.value.description === 'string') description = parsed.value.description
          nodes = previewNodes(parsed.value.controls)
        }
        return { title, description, nodes }
      } catch (error) {
        return undefined
      }
    }

    /**
     * Interpret the tool-call `block` phases. A settled block has `kind`
     * (CONTRACT.md §8); `meta` is the Host's `presentationMeta` projection.
     */
    function viewOfBlock(block) {
      if (!isRecord(block)) return { phase: 'preparing' }
      if (!('kind' in block)) return { phase: block.phase === 'preparing' ? 'preparing' : 'start' }
      if (block.isError === true) return { phase: 'error' }
      const meta = block.meta
      if (!isRecord(meta)) return { phase: 'invalid' }
      if (meta.v !== 2 && meta.v !== 3 && meta.v !== 4 && meta.v !== 5 && meta.v !== 6 && meta.v !== 7) return { phase: 'newer', meta }
      if (typeof meta.title !== 'string' || !Array.isArray(meta.nodes)) return { phase: 'invalid' }
      return { phase: 'ready', meta }
    }

    /**
     * Number of submit fields in one program: interactive controls are exactly
     * the nodes that carry an `id` (CONTRACT.md §4.1). This counts the compiled
     * program, independent of which controls are currently visible.
     */
    function interactionCount(meta) {
      let count = 0
      if (!isRecord(meta)) return count
      walkNodes(meta.nodes, (node) => {
        if (typeof node.id === 'string' && node.id !== '') count += 1
      })
      return count
    }

    /** The Turn object arrives from the slot; the snapshot index wants its number. */
    function turnNumberOf(turn) {
      if (typeof turn === 'number' && Number.isFinite(turn)) return turn
      if (!isRecord(turn)) return undefined
      if (typeof turn.turn === 'number' && Number.isFinite(turn.turn)) return turn.turn
      if (isRecord(turn.turn) && typeof turn.turn.turn === 'number' && Number.isFinite(turn.turn.turn)) return turn.turn.turn
      return undefined
    }

    /** Whether a compiled program belongs to one turn-tail entry. */
    function matchesKind(meta, expectedKind) {
      if (!isRecord(meta)) return false
      if (meta.kind === 'deliver' || meta.kind === 'ask') return meta.kind === expectedKind
      // Unknown program version: surface it once, through the delivery tail.
      return expectedKind === 'deliver'
    }

    /** One result's compiled program, restricted to the owning wire tool. */
    function metaOfRoot(root, expectedKind) {
      if (!isRecord(root) || root.isError === true) return undefined
      const expectedName = expectedKind === 'deliver' ? 'render_ui' : 'ask_with_ui'
      const name = typeof root.name === 'string' ? root.name : ''
      if (name !== '' && name !== expectedName) return undefined
      if (!isRecord(root.meta)) return undefined
      return matchesKind(root.meta, expectedKind) ? root.meta : undefined
    }

    function metaOfToolNode(node, expectedKind) {
      if (!isRecord(node) || node.kind !== 'tool-call' || !isRecord(node.data)) return undefined
      return metaOfRoot(node.data.root, expectedKind)
    }

    /**
     * Find the latest compiled program a turn produced, for one tail entry.
     * Primary path: the Chat location index (`snapshot.locations.getTurn`).
     * Fallback: the public per-turn tool-call source. Both are read defensively.
     */
    function findMeta(snapshot, turn, expectedKind) {
      if (!isRecord(snapshot) || !Number.isFinite(turn)) return undefined
      const fromLocations = () => {
        const locations = snapshot.locations
        const nodes = snapshot.nodes
        if (!isRecord(locations) || typeof locations.getTurn !== 'function') return undefined
        if (!isRecord(nodes) || typeof nodes.get !== 'function') return undefined
        let keys
        try {
          keys = locations.getTurn(turn)
        } catch (error) {
          keys = undefined
        }
        if (!Array.isArray(keys)) return undefined
        for (let index = keys.length - 1; index >= 0; index--) {
          let node
          try {
            node = nodes.get(keys[index])
          } catch (error) {
            node = undefined
          }
          const meta = metaOfToolNode(node, expectedKind)
          if (meta !== undefined) return meta
        }
        return undefined
      }
      const located = fromLocations()
      if (located !== undefined) return located
      try {
        const nodes = snapshot.nodes
        if (!isRecord(nodes) || typeof nodes.turnDataSource !== 'function') return undefined
        const source = nodes.turnDataSource(turn, 'tool-call')
        const calls = isRecord(source) && typeof source.getSnapshot === 'function' ? source.getSnapshot() : undefined
        if (!Array.isArray(calls)) return undefined
        for (let index = calls.length - 1; index >= 0; index--) {
          const call = calls[index]
          const meta = metaOfRoot(isRecord(call) ? call.root : undefined, expectedKind)
          if (meta !== undefined) return meta
        }
      } catch (error) {
        /* the fallback is optional */
      }
      return undefined
    }

    /* ------------------------------------------------------------------ *
     * Chart geometry (inline SVG; CONTRACT.md §4.1 chart, v2.1)
     *
     * v2.1: each `series[].values[i]` is a number or a Host-compiled RichText
     * evaluated against the current local state, so a slider can drive the
     * chart without calling the model. Anything that does not settle on a
     * finite number becomes a missing point: no bar, and a line gap.
     * ------------------------------------------------------------------ */

    /** Coerce one evaluated RichText/literal to a finite chart value, or a gap. */
    function chartValue(value, scope) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
      if (typeof value === 'string') return numberFromChartText(value)
      if (!isRecord(value)) return undefined
      try {
        return numberFromChartText(evalRichText(value, scope))
      } catch (error) {
        return undefined
      }
    }

    function numberFromChartText(text) {
      if (typeof text !== 'string') return undefined
      const trimmed = text.trim()
      if (trimmed === '') return undefined
      const number = Number(trimmed)
      return Number.isFinite(number) ? number : undefined
    }

    function chartModeOf(node) {
      const chart = isRecord(node) ? node.chart : undefined
      return CHART_MODES.indexOf(chart) !== -1 ? chart : 'bar'
    }

    function polarPoint(cx, cy, radius, angle) {
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }
    }

    /** One pie/ring slice path; a full circle is split into two arcs. */
    function ringPath(cx, cy, inner, outer, start, end) {
      const span = end - start
      const full = span >= Math.PI * 2 - 0.000001
      const outerRadius = round2(outer)
      const innerRadius = round2(inner)
      const point = (radius, angle) => {
        const position = polarPoint(cx, cy, radius, angle)
        return round2(position.x) + ' ' + round2(position.y)
      }
      const center = round2(cx) + ' ' + round2(cy)
      if (inner <= 0) {
        if (full) {
          const middle = start + Math.PI
          return 'M ' + center + ' L ' + point(outer, start) +
            ' A ' + outerRadius + ' ' + outerRadius + ' 0 1 1 ' + point(outer, middle) +
            ' A ' + outerRadius + ' ' + outerRadius + ' 0 1 1 ' + point(outer, start + Math.PI * 2) + ' Z'
        }
        const large = span > Math.PI ? 1 : 0
        return 'M ' + center + ' L ' + point(outer, start) +
          ' A ' + outerRadius + ' ' + outerRadius + ' 0 ' + large + ' 1 ' + point(outer, end) + ' Z'
      }
      if (full) {
        const middle = start + Math.PI
        return 'M ' + point(outer, start) +
          ' A ' + outerRadius + ' ' + outerRadius + ' 0 1 1 ' + point(outer, middle) +
          ' A ' + outerRadius + ' ' + outerRadius + ' 0 1 1 ' + point(outer, start + Math.PI * 2) +
          ' L ' + point(inner, start + Math.PI * 2) +
          ' A ' + innerRadius + ' ' + innerRadius + ' 0 1 0 ' + point(inner, middle) +
          ' A ' + innerRadius + ' ' + innerRadius + ' 0 1 0 ' + point(inner, start) + ' Z'
      }
      const large = span > Math.PI ? 1 : 0
      return 'M ' + point(outer, start) +
        ' A ' + outerRadius + ' ' + outerRadius + ' 0 ' + large + ' 1 ' + point(outer, end) +
        ' L ' + point(inner, end) +
        ' A ' + innerRadius + ' ' + innerRadius + ' 0 ' + large + ' 0 ' + point(inner, start) + ' Z'
    }

    /** Filled area under one contiguous run of points down to the zero line. */
    function segmentAreaPath(points, baseline) {
      if (!Array.isArray(points) || points.length < 2) return undefined
      const first = points[0]
      const last = points[points.length - 1]
      let path = 'M ' + round2(first.x) + ' ' + round2(baseline)
      for (const point of points) path += ' L ' + round2(point.x) + ' ' + round2(point.y)
      path += ' L ' + round2(last.x) + ' ' + round2(baseline) + ' Z'
      return path
    }

    /** v4 scatter: numeric x/y domains, one point list per series (§14.3). */
    function scatterGeometry(source, height) {
      const rawSeries = Array.isArray(source.series) ? source.series.slice(0, 6) : []
      const series = []
      let minX = 0
      let maxX = 0
      let minY = 0
      let maxY = 0
      let seen = false
      for (const entry of rawSeries) {
        const sourcePoints = isRecord(entry) && Array.isArray(entry.points) ? entry.points : []
        const points = []
        for (const point of sourcePoints) {
          if (!isRecord(point) || !isFiniteNumber(point.x) || !isFiniteNumber(point.y)) continue
          points.push({ x: point.x, y: point.y })
          if (!seen) {
            minX = point.x
            maxX = point.x
            minY = point.y
            maxY = point.y
            seen = true
          } else {
            minX = Math.min(minX, point.x)
            maxX = Math.max(maxX, point.x)
            minY = Math.min(minY, point.y)
            maxY = Math.max(maxY, point.y)
          }
        }
        series.push({ name: isRecord(entry) && typeof entry.name === 'string' ? entry.name : '', points })
      }
      // Cartesian charts keep the zero baseline; scatter follows them.
      minX = seen ? Math.min(0, minX) : 0
      maxX = seen ? Math.max(0, maxX) : 1
      minY = seen ? Math.min(0, minY) : 0
      maxY = seen ? Math.max(0, maxY) : 1
      if (!(maxX > minX)) maxX = minX + 1
      if (!(maxY > minY)) maxY = minY + 1
      const plotWidth = Math.max(10, CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right)
      const plotHeight = Math.max(10, height - CHART_PADDING.top - CHART_PADDING.bottom)
      const scaleX = (value) => CHART_PADDING.left + ((value - minX) / (maxX - minX)) * plotWidth
      const scaleY = (value) => CHART_PADDING.top + plotHeight - ((value - minY) / (maxY - minY)) * plotHeight
      const ticksX = []
      const ticksY = []
      for (let index = 0; index <= 4; index++) {
        ticksX.push({ value: minX + ((maxX - minX) * index) / 4, x: round2(scaleX(minX + ((maxX - minX) * index) / 4)) })
        ticksY.push({ value: minY + ((maxY - minY) * index) / 4, y: round2(scaleY(minY + ((maxY - minY) * index) / 4)) })
      }
      const points = []
      for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
        for (const point of series[seriesIndex].points) {
          points.push({
            series: seriesIndex,
            x: round2(scaleX(point.x)),
            y: round2(scaleY(point.y)),
            valueX: point.x,
            valueY: point.y,
          })
        }
      }
      return {
        width: CHART_WIDTH,
        height,
        mode: 'scatter',
        categories: [],
        series: series.map((entry) => ({ name: entry.name, values: [] })),
        min: minY,
        max: maxY,
        minX,
        maxX,
        minY,
        maxY,
        ticks: ticksY,
        ticksX,
        ticksY,
        plotWidth,
        plotHeight,
        groupWidth: 0,
        bars: [],
        lines: [],
        areas: [],
        labels: [],
        slices: [],
        points,
      }
    }

    /** v4 heatmap: categories as columns, rows of numeric values as rows (§14.3). */
    function heatmapGeometry(source, height) {
      const categories = Array.isArray(source.categories) ? source.categories.map((entry) => String(entry === undefined || entry === null ? '' : entry)) : []
      const rawRows = Array.isArray(source.rows) ? source.rows.slice(0, 12) : []
      const rows = rawRows.map((row) => ({
        label: isRecord(row) && typeof row.label === 'string' ? row.label : '',
        values: categories.map((unused, index) => {
          if (!isRecord(row) || !Array.isArray(row.values)) return undefined
          const value = row.values[index]
          return isFiniteNumber(value) ? value : undefined
        }),
      }))
      const numbers = []
      for (const row of rows) {
        for (const value of row.values) {
          if (isFiniteNumber(value)) numbers.push(value)
        }
      }
      const min = numbers.length === 0 ? 0 : Math.min.apply(null, numbers)
      const max = numbers.length === 0 ? 0 : Math.max.apply(null, numbers)
      const span = max - min
      const padding = { top: 16, right: 8, bottom: 8, left: 54 }
      const plotWidth = Math.max(10, CHART_WIDTH - padding.left - padding.right)
      const plotHeight = Math.max(10, height - padding.top - padding.bottom)
      const cellWidth = categories.length === 0 ? plotWidth : plotWidth / categories.length
      const cellHeight = rows.length === 0 ? plotHeight : plotHeight / rows.length
      const cells = []
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        for (let columnIndex = 0; columnIndex < categories.length; columnIndex++) {
          const value = rows[rowIndex].values[columnIndex]
          let fill = 'var(--dsw-alias-bg-layer-3,#eceef4)'
          if (isFiniteNumber(value) && span > 0) {
            const ratio = (value - min) / span
            fill = 'color-mix(in srgb, var(--dsw-alias-state-business-primary,#2f6bff) ' + round2(ratio * 80) + '%, var(--dsw-alias-bg-layer-2,#f5f6f9))'
          }
          cells.push({
            row: rowIndex,
            column: columnIndex,
            value: isFiniteNumber(value) ? value : undefined,
            x: round2(padding.left + cellWidth * columnIndex),
            y: round2(padding.top + cellHeight * rowIndex),
            width: round2(Math.max(1, cellWidth - 1)),
            height: round2(Math.max(1, cellHeight - 1)),
            fill,
          })
        }
      }
      const columnLabels = categories.map((text, index) => ({
        text,
        x: round2(padding.left + cellWidth * (index + 0.5)),
        y: padding.top - 4,
      }))
      const rowLabels = rows.map((row, index) => ({
        text: row.label,
        x: padding.left - 6,
        y: round2(padding.top + cellHeight * (index + 0.5)),
      }))
      return {
        width: CHART_WIDTH,
        height,
        mode: 'heatmap',
        categories,
        rows,
        series: [],
        min,
        max,
        ticks: [],
        ticksX: [],
        ticksY: [],
        plotWidth,
        plotHeight,
        groupWidth: 0,
        bars: [],
        lines: [],
        areas: [],
        labels: [],
        slices: [],
        cells,
        columnLabels,
        rowLabels,
      }
    }

    /** v5 sparkline: a tiny inline line; gaps at non-finite/undefined values. */
    function sparklineGeometry(node, scope) {
      const source = isRecord(node) ? node : {}
      const viewScope = isRecord(scope) ? scope : {}
      const width = 120
      const height = clamp(isFiniteNumber(source.height) ? source.height : 40, 24, 64)
      const raw = Array.isArray(source.values) ? source.values.slice(0, 32) : []
      const values = raw.map((value) => chartValue(value, viewScope))
      const finite = []
      for (const value of values) {
        if (isFiniteNumber(value)) finite.push(value)
      }
      const min = finite.length === 0 ? 0 : Math.min.apply(null, finite)
      const max = finite.length === 0 ? 0 : Math.max.apply(null, finite)
      const span = max - min
      const padding = 2
      const scaleX = (index) => (values.length <= 1 ? padding : padding + (index / (values.length - 1)) * (width - padding * 2))
      const scaleY = (value) => (span > 0 ? height - padding - ((value - min) / span) * (height - padding * 2) : height / 2)
      const points = []
      const segments = []
      let segment = []
      for (let index = 0; index < values.length; index++) {
        const value = values[index]
        if (!isFiniteNumber(value)) {
          if (segment.length > 0) {
            segments.push(segment)
            segment = []
          }
          continue
        }
        const point = { x: round2(scaleX(index)), y: round2(scaleY(value)), value }
        points.push(point)
        segment.push(point)
      }
      if (segment.length > 0) segments.push(segment)
      const tone = source.tone === 'info' || source.tone === 'success' || source.tone === 'warn' ||
        source.tone === 'error' || source.tone === 'neutral' ? source.tone : 'neutral'
      return { width, height, values, points, segments, min, max, tone }
    }

    /** v5 inline sparkline SVG. No axes; non-finite values break the line. */
    function SparklineView(props) {
      const { node, scope, t } = props
      const tr = translator(t)
      const geometry = sparklineGeometry(node, scope)
      const segments = geometry.segments.map((segment, index) => (segment.length > 1 ? h('polyline', {
        key: 'l' + index,
        className: 'dsh-iu2-sparkline-line',
        points: segment.map((point) => point.x + ',' + point.y).join(' '),
        fill: 'none',
      }) : null))
      const dots = geometry.points.map((point, index) => h('circle', {
        key: 'd' + index,
        className: 'dsh-iu2-sparkline-dot',
        cx: point.x,
        cy: point.y,
        r: 1.6,
      }))
      return h('div', {
        className: 'dsh-iu2-sparkline',
        'data-tone': geometry.tone,
        role: 'img',
        'aria-label': tr('card.sparkline', { count: geometry.points.length }),
      }, h('svg', {
        className: 'dsh-iu2-sparkline-svg',
        viewBox: '0 0 ' + geometry.width + ' ' + geometry.height,
        preserveAspectRatio: 'none',
        'aria-hidden': 'true',
        style: { height: geometry.height + 'px' },
      }, segments, dots))
    }

    function chartGeometry(node, scope) {
      const source = isRecord(node) ? node : {}
      const viewScope = isRecord(scope) ? scope : {}
      const height = clamp(isFiniteNumber(source.height) ? source.height : 180, 120, 400)
      const categories = Array.isArray(source.categories) ? source.categories.map((entry) => String(entry === undefined || entry === null ? '' : entry)) : []
      const mode = chartModeOf(source)
      if (mode === 'scatter') return scatterGeometry(source, height)
      if (mode === 'heatmap') return heatmapGeometry(source, height)
      const rawSeries = Array.isArray(source.series) ? source.series : []
      const series = []
      for (let index = 0; index < Math.min(rawSeries.length, 6); index++) {
        const entry = rawSeries[index]
        const values = isRecord(entry) && Array.isArray(entry.values) ? entry.values : []
        series.push({
          name: isRecord(entry) && typeof entry.name === 'string' ? entry.name : '',
          values: categories.map((unused, at) => chartValue(values[at], viewScope)),
        })
      }
      // Pie/donut use the first series only; the other series are ignored.
      if (mode === 'pie' || mode === 'donut') {
        const cx = CHART_WIDTH / 2
        const cy = height / 2
        const outer = Math.max(8, Math.min(CHART_WIDTH, height) / 2 - 8)
        const inner = mode === 'donut' ? outer * 0.58 : 0
        const first = series[0]
        const values = first === undefined ? [] : first.values
        let total = 0
        for (let index = 0; index < categories.length; index++) {
          const value = values[index]
          if (isFiniteNumber(value) && value > 0) total += value
        }
        const slices = []
        if (total > 0) {
          let angle = -Math.PI / 2
          for (let index = 0; index < categories.length; index++) {
            const value = values[index]
            if (!isFiniteNumber(value) || value <= 0) continue
            const portion = value / total
            const end = angle + portion * Math.PI * 2
            slices.push({
              category: index,
              value,
              percent: portion,
              startAngle: angle,
              endAngle: end,
              colorIndex: index % SERIES_COLORS.length,
              path: ringPath(cx, cy, inner, outer, angle, end),
            })
            angle = end
          }
        }
        return {
          width: CHART_WIDTH,
          height,
          mode,
          categories,
          series,
          min: 0,
          max: total,
          ticks: [],
          plotWidth: 0,
          plotHeight: 0,
          groupWidth: 0,
          bars: [],
          lines: [],
          areas: [],
          labels: [],
          slices,
          center: { x: round2(cx), y: round2(cy) },
          outerRadius: round2(outer),
          innerRadius: round2(inner),
        }
      }

      const numbers = []
      for (const entry of series) {
        for (const value of entry.values) {
          if (isFiniteNumber(value)) numbers.push(value)
        }
      }
      const dataMin = numbers.length === 0 ? 0 : Math.min.apply(null, numbers)
      const dataMax = numbers.length === 0 ? 0 : Math.max.apply(null, numbers)
      const min = Math.min(0, dataMin)
      let max = Math.max(0, dataMax)
      if (!(max > min)) max = min + 1
      const plotWidth = Math.max(10, CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right)
      const plotHeight = Math.max(10, height - CHART_PADDING.top - CHART_PADDING.bottom)
      const scaleY = (value) => CHART_PADDING.top + plotHeight - ((value - min) / (max - min)) * plotHeight
      const ticks = []
      const tickCount = 4
      for (let index = 0; index <= tickCount; index++) {
        const value = min + ((max - min) * index) / tickCount
        ticks.push({ value, y: scaleY(value) })
      }
      const groupWidth = categories.length === 0 ? plotWidth : plotWidth / categories.length
      const barWidth = categories.length === 0 || series.length === 0 ? 0 : Math.min(26, (groupWidth * 0.72) / series.length)
      const zeroY = scaleY(0)
      const bars = []
      const lines = []
      const areas = []
      if (mode === 'bar') {
        for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
          for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
            const value = series[seriesIndex].values[categoryIndex]
            if (!isFiniteNumber(value)) continue
            const valueY = scaleY(value)
            const x = CHART_PADDING.left + groupWidth * categoryIndex + groupWidth / 2 - (barWidth * series.length) / 2 + barWidth * seriesIndex
            bars.push({
              series: seriesIndex,
              category: categoryIndex,
              value,
              x: round2(x),
              y: round2(Math.min(zeroY, valueY)),
              width: round2(Math.max(1, barWidth - 1)),
              height: round2(Math.max(0, Math.abs(valueY - zeroY))),
            })
          }
        }
      } else {
        for (let seriesIndex = 0; seriesIndex < series.length; seriesIndex++) {
          const points = []
          const segments = []
          let segment = []
          for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex++) {
            const value = series[seriesIndex].values[categoryIndex]
            if (!isFiniteNumber(value)) {
              // A gap breaks the line instead of bridging across it.
              if (segment.length > 0) {
                segments.push(segment)
                segment = []
              }
              continue
            }
            const point = {
              category: categoryIndex,
              value,
              x: round2(CHART_PADDING.left + groupWidth * (categoryIndex + 0.5)),
              y: round2(scaleY(value)),
            }
            points.push(point)
            segment.push(point)
          }
          if (segment.length > 0) segments.push(segment)
          lines.push({ series: seriesIndex, points, segments })
          if (mode === 'area') {
            for (const run of segments) {
              const path = segmentAreaPath(run, zeroY)
              if (path !== undefined) areas.push({ series: seriesIndex, path })
            }
          }
        }
      }
      const labelStep = categories.length > 8 ? Math.ceil(categories.length / 8) : 1
      const labels = categories.map((text, index) => ({
        text,
        show: index % labelStep === 0,
        x: round2(CHART_PADDING.left + groupWidth * (index + 0.5)),
        y: height - 7,
      }))
      return {
        width: CHART_WIDTH,
        height,
        mode,
        categories,
        series,
        min,
        max,
        ticks,
        plotWidth,
        plotHeight,
        groupWidth,
        bars,
        lines,
        areas,
        labels,
        slices: [],
      }
    }

    /* ------------------------------------------------------------------ *
     * Rendering: node primitives
     * ------------------------------------------------------------------ */

    function toneOf(node) {
      const tone = isRecord(node) ? node.tone : undefined
      return tone === 'info' || tone === 'success' || tone === 'warn' || tone === 'error' || tone === 'neutral' ? tone : 'neutral'
    }

    function ChartView(props) {
      const { node, scope, t } = props
      const tr = translator(t)
      // Recomputed on every render: moving a slider re-evaluates expression
      // values against the new scope and redraws without any model call.
      const geometry = chartGeometry(node, scope)
      const format = (value) => formatNumber(value, isRecord(node) ? node.valueFormat : undefined)
      const mode = geometry.mode
      const isPie = mode === 'pie' || mode === 'donut'
      const isScatter = mode === 'scatter'
      const isHeatmap = mode === 'heatmap'
      // v6: only id-bearing bar/line/area/pie/donut charts are click-selectable.
      const selectable = props.selectable === true && SELECTABLE_CHART_MODES.indexOf(mode) !== -1
      const selectedValue = typeof props.selectedValue === 'string' ? props.selectedValue : ''
      const disabled = props.disabled === true
      const [tooltip, setTooltip] = React.useState(null)
      const showTooltip = (x, y, lines) => setTooltip({ x, y, lines })
      const hideTooltip = () => setTooltip(null)
      const categoryName = (index) => (geometry.categories[index] === undefined ? '' : String(geometry.categories[index]))
      const seriesName = (index) => {
        const entry = geometry.series[index]
        return entry !== undefined && entry.name !== '' ? entry.name : tr('card.chart.series', { index: index + 1 })
      }
      const toggleCategory = (index) => {
        if (!selectable || disabled || typeof props.onSelect !== 'function') return
        const value = categoryName(index)
        if (value === '') return
        props.onSelect(selectedValue === value ? '' : value)
      }
      const markProps = (x, y, lines, categoryIndex) => {
        const attrs = {
          className: 'dsh-iu2-chart-mark',
          tabIndex: 0,
          'aria-label': lines.join(' · '),
          onMouseEnter: () => showTooltip(x, y, lines),
          onMouseLeave: hideTooltip,
          onFocus: () => showTooltip(x, y, lines),
          onBlur: hideTooltip,
        }
        if (selectable && categoryIndex !== undefined) {
          const value = categoryName(categoryIndex)
          const selected = value !== '' && selectedValue === value
          attrs.role = 'button'
          attrs['aria-pressed'] = selected
          attrs['data-selected'] = selected
          attrs.onClick = () => toggleCategory(categoryIndex)
          attrs.onKeyDown = (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleCategory(categoryIndex)
            }
          }
        }
        return attrs
      }
      const legendItems = isHeatmap
        ? []
        : isPie
          ? geometry.slices.map((slice, index) => ({
              key: 'slice-' + index,
              colorIndex: slice.colorIndex,
              name: categoryName(slice.category),
              value: slice.value,
            }))
          : geometry.series.map((entry, index) => ({
              key: 'series-' + index,
              colorIndex: index,
              name: entry.name !== '' ? entry.name : tr('card.chart.series', { index: index + 1 }),
              value: undefined,
            }))
      const legend = legendItems.length === 0 ? null : h('div', { className: 'dsh-iu2-chart-legend' },
        legendItems.map((item) => h('span', { key: item.key, className: 'dsh-iu2-chart-legend-item' },
          h('span', { className: 'dsh-iu2-chart-dot', style: { background: SERIES_COLORS[item.colorIndex % SERIES_COLORS.length] } }),
          h('span', null, item.name + (isPie && isFiniteNumber(item.value) ? ' · ' + format(item.value) : '')))))

      let content
      let ariaLabel
      if (isHeatmap) {
        const valueTexts = []
        const cellRects = geometry.cells.map((cell, index) => {
          const rowLabel = geometry.rowLabels[cell.row] === undefined ? '' : geometry.rowLabels[cell.row].text
          const columnLabel = categoryName(cell.column)
          const valueText = isFiniteNumber(cell.value) ? format(cell.value) : '—'
          const lines = [rowLabel, columnLabel, valueText]
          if (isFiniteNumber(cell.value)) {
            valueTexts.push(h('text', {
              key: 'v-' + index,
              className: 'dsh-iu2-heatmap-value',
              x: round2(cell.x + cell.width / 2),
              y: round2(cell.y + cell.height / 2),
              textAnchor: 'middle',
              dominantBaseline: 'middle',
            }, valueText))
          }
          const attrs = markProps(round2(cell.x + cell.width / 2), round2(cell.y + cell.height / 2), lines)
          return h('rect', Object.assign({
            key: 'cell-' + index,
            x: cell.x,
            y: cell.y,
            width: cell.width,
            height: cell.height,
            rx: 1,
            style: { fill: cell.fill },
          }, attrs), h('title', null, lines.join(' · ')))
        })
        const columnLabels = geometry.columnLabels.map((label, index) => h('text', {
          key: 'col-' + index,
          className: 'dsh-iu2-chart-axis',
          x: label.x,
          y: label.y,
          textAnchor: 'middle',
        }, label.text))
        const rowLabels = geometry.rowLabels.map((label, index) => h('text', {
          key: 'row-' + index,
          className: 'dsh-iu2-chart-axis',
          x: label.x,
          y: label.y,
          textAnchor: 'end',
          dominantBaseline: 'middle',
        }, label.text))
        content = [cellRects, valueTexts, columnLabels, rowLabels]
        ariaLabel = tr('card.chart.heatmap', { rows: geometry.rows.length, columns: geometry.categories.length })
      } else if (isScatter) {
        const grid = geometry.ticksY.map((tick, index) => h('g', { key: 'ty-' + index },
          h('line', {
            className: 'dsh-iu2-chart-grid',
            x1: CHART_PADDING.left,
            x2: geometry.width - CHART_PADDING.right,
            y1: tick.y,
            y2: tick.y,
          }),
          h('text', {
            className: 'dsh-iu2-chart-axis',
            x: CHART_PADDING.left - 5,
            y: tick.y,
            textAnchor: 'end',
            dominantBaseline: 'middle',
          }, format(tick.value))))
        const verticalGrid = geometry.ticksX.map((tick, index) => h('g', { key: 'tx-' + index },
          h('line', {
            className: 'dsh-iu2-chart-grid',
            x1: tick.x,
            x2: tick.x,
            y1: CHART_PADDING.top,
            y2: geometry.height - CHART_PADDING.bottom,
          }),
          h('text', {
            className: 'dsh-iu2-chart-axis',
            x: tick.x,
            y: geometry.height - 7,
            textAnchor: 'middle',
          }, format(tick.value))))
        const points = geometry.points.map((point, index) => {
          const lines = [seriesName(point.series), 'x: ' + format(point.valueX), 'y: ' + format(point.valueY)]
          return h('circle', Object.assign({
            key: 'pt-' + index,
            cx: point.x,
            cy: point.y,
            r: 3,
            style: { fill: SERIES_COLORS[point.series % SERIES_COLORS.length] },
          }, markProps(point.x, point.y, lines)), h('title', null, lines.join(' · ')))
        })
        content = [grid, verticalGrid, points]
        ariaLabel = tr('card.chart.scatter', { points: geometry.points.length, series: geometry.series.length })
      } else if (isPie) {
        content = geometry.slices.map((slice, index) => {
          const name = categoryName(slice.category)
          const percentText = String(round2(slice.percent * 100)) + '%'
          const lines = [name, format(slice.value), percentText]
          const middle = (slice.startAngle + slice.endAngle) / 2
          const radius = geometry.outerRadius * 0.65
          const x = geometry.center.x + Math.cos(middle) * radius
          const y = geometry.center.y + Math.sin(middle) * radius
          return h('path', Object.assign({
            key: 'slice-' + index,
            d: slice.path,
            style: { fill: SERIES_COLORS[slice.colorIndex % SERIES_COLORS.length] },
          }, markProps(round2(x), round2(y), lines, slice.category)), h('title', null, lines.join(' · ')))
        })
        ariaLabel = tr('card.chart.summary', { categories: geometry.categories.length, series: geometry.series.length })
      } else {
        const grid = geometry.ticks.map((tick, index) => h('g', { key: 't' + index },
          h('line', {
            className: 'dsh-iu2-chart-grid',
            x1: CHART_PADDING.left,
            x2: geometry.width - CHART_PADDING.right,
            y1: tick.y,
            y2: tick.y,
          }),
          h('text', {
            className: 'dsh-iu2-chart-axis',
            x: CHART_PADDING.left - 5,
            y: tick.y,
            textAnchor: 'end',
            dominantBaseline: 'middle',
          }, format(tick.value))))

        const bars = geometry.mode !== 'bar' ? null : geometry.bars.map((bar, index) => {
          const color = SERIES_COLORS[bar.series % SERIES_COLORS.length]
          const lines = [seriesName(bar.series), categoryName(bar.category), format(bar.value)]
          return h('rect', Object.assign({
            key: 'b' + index,
            x: bar.x,
            y: bar.y,
            width: bar.width,
            height: bar.height,
            rx: 1,
            style: { fill: color },
          }, markProps(round2(bar.x + bar.width / 2), bar.y, lines, bar.category)), h('title', null, lines.join(' · ')))
        })

        const areas = geometry.mode !== 'area' ? null : geometry.areas.map((area, index) => h('path', {
          key: 'a' + index,
          d: area.path,
          style: {
            fill: SERIES_COLORS[area.series % SERIES_COLORS.length],
            opacity: 0.18,
            stroke: 'none',
          },
        }))

        const lines = geometry.mode === 'bar' ? null : geometry.lines.map((line, index) => {
          const color = SERIES_COLORS[line.series % SERIES_COLORS.length]
          const segments = Array.isArray(line.segments) ? line.segments : line.points.length === 0 ? [] : [line.points]
          return h('g', { key: 'l' + index },
            segments.map((segment, segmentIndex) => (segment.length > 1 ? h('polyline', {
              key: 'p' + segmentIndex,
              points: segment.map((point) => point.x + ',' + point.y).join(' '),
              fill: 'none',
              style: { stroke: color, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' },
            }) : null)),
            line.points.map((point, pointIndex) => {
              const pointLines = [
                seriesName(line.series),
                categoryName(point.category),
                format(point.value),
              ]
              const selected = selectable && selectedValue === categoryName(point.category)
              return h('circle', Object.assign({
                key: pointIndex,
                cx: point.x,
                cy: point.y,
                r: selected ? 4 : 2.4,
                style: { fill: color },
              }, markProps(point.x, point.y, pointLines, point.category)), h('title', null, pointLines.join(' · ')))
            }))
        })

        const labels = geometry.labels.map((label, index) => (label.show ? h('text', {
          key: 'x' + index,
          className: 'dsh-iu2-chart-axis',
          x: label.x,
          y: label.y,
          textAnchor: 'middle',
        }, label.text) : null))

        content = [grid, areas, bars, lines, labels]
        ariaLabel = tr('card.chart.summary', { categories: geometry.categories.length, series: geometry.series.length })
      }

      const tooltipNode = isRecord(tooltip) && Array.isArray(tooltip.lines)
        ? h('div', {
            className: 'dsh-iu2-chart-tooltip',
            role: 'tooltip',
            style: {
              left: clamp((tooltip.x / geometry.width) * 100, 2, 98) + '%',
              top: clamp((tooltip.y / geometry.height) * 100, 8, 96) + '%',
            },
          }, tooltip.lines.map((line, index) => h('span', { key: index, className: 'dsh-iu2-chart-tooltip-line' }, line)))
        : null

      return h('div', {
        className: 'dsh-iu2-chart',
        role: selectable ? 'group' : undefined,
        'aria-label': selectable ? props.labelText : undefined,
        'aria-invalid': selectable && props.fieldError !== undefined && props.fieldError !== '' ? 'true' : undefined,
        'aria-describedby': selectable && props.fieldError !== undefined && props.fieldError !== '' ? props.errorId : undefined,
      },
        legend,
        h('div', {
          className: 'dsh-iu2-chart-wrap',
          'data-selectable': selectable,
        }, h('svg', {
          className: 'dsh-iu2-chart-svg',
          viewBox: '0 0 ' + geometry.width + ' ' + geometry.height,
          role: 'img',
          preserveAspectRatio: 'xMidYMid meet',
          'aria-label': ariaLabel,
        }, content), tooltipNode))
    }

    /** Boundaried render of one child list (recursion point for containers). */
    function renderChildNodes(children, context, prefix) {
      const output = []
      if (!Array.isArray(children)) return output
      const tr = translator(context.t)
      const base = typeof prefix === 'string' ? prefix : 'n'
      for (let index = 0; index < children.length; index++) {
        const child = children[index]
        if (!isRecord(child)) continue
        if (!isVisibleNode(child, context.scope)) continue
        output.push(h(NodeBoundary, { key: index, text: tr('card.nodeError') },
          h(NodeView, { node: child, context, slot: base + '.' + index })))
      }
      return output
    }

    /** v3 image: http(s) only, fixed height band, graceful load failure. */
    function ImageView(props) {
      const { node, t } = props
      const tr = translator(t)
      const [failed, setFailed] = React.useState(false)
      const src = safeHttpUrl(node.src)
      const alt = typeof node.alt === 'string' ? node.alt : ''
      const height = clamp(isFiniteNumber(node.height) ? node.height : 160, 80, 320)
      const fit = node.fit === 'contain' ? 'contain' : 'cover'
      const radius = radiusOf(node.radius)
      const fallbackText = alt !== '' ? alt : tr('card.imageFailed')
      if (src === undefined || failed) {
        return h('div', {
          className: 'dsh-iu2-image-fallback',
          role: 'img',
          'aria-label': fallbackText,
          style: { minHeight: Math.min(height, 140) + 'px', borderRadius: radius },
        }, fallbackText)
      }
      return h('img', {
        className: 'dsh-iu2-image',
        src,
        alt,
        loading: 'lazy',
        style: { height: height + 'px', objectFit: fit, borderRadius: radius },
        onError: () => setFailed(true),
      })
    }

    /** v3 tabs: local selection only; switching never reaches the model. */
    function TabsView(props) {
      const { node, context, slot } = props
      const tr = translator(context.t)
      const tabs = Array.isArray(node.tabs) ? node.tabs.filter((tab) => isRecord(tab)) : []
      const [selected, setSelected] = React.useState(0)
      if (tabs.length === 0) return h('div', { className: 'dsh-iu2-node-error' }, tr('card.nodeError'))
      if (context.preview === true) {
        const first = tabs[0]
        return h('div', { className: 'dsh-iu2-tabs' },
          h('div', { className: 'dsh-iu2-preview-tab-label' }, richContent(first.label, context.scope, slot + '.pt')),
          h('div', { className: 'dsh-iu2-tabpanel' },
            Array.isArray(first.children) ? renderChildNodes(first.children, context, slot + '.t0') : null))
      }
      const active = clamp(isFiniteNumber(selected) ? Math.round(selected) : 0, 0, tabs.length - 1)
      const current = tabs[active]
      return h('div', { className: 'dsh-iu2-tabs' },
        h('div', { className: 'dsh-iu2-tablist', role: 'tablist' },
          tabs.map((tab, index) => h('button', {
            key: index,
            type: 'button',
            role: 'tab',
            className: 'dsh-iu2-tab',
            'aria-selected': index === active,
            'aria-label': plainText(tab.label, context.scope) || 'Tab ' + String(index + 1),
            onClick: () => setSelected(index),
          }, richContent(tab.label, context.scope, slot + '-tab' + index)))),
        h('div', { className: 'dsh-iu2-tabpanel', role: 'tabpanel' },
          Array.isArray(current.children) ? renderChildNodes(current.children, context, slot + '.t' + active) : null))
    }

    /**
     * One node renderer. It performs no DOM access and owns no hooks except for
     * the dedicated stateful children (tabs, image); a thrown computation is
     * caught by the per-node error boundary below.
     */
    function NodeView(props) {
      const { node, context, slot } = props
      const { scope, values, setValue, uid, t, busy, errors } = context
      const tr = translator(t)
      const kind = node.kind
      const controlId = uid + '-' + (typeof node.id === 'string' && node.id !== '' ? node.id : String(slot))
      const labelText = labelOf(node, scope)
      const labelContent = richContent(node.label, scope, controlId + '-label')
      const fieldError = isRecord(errors) && errors[node.id] === true ? tr('card.required') : ''
      const errorId = controlId + '-error'

      /* ---- v3/v4 layout containers ---- */

      if (kind === 'list') {
        const items = Array.isArray(node.items) ? node.items : []
        const itemName = itemNameOf(node)
        const style = {}
        if (isFiniteNumber(node.gap)) style.gap = clamp(node.gap, 0, 8) + 'px'
        // Host forbids nested lists in a template; a malformed program still
        // degrades per item instead of recursing.
        if (!isRecord(node.template) || node.template.kind === 'list') {
          return h('div', { className: 'dsh-iu2-list', style },
            h('div', { className: 'dsh-iu2-node-error' }, tr('card.nodeError')))
        }
        const templateControl = findTemplateControl(node.template)
        return h('div', { className: 'dsh-iu2-list', style },
          items.map((item, index) => {
            if (!isRecord(item)) return null
            const itemScope = itemScopeOf(scope, itemName, item)
            let itemContext = Object.assign({}, context, { scope: itemScope })
            if (templateControl !== undefined && typeof templateControl.id === 'string') {
              // v6.1: per-item state lives under an internal key; the template
              // control sees a scoped `values`/`setValue`/`errors` face.
              const key = listItemKey(slot, index, templateControl.id)
              const fallback = itemInitialValue(templateControl, item)
              const current = isRecord(values) && hasOwn(values, key) ? values[key] : fallback
              const scopedValues = Object.assign({}, values, { [templateControl.id]: current })
              const scopedErrors = {}
              if (isRecord(errors) && errors[key] === true) scopedErrors[templateControl.id] = true
              itemContext = Object.assign({}, context, {
                scope: itemScope,
                values: scopedValues,
                errors: scopedErrors,
                setValue: (id, next) => setValue(listItemKey(slot, index, id), next),
              })
            }
            return h('div', { key: index, className: 'dsh-iu2-list-item', 'data-item-index': index },
              renderChildNodes([node.template], itemContext, slot + '.i' + index + '.tpl'))
          }))
      }
      if (kind === 'section') {
        const titleContent = node.title === undefined ? [] : richContent(node.title, scope, controlId + '-title')
        const descContent = node.description === undefined ? [] : richContent(node.description, scope, controlId + '-desc')
        return h('section', { className: 'dsh-iu2-section' },
          titleContent.length === 0 ? null : h('div', { className: 'dsh-iu2-section-title' }, titleContent),
          descContent.length === 0 ? null : h('div', { className: 'dsh-iu2-section-desc' }, descContent),
          h('div', { className: 'dsh-iu2-container-children' }, renderChildNodes(node.children, context, slot)))
      }
      if (kind === 'box') {
        const style = {}
        if (isFiniteNumber(node.padding)) style.padding = clamp(node.padding, 0, 8) + 'px'
        if (isFiniteNumber(node.gap)) style.gap = clamp(node.gap, 0, 8) + 'px'
        if (node.border === true) style.border = '0.5px solid var(--dsw-alias-border-l2,rgba(20,26,40,.1))'
        const radius = radiusOf(node.radius)
        if (radius !== undefined) style.borderRadius = radius
        const background = backgroundOf(node.background)
        if (background !== undefined) style.background = background
        return h('div', { className: 'dsh-iu2-box', style }, renderChildNodes(node.children, context, slot))
      }
      if (kind === 'row') {
        const style = {}
        if (isFiniteNumber(node.gap)) style.gap = clamp(node.gap, 0, 8) + 'px'
        if (node.wrap === true) style.flexWrap = 'wrap'
        if (node.align === 'center') style.alignItems = 'center'
        else if (node.align === 'end') style.alignItems = 'flex-end'
        else if (node.align === 'start') style.alignItems = 'flex-start'
        else if (node.align === 'stretch') style.alignItems = 'stretch'
        return h('div', { className: 'dsh-iu2-lrow', style }, renderChildNodes(node.children, context, slot))
      }
      if (kind === 'columns') {
        const columns = Array.isArray(node.columns) ? node.columns : []
        const style = { gridTemplateColumns: 'repeat(' + String(Math.max(1, columns.length)) + ', minmax(0, 1fr))' }
        if (isFiniteNumber(node.gap)) style.gap = clamp(node.gap, 0, 8) + 'px'
        return h('div', { className: 'dsh-iu2-columns', style },
          columns.map((column, index) => h('div', { key: index, className: 'dsh-iu2-column' },
            isRecord(column) ? renderChildNodes(column.children, context, slot + '.c' + index) : null)))
      }
      if (kind === 'grid') {
        const count = clamp(isFiniteNumber(node.columns) ? Math.round(node.columns) : 2, 2, 4)
        const style = { gridTemplateColumns: 'repeat(' + String(count) + ', minmax(0, 1fr))' }
        if (isFiniteNumber(node.gap)) style.gap = clamp(node.gap, 0, 8) + 'px'
        return h('div', { className: 'dsh-iu2-grid', style }, renderChildNodes(node.children, context, slot))
      }
      if (kind === 'tabs') {
        return h(TabsView, { node, context, slot })
      }

      /* ---- v2 controls + v3 media/data controls ---- */

      if (kind === 'heading') {
        return h('div', { className: 'dsh-iu2-heading', role: 'heading', 'aria-level': 3 }, richContent(node.text, scope, controlId + '-t'))
      }
      if (kind === 'text') {
        return h('div', { className: 'dsh-iu2-text' }, richContent(node.text, scope, controlId + '-t'))
      }
      if (kind === 'divider') {
        return h('div', { className: 'dsh-iu2-divider', role: 'separator' })
      }
      if (kind === 'callout') {
        return h('div', { className: 'dsh-iu2-callout', 'data-tone': toneOf(node) }, richContent(node.text, scope, controlId + '-t'))
      }
      if (kind === 'badge') {
        return h('span', { className: 'dsh-iu2-badge', 'data-tone': toneOf(node) }, richContent(node.text, scope, controlId + '-t'))
      }
      if (kind === 'stat') {
        return h('div', { className: 'dsh-iu2-stat' },
          h('div', { className: 'dsh-iu2-stat-label' }, richContent(node.label, scope, controlId + '-l')),
          h('div', { className: 'dsh-iu2-stat-value' }, richContent(node.value, scope, controlId + '-v')),
          node.hint === undefined ? null : h('div', { className: 'dsh-iu2-stat-hint' }, richContent(node.hint, scope, controlId + '-h')))
      }
      if (kind === 'progress') {
        const value = clamp(isFiniteNumber(node.value) ? node.value : 0, 0, 100)
        const labelValue = node.label === undefined ? tr('card.progress') : plainText(node.label, scope)
        const head = node.label === undefined
          ? h('div', { className: 'dsh-iu2-progress-head' }, h('span', null, tr('card.progress')), h('span', null, String(Math.round(value)) + '%'))
          : h('div', { className: 'dsh-iu2-progress-head' }, h('span', null, richContent(node.label, scope, controlId + '-l')), h('span', null, String(Math.round(value)) + '%'))
        return h('div', { className: 'dsh-iu2-progress' }, head,
          h('div', {
            className: 'dsh-iu2-progress-track',
            role: 'progressbar',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': Math.round(value),
            'aria-label': labelValue,
          }, h('div', { className: 'dsh-iu2-progress-fill', style: { width: value + '%' } })))
      }
      if (kind === 'table') {
        const columns = Array.isArray(node.columns) ? node.columns : []
        const rows = Array.isArray(node.rows) ? node.rows : []
        return h('div', { className: 'dsh-iu2-table-wrap' },
          h('table', { className: 'dsh-iu2-table' },
            h('thead', null, h('tr', null, columns.map((column, index) => h('th', { key: index, scope: 'col' }, plainText(column, scope))))),
            h('tbody', null, rows.map((row, rowIndex) => h('tr', { key: rowIndex },
              columns.map((column, columnIndex) => h('td', { key: columnIndex },
                richContent(Array.isArray(row) ? row[columnIndex] : undefined, scope, controlId + '-c' + rowIndex + '-' + columnIndex))))))))
      }
      if (kind === 'chart') {
        // v6: an id-bearing bar/line/area/pie/donut chart is a selectable field.
        const chartSelectable = typeof node.id === 'string' && node.id !== '' &&
          SELECTABLE_CHART_MODES.indexOf(chartModeOf(node)) !== -1
        if (!chartSelectable) return h(ChartView, { node, scope, t })
        const chartLabel = labelContent.length > 0
          ? labelContent
          : (typeof node.title === 'string' && node.title !== '' ? node.title : tr('card.chart.selectLabel'))
        return h('div', {
          className: 'dsh-iu2-field',
          role: 'group',
          'aria-label': labelText,
          'aria-invalid': fieldError === '' ? undefined : 'true',
          'aria-describedby': fieldError === '' ? undefined : errorId,
        },
          h('span', { className: 'dsh-iu2-label' }, chartLabel),
          h(ChartView, {
            node,
            scope,
            t,
            selectable: true,
            selectedValue: typeof values[node.id] === 'string' ? values[node.id] : '',
            onSelect: (next) => setValue(node.id, next),
            disabled: busy,
            fieldError,
            errorId,
            labelText,
          }),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'image') {
        return h(ImageView, { node, t })
      }
      if (kind === 'link') {
        const content = richContent(node.text, scope, controlId + '-t')
        const href = safeHttpUrl(node.href)
        if (href === undefined) return h('div', { className: 'dsh-iu2-text' }, content)
        return h('a', { className: 'dsh-iu2-link', href, target: '_blank', rel: 'noopener noreferrer' }, content)
      }
      if (kind === 'keyValue') {
        const items = Array.isArray(node.items) ? node.items : []
        const columns = clamp(isFiniteNumber(node.columns) ? Math.round(node.columns) : 1, 1, 2)
        return h('div', { className: 'dsh-iu2-kv', style: { gridTemplateColumns: 'repeat(' + String(columns) + ', minmax(0, 1fr))' } },
          items.map((item, index) => (isRecord(item) ? h('div', { key: index, className: 'dsh-iu2-kv-item' },
            h('div', { className: 'dsh-iu2-kv-label' }, richContent(item.label, scope, controlId + '-k' + index)),
            h('div', { className: 'dsh-iu2-kv-value' }, richContent(item.value, scope, controlId + '-v' + index))) : null)))
      }
      if (kind === 'steps') {
        const items = Array.isArray(node.items) ? node.items : []
        return h('ol', { className: 'dsh-iu2-steps' },
          items.map((item, index) => {
            if (!isRecord(item)) return null
            const state = item.state === 'done' || item.state === 'current' ? item.state : 'pending'
            return h('li', { key: index, className: 'dsh-iu2-step', 'data-state': state },
              h('span', { className: 'dsh-iu2-step-marker', 'aria-hidden': 'true' }),
              h('div', { className: 'dsh-iu2-step-body' },
                h('div', { className: 'dsh-iu2-step-label' }, richContent(item.label, scope, controlId + '-s' + index)),
                item.description === undefined ? null : h('div', { className: 'dsh-iu2-step-desc' }, richContent(item.description, scope, controlId + '-sd' + index))))
          }))
      }
      if (kind === 'choice') {
        const options = Array.isArray(node.options) ? node.options : []
        const current = values[node.id] === undefined || values[node.id] === null ? '' : String(values[node.id])
        const columns = clamp(isFiniteNumber(node.columns) ? Math.round(node.columns) : 1, 1, 3)
        return h('div', { className: 'dsh-iu2-field' },
          labelContent.length === 0 ? null : h('span', { className: 'dsh-iu2-label' }, labelContent),
          h('div', {
            className: 'dsh-iu2-choice-grid',
            role: 'radiogroup',
            'aria-label': labelText,
            style: { gridTemplateColumns: 'repeat(' + String(columns) + ', minmax(0, 1fr))' },
          }, options.map((option, index) => {
            if (!isRecord(option)) return null
            const optionValue = String(option.value)
            const selected = current === optionValue
            return h('label', { key: index, className: 'dsh-iu2-choice-card', 'data-selected': selected },
              h('input', {
                type: 'radio',
                name: controlId,
                value: optionValue,
                checked: selected,
                disabled: busy,
                onChange: () => setValue(node.id, option.value),
              }),
              h('span', { className: 'dsh-iu2-choice-body' },
                h('span', { className: 'dsh-iu2-choice-label' }, richContent(option.label, scope, controlId + '-o' + index)),
                option.description === undefined ? null : h('span', { className: 'dsh-iu2-choice-desc' }, richContent(option.description, scope, controlId + '-od' + index))))
          })))
      }
      if (kind === 'slider') {
        const min = isFiniteNumber(node.min) ? node.min : 0
        const max = isFiniteNumber(node.max) ? node.max : 100
        const step = isFiniteNumber(node.step) && node.step > 0 ? node.step : undefined
        const value = isFiniteNumber(values[node.id]) ? values[node.id] : min
        return h('div', { className: 'dsh-iu2-field' },
          h('div', { className: 'dsh-iu2-row' },
            h('label', { className: 'dsh-iu2-label', htmlFor: controlId }, labelContent),
            h('span', { className: 'dsh-iu2-value' }, String(value))),
          h('input', {
            id: controlId,
            className: 'dsh-iu2-range',
            type: 'range',
            min,
            max,
            step,
            value,
            disabled: busy,
            'aria-label': labelText,
            onChange: (event) => setValue(node.id, Number(event.target.value)),
          }))
      }
      if (kind === 'switch') {
        const checked = values[node.id] === true
        return h('div', { className: 'dsh-iu2-field' },
          h('div', { className: 'dsh-iu2-row' },
            h('span', { className: 'dsh-iu2-label', id: controlId + '-label' }, labelContent),
            h('button', {
              type: 'button',
              className: 'dsh-iu2-switch',
              role: 'switch',
              'aria-checked': checked,
              'aria-labelledby': controlId + '-label',
              'aria-invalid': fieldError === '' ? undefined : 'true',
              'aria-describedby': fieldError === '' ? undefined : errorId,
              disabled: busy,
              onClick: () => setValue(node.id, !checked),
            }, h('span', { className: 'dsh-iu2-knob' }))),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'checkbox') {
        const checked = values[node.id] === true
        return h('div', { className: 'dsh-iu2-field' },
          h('label', { className: 'dsh-iu2-check' },
            h('input', {
              type: 'checkbox',
              checked,
              disabled: busy,
              'aria-invalid': fieldError === '' ? undefined : 'true',
              'aria-describedby': fieldError === '' ? undefined : errorId,
              onChange: (event) => setValue(node.id, event.target.checked),
            }),
            h('span', { className: 'dsh-iu2-label' }, labelContent)),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'select') {
        const options = Array.isArray(node.options) ? node.options : []
        const current = values[node.id] === undefined || values[node.id] === null ? '' : String(values[node.id])
        const known = options.some((option) => isRecord(option) && String(option.value) === current)
        const choose = (event) => {
          const raw = event.target.value
          const found = options.find((option) => isRecord(option) && String(option.value) === raw)
          setValue(node.id, found === undefined ? raw : found.value)
        }
        return h('div', { className: 'dsh-iu2-field' },
          h('label', { className: 'dsh-iu2-label', htmlFor: controlId }, labelContent),
          h('select', { id: controlId, className: 'dsh-iu2-input', value: current, disabled: busy, onChange: choose },
            // The Host always folds a valid `initial`, so this placeholder only
            // appears for a malformed program where the value matches nothing.
            known ? null : h('option', { key: '__empty', value: '' }, '—'),
            options.map((option, index) => (isRecord(option) ? h('option', { key: index, value: String(option.value) }, plainText(option.label, scope)) : null))))
      }
      if (kind === 'radio') {
        const options = Array.isArray(node.options) ? node.options : []
        const current = values[node.id] === undefined || values[node.id] === null ? '' : String(values[node.id])
        return h('div', { className: 'dsh-iu2-field', role: 'radiogroup', 'aria-labelledby': controlId + '-label' },
          h('span', { className: 'dsh-iu2-label', id: controlId + '-label' }, labelContent),
          options.map((option, index) => {
            if (!isRecord(option)) return null
            const optionValue = String(option.value)
            return h('label', { key: index, className: 'dsh-iu2-choice' },
              h('input', {
                type: 'radio',
                name: controlId,
                value: optionValue,
                checked: current === optionValue,
                disabled: busy,
                onChange: () => setValue(node.id, option.value),
              }),
              h('span', { className: 'dsh-iu2-label' }, richContent(option.label, scope, controlId + '-o' + index)))
          }))
      }
      if (kind === 'number') {
        const value = values[node.id]
        const shown = value === undefined || value === null || value === '' ? '' : value
        return h('div', { className: 'dsh-iu2-field' },
          h('label', { className: 'dsh-iu2-label', htmlFor: controlId }, labelContent),
          h('input', {
            id: controlId,
            className: 'dsh-iu2-input',
            type: 'number',
            min: isFiniteNumber(node.min) ? node.min : undefined,
            max: isFiniteNumber(node.max) ? node.max : undefined,
            step: isFiniteNumber(node.step) ? node.step : undefined,
            value: shown,
            disabled: busy,
            'aria-label': labelText,
            onChange: (event) => {
              const raw = event.target.value
              setValue(node.id, raw === '' ? '' : Number(raw))
            },
          }))
      }
      if (kind === 'input') {
        return h('div', { className: 'dsh-iu2-field' },
          h('label', { className: 'dsh-iu2-label', htmlFor: controlId }, labelContent),
          h('input', {
            id: controlId,
            className: 'dsh-iu2-input',
            type: 'text',
            placeholder: typeof node.placeholder === 'string' ? node.placeholder : undefined,
            value: typeof values[node.id] === 'string' ? values[node.id] : '',
            disabled: busy,
            'aria-label': labelText,
            'aria-invalid': fieldError === '' ? undefined : 'true',
            'aria-describedby': fieldError === '' ? undefined : errorId,
            onChange: (event) => setValue(node.id, event.target.value),
          }),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'textarea') {
        const rows = clamp(isFiniteNumber(node.rows) ? node.rows : 3, 2, 8)
        return h('div', { className: 'dsh-iu2-field' },
          h('label', { className: 'dsh-iu2-label', htmlFor: controlId }, labelContent),
          h('textarea', {
            id: controlId,
            className: 'dsh-iu2-input dsh-iu2-textarea',
            rows,
            placeholder: typeof node.placeholder === 'string' ? node.placeholder : undefined,
            value: typeof values[node.id] === 'string' ? values[node.id] : '',
            disabled: busy,
            'aria-label': labelText,
            'aria-invalid': fieldError === '' ? undefined : 'true',
            'aria-describedby': fieldError === '' ? undefined : errorId,
            onChange: (event) => setValue(node.id, event.target.value),
          }),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'stepper') {
        const min = isFiniteNumber(node.min) ? node.min : 0
        const max = isFiniteNumber(node.max) ? node.max : 100
        const step = isFiniteNumber(node.step) && node.step > 0 ? node.step : 1
        const current = typeof values[node.id] === 'number' && Number.isFinite(values[node.id]) ? values[node.id] : min
        const nudge = (delta) => {
          const stepped = min + Math.round(((current + delta * step) - min) / step) * step
          setValue(node.id, clamp(stepped, Math.min(min, max), Math.max(min, max)))
        }
        const button = (key, label, delta, ariaLabel) => h('button', {
          key,
          type: 'button',
          className: 'dsh-iu2-stepper-button',
          disabled: busy,
          'aria-label': ariaLabel,
          onClick: () => nudge(delta),
        }, label)
        return h('div', { className: 'dsh-iu2-field' },
          h('div', { className: 'dsh-iu2-row' },
            h('span', { className: 'dsh-iu2-label', id: controlId + '-label' }, labelContent),
            h('div', {
              className: 'dsh-iu2-stepper',
              role: 'group',
              'aria-labelledby': controlId + '-label',
            },
              button('dec', '−', -1, tr('card.stepper.decrease')),
              h('span', { className: 'dsh-iu2-stepper-value', 'aria-live': 'polite' }, String(current)),
              button('inc', '+', 1, tr('card.stepper.increase')))))
      }
      if (kind === 'rating') {
        const max = clamp(isFiniteNumber(node.max) ? Math.round(node.max) : 5, 3, 10)
        const current = typeof values[node.id] === 'number' && Number.isFinite(values[node.id])
          ? clamp(Math.round(values[node.id]), 0, max)
          : 0
        const stars = []
        for (let index = 1; index <= max; index++) {
          stars.push(h('button', {
            key: index,
            type: 'button',
            role: 'radio',
            className: 'dsh-iu2-star',
            'aria-checked': current === index,
            'aria-label': tr('card.rating.set', { value: index }),
            'data-filled': current >= index,
            disabled: busy,
            onClick: () => setValue(node.id, current === index ? 0 : index),
          }, '★'))
        }
        return h('div', { className: 'dsh-iu2-field' },
          h('span', { className: 'dsh-iu2-label', id: controlId + '-label' }, labelContent),
          h('div', {
            className: 'dsh-iu2-rating',
            role: 'radiogroup',
            'aria-labelledby': controlId + '-label',
            'aria-invalid': fieldError === '' ? undefined : 'true',
            'aria-describedby': fieldError === '' ? undefined : errorId,
          }, stars),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'checklist') {
        const options = Array.isArray(node.options) ? node.options : []
        const selected = checklistValues(node, values[node.id])
        const selectedMap = {}
        for (const value of selected) selectedMap[value] = true
        const columns = clamp(isFiniteNumber(node.columns) ? Math.round(node.columns) : 1, 1, 3)
        const toggle = (optionValue) => {
          const nextMap = {}
          for (const value of selected) nextMap[value] = true
          if (nextMap[optionValue] === true) delete nextMap[optionValue]
          else nextMap[optionValue] = true
          const next = []
          for (const option of options) {
            if (!isRecord(option)) continue
            const value = typeof option.value === 'string' ? option.value : String(option.value)
            if (nextMap[value] === true) next.push(value)
          }
          // Checklist state stays one comma-separated string, never an array.
          setValue(node.id, next.join(','))
        }
        return h('div', {
          className: 'dsh-iu2-field',
          role: 'group',
          'aria-label': labelText,
          'aria-invalid': fieldError === '' ? undefined : 'true',
          'aria-describedby': fieldError === '' ? undefined : errorId,
        },
          labelContent.length === 0 ? null : h('span', { className: 'dsh-iu2-label' }, labelContent),
          h('div', { className: 'dsh-iu2-checklist', style: { gridTemplateColumns: 'repeat(' + String(columns) + ', minmax(0, 1fr))' } },
            options.map((option, index) => {
              if (!isRecord(option)) return null
              const optionValue = typeof option.value === 'string' ? option.value : String(option.value)
              const checked = selectedMap[optionValue] === true
              return h('label', { key: index, className: 'dsh-iu2-choice-card', 'data-selected': checked },
                h('input', {
                  type: 'checkbox',
                  checked,
                  disabled: busy,
                  onChange: () => toggle(optionValue),
                }),
                h('span', { className: 'dsh-iu2-choice-body' },
                  h('span', { className: 'dsh-iu2-choice-label' }, richContent(option.label, scope, controlId + '-o' + index)),
                  option.description === undefined ? null : h('span', { className: 'dsh-iu2-choice-desc' }, richContent(option.description, scope, controlId + '-od' + index))))
            })),
          fieldError === '' ? null : h('div', { className: 'dsh-iu2-error', id: errorId, role: 'alert' }, fieldError))
      }
      if (kind === 'codeblock') {
        const code = typeof node.code === 'string' ? node.code : ''
        const language = typeof node.language === 'string' && node.language !== '' ? node.language : ''
        const titleContent = node.title === undefined ? [] : richContent(node.title, scope, controlId + '-title')
        return h('div', { className: 'dsh-iu2-codeblock' },
          titleContent.length === 0 && language === '' ? null : h('div', { className: 'dsh-iu2-codeblock-head' },
            titleContent.length === 0 ? null : h('span', { className: 'dsh-iu2-codeblock-title' }, titleContent),
            language === '' ? null : h('span', { className: 'dsh-iu2-codeblock-lang' }, language)),
          h('pre', { className: 'dsh-iu2-codeblock-pre' }, h('code', null, code)))
      }
      if (kind === 'quote') {
        return h('blockquote', { className: 'dsh-iu2-quote' },
          h('div', { className: 'dsh-iu2-quote-text' }, richContent(node.text, scope, controlId + '-t')),
          node.cite === undefined ? null : h('div', { className: 'dsh-iu2-quote-cite' }, richContent(node.cite, scope, controlId + '-c')))
      }
      if (kind === 'timeline') {
        const items = Array.isArray(node.items) ? node.items : []
        return h('ol', { className: 'dsh-iu2-timeline' },
          items.map((item, index) => {
            if (!isRecord(item)) return null
            const state = item.state === 'done' || item.state === 'current' ? item.state : 'pending'
            return h('li', { key: index, className: 'dsh-iu2-timeline-item', 'data-state': state },
              h('span', { className: 'dsh-iu2-timeline-marker', 'aria-hidden': 'true' }),
              h('div', { className: 'dsh-iu2-timeline-body' },
                item.time === undefined ? null : h('div', { className: 'dsh-iu2-timeline-time' }, richContent(item.time, scope, controlId + '-tm' + index)),
                h('div', { className: 'dsh-iu2-timeline-label' }, richContent(item.label, scope, controlId + '-tl' + index)),
                item.description === undefined ? null : h('div', { className: 'dsh-iu2-timeline-desc' }, richContent(item.description, scope, controlId + '-td' + index))))
          }))
      }
      if (kind === 'sparkline') {
        return h(SparklineView, { node, scope, t })
      }
      return h('div', { className: 'dsh-iu2-node-error' }, tr('card.nodeError'))
    }

    /** Per-node error boundary: a failing node loses itself, not the card. */
    class NodeBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      render() {
        if (this.state.failed) return h('div', { className: 'dsh-iu2-node-error' }, this.props.text)
        return this.props.children
      }
    }

    /* ------------------------------------------------------------------ *
     * Card component
     * ------------------------------------------------------------------ */

    let uidCounter = 0
    function fallbackUseId() {
      const pair = React.useState(() => {
        uidCounter += 1
        return 'iu2-' + uidCounter
      })
      return pair[0]
    }
    const useUniqueId = typeof React.useId === 'function' ? React.useId : fallbackUseId

    /** One interpreted program. All interaction lives in React state. */
    function IntelligentCard(props) {
      const { meta, submit, t, draftKey, storage } = props
      const tr = translator(t)
      const rawId = useUniqueId()
      const uid = 'iu2-' + String(rawId).replace(/[^A-Za-z0-9_-]/g, '')
      const draftStore = storage === undefined ? storageOf() : storage
      const [values, setValues] = React.useState(() => draftValues(meta, readDraft(draftStore, draftKey)))
      const [phase, setPhase] = React.useState('idle')
      const [failure, setFailure] = React.useState('')
      const [note, setNote] = React.useState(() => {
        const draft = readDraft(draftStore, draftKey)
        return isRecord(draft) && typeof draft.note === 'string' ? draft.note : ''
      })
      const [attempted, setAttempted] = React.useState(false)
      const scope = buildScope(values)
      const isAsk = meta.kind === 'ask'
      const issues = isAsk ? validationIssues(meta, values, scope) : []
      const issueMap = {}
      for (const issue of issues) {
        issueMap[issue.id] = true
        if (typeof issue.key === 'string') issueMap[issue.key] = true
      }
      const busy = phase === 'sending' || phase === 'sent'
      const setValue = React.useCallback((id, next) => {
        setValues((previous) => {
          const updated = Object.is(previous[id], next) ? previous : Object.assign({}, previous, { [id]: next })
          if (updated !== previous) saveDraft(draftStore, draftKey, updated, note)
          return updated
        })
      }, [draftStore, draftKey, note])
      const updateNote = (text) => {
        setNote(text)
        saveDraft(draftStore, draftKey, values, text)
      }
      const submitNow = React.useCallback(() => {
        if (busy || typeof submit !== 'function') return
        const currentIssues = validationIssues(meta, values, buildScope(values))
        if (currentIssues.length > 0) {
          setAttempted(true)
          return
        }
        const text = formatSubmission(meta, values, note)
        if (text === '') return
        setPhase('sending')
        setFailure('')
        Promise.resolve()
          .then(() => submit(text))
          .then(() => {
            clearDraft(draftStore, draftKey)
            setAttempted(false)
            setPhase('sent')
          })
          .catch((reason) => {
            setPhase('error')
            setFailure(errorMessage(reason))
          })
      }, [busy, submit, meta, values, note])

      const title = typeof meta.title === 'string' && meta.title !== '' ? meta.title : tr('card.brand')
      const description = meta.description === undefined ? [] : richContent(meta.description, scope, uid + '-desc')
      const rendered = renderChildNodes(meta.nodes, {
        scope,
        values,
        setValue,
        uid,
        t,
        busy,
        errors: attempted ? issueMap : {},
      }, 'n')

      const submitSpec = isRecord(meta.submit) ? meta.submit : {}
      const allowNote = submitSpec.allowNote !== false
      const noteLabel = typeof submitSpec.noteLabel === 'string' && submitSpec.noteLabel !== '' ? submitSpec.noteLabel : tr('card.notePlaceholder')
      const submitLabel = typeof submitSpec.label === 'string' && submitSpec.label !== '' ? submitSpec.label : tr('card.submit')
      const submittable = formatSubmission(meta, values, note) !== ''
      const canSubmit = isAsk && typeof submit === 'function' && !busy && submittable

      const footer = isAsk ? h('div', { className: 'dsh-iu2-foot' },
        isRecord(meta.ask) && typeof meta.ask.prompt === 'string' && meta.ask.prompt !== ''
          ? h('div', { className: 'dsh-iu2-foot-hint' }, meta.ask.prompt)
          : null,
        allowNote ? h('textarea', {
          className: 'dsh-iu2-input dsh-iu2-textarea',
          rows: 2,
          placeholder: noteLabel,
          'aria-label': noteLabel,
          value: note,
          disabled: busy,
          onChange: (event) => updateNote(event.target.value),
        }) : null,
        h('div', { className: 'dsh-iu2-foot-row' },
          h('button', {
            type: 'button',
            className: 'dsh-iu2-submit',
            disabled: !canSubmit,
            onClick: submitNow,
          }, phase === 'sending' ? tr('card.sending') : submitLabel),
          phase === 'sent' ? h('span', { className: 'dsh-iu2-status', role: 'status' }, tr('card.sent')) : null,
          phase === 'error' ? h('span', { className: 'dsh-iu2-status', role: 'status', 'data-error': 'true' }, tr('card.failed', { message: failure })) : null,
          phase === 'idle' && typeof submit === 'function' && !submittable ? h('span', { className: 'dsh-iu2-status', role: 'status' }, tr('card.empty')) : null,
          attempted && issues.length > 0 ? h('span', { className: 'dsh-iu2-status', role: 'status', 'data-error': 'true' }, tr('card.requiredSummary')) : null)) : null

      return h('div', {
        className: 'dsh-iu2-card',
        'data-intelligent-ui': String(meta.v),
        'data-kind': meta.kind,
      },
        h('style', null, CSS),
        h('div', { className: 'dsh-iu2-head' },
          h('div', { className: 'dsh-iu2-title' }, title),
          description.length === 0 ? null : h('div', { className: 'dsh-iu2-desc' }, description)),
        rendered.length === 0 ? null : h('div', { className: 'dsh-iu2-nodes' }, rendered),
        footer)
    }

    /** Row shown before the program exists, or when the result carries none. */
    function PlaceholderCard(props) {
      const { t, text } = props
      const tr = translator(t)
      return h('div', { className: 'dsh-iu2-card dsh-iu2-placeholder' },
        h('style', null, CSS),
        h('div', { className: 'dsh-iu2-title' }, tr('card.brand')),
        h('div', { className: 'dsh-iu2-invalid' }, text))
    }

    /**
     * v4.1 read-only preview of a still-streaming `source`: title and description
     * only. No controls, no field state, no submission path.
     */
    function SourceSkeleton(props) {
      const { title, description, t } = props
      const tr = translator(t)
      const heading = typeof title === 'string' && title !== '' ? title : tr('card.brand')
      return h('div', {
        className: 'dsh-iu2-card dsh-iu2-skeleton',
        'data-intelligent-ui-skeleton': 'true',
        'aria-busy': 'true',
      },
        h('style', null, CSS),
        h('div', { className: 'dsh-iu2-head' },
          h('div', { className: 'dsh-iu2-title' }, heading),
          typeof description === 'string' && description !== '' ? h('div', { className: 'dsh-iu2-desc' }, description) : null),
        h('div', { className: 'dsh-iu2-skeleton-hint', role: 'status' }, tr('card.generating')),
        h('div', { className: 'dsh-iu2-skeleton-bar', 'aria-hidden': 'true' },
          h('div', { className: 'dsh-iu2-skeleton-bar-fill' })))
    }

    /**
     * v6.2 Phase 2 preview: the normalized, fully-closed nodes of a streaming
     * source rendered through the normal component tree with a disabled context.
     * It holds no submit state, writes no draft, has no required validation and
     * charts are not selectable; tabs show their first panel only.
     */
    function PreviewCard(props) {
      const { meta, t } = props
      const tr = translator(t)
      const rawId = useUniqueId()
      const uid = 'iup-' + String(rawId).replace(/[^A-Za-z0-9_-]/g, '')
      const values = initialState(meta)
      const context = {
        scope: values,
        values,
        setValue: () => {},
        uid,
        t,
        busy: true,
        errors: {},
        preview: true,
      }
      const title = typeof meta.title === 'string' && meta.title !== '' ? meta.title : tr('card.brand')
      const description = typeof meta.description === 'string' ? meta.description : ''
      return h('div', {
        className: 'dsh-iu2-card dsh-iu2-preview',
        'data-intelligent-ui-preview': 'true',
        'aria-busy': 'true',
      },
        h('style', null, CSS),
        h('div', { className: 'dsh-iu2-preview-head' },
          h('span', { className: 'dsh-iu2-preview-badge' }, tr('card.preview')),
          h('span', { className: 'dsh-iu2-title' }, title)),
        description === '' ? null : h('div', { className: 'dsh-iu2-desc' }, description),
        meta.nodes.length === 0 ? null : h('div', { className: 'dsh-iu2-nodes' }, renderChildNodes(meta.nodes, context, 'pv')),
        h('div', { className: 'dsh-iu2-skeleton-hint', role: 'status' }, tr('card.generating')))
    }

    /**
     * v2.2 tool-row summary. The tool call row only says what the turn rendered
     * and where the interactive copy lives; it renders no controls, holds no
     * state, and has no submission path. The full card is the turnTail seat.
     */
    function CardSummary(props) {
      const { meta, t } = props
      const tr = translator(t)
      const isAsk = meta.kind === 'ask'
      const title = typeof meta.title === 'string' && meta.title !== '' ? meta.title : tr('card.brand')
      const kindLabel = tr(isAsk ? 'card.summary.kind.ask' : 'card.summary.kind.deliver')
      const nodes = nodeCount(meta)
      const interactions = interactionCount(meta)
      const nodesLabel = tr('card.summary.nodes', { count: nodes })
      const interactionsLabel = tr('card.summary.interactions', { count: interactions })
      const hint = tr('card.summary.hint')
      const label = title + ' · ' + kindLabel + ' · ' + nodesLabel + ' · ' + interactionsLabel
      return h('div', {
        className: 'dsh-iu2-summary',
        'data-intelligent-ui-summary': String(meta.v),
        'data-kind': isAsk ? 'ask' : 'deliver',
        role: 'group',
        'aria-label': label,
      },
        h('style', null, CSS),
        h('div', { className: 'dsh-iu2-summary-title' }, title),
        h('div', { className: 'dsh-iu2-summary-meta' },
          h('span', { className: 'dsh-iu2-summary-kind', 'data-kind': isAsk ? 'ask' : 'deliver' }, kindLabel),
          h('span', { className: 'dsh-iu2-summary-sep', 'aria-hidden': 'true' }, '·'),
          h('span', null, nodesLabel),
          h('span', { className: 'dsh-iu2-summary-sep', 'aria-hidden': 'true' }, '·'),
          h('span', null, interactionsLabel)),
        h('div', { className: 'dsh-iu2-summary-hint' }, hint))
    }

    /**
     * Keyed toolview body: a summary once settled, placeholders otherwise. It
     * intentionally takes no `submit` prop — submission exists only in turnTail.
     */
    function ToolCallCard(props) {
      const { block, t } = props
      const tr = translator(t)
      const view = viewOfBlock(block)
      if (view.phase === 'ready') return h(CardSummary, { meta: view.meta, t })
      if (view.phase === 'preparing' || view.phase === 'start') {
        // Phase 2: render every fully-closed node we can normalize; a partial
        // source with no such node falls back to the Phase 1 title skeleton.
        const preview = previewFromSource(sourceTextOf(block))
        if (preview !== undefined && preview.nodes.length > 0) {
          return h(PreviewCard, {
            meta: { title: preview.title, description: preview.description, nodes: preview.nodes },
            t,
          })
        }
        const skeleton = sourceSkeletonOf(block)
        if (skeleton !== undefined) {
          return h(SourceSkeleton, { title: skeleton.title, description: skeleton.description, t })
        }
      }
      let text = tr('card.invalid')
      if (view.phase === 'preparing' || view.phase === 'start') text = tr('card.preparing')
      else if (view.phase === 'error') text = tr('card.errorResult')
      else if (view.phase === 'newer') text = tr('card.newer')
      return h(PlaceholderCard, { t, text })
    }

    function RenderUiView(props) {
      return h(ToolCallCard, props)
    }

    function AskWithUiView(props) {
      return h(ToolCallCard, props)
    }

    /* ------------------------------------------------------------------ *
     * TurnTail: the only interactive card (v2.2)
     * ------------------------------------------------------------------ */

    function useAbsentChat(selector) {
      return React.useMemo(() => selector(undefined), [selector])
    }

    /**
     * `conversation.chat.turnTail` view for one program kind. `turn` arrives as
     * a number in 0.2.1-rc.2 and as a Turn object in the contract; both are
     * normalized, and an unresolvable turn renders nothing.
     */
    function makeTurnTailView(expectedKind) {
      return function TurnTailView(props) {
        const { turn, submit, useChat, t } = props
        const useChatHook = typeof useChat === 'function' ? useChat : useAbsentChat
        const turnNumber = turnNumberOf(turn)
        const meta = useChatHook((snapshot) => findMeta(snapshot, turnNumber, expectedKind))
        const tr = translator(t)
        if (!isRecord(meta)) return null
        if (meta.v !== 2 && meta.v !== 3 && meta.v !== 4 && meta.v !== 5 && meta.v !== 6 && meta.v !== 7) return h(PlaceholderCard, { t, text: tr('card.newer') })
        const draftKey = draftKeyOf(props.sessionId, turnNumber, meta.kind, meta.title)
        return h(IntelligentCard, { meta, submit, t, draftKey })
      }
    }

    const RenderUiTail = makeTurnTailView('deliver')
    const AskUiTail = makeTurnTailView('ask')

    /* ------------------------------------------------------------------ *
     * Session submission channel (CONTRACT.md §7)
     * ------------------------------------------------------------------ */

    /** Resolve the session-scoped conversation service used for one send. */
    function conversationOf(ctx, sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') throw new Error('dsh-intelligent-ui: no session id in scope')
      const sessions = ctx === undefined || ctx === null ? undefined : ctx.sessions
      const scoped = sessions !== undefined && sessions !== null && typeof sessions.scope === 'function' ? sessions.scope(sessionId) : undefined
      const conversation = scoped !== undefined && scoped !== null && typeof scoped.get === 'function' ? scoped.get('conversation') : undefined
      if (conversation === undefined || conversation === null || typeof conversation.send !== 'function') {
        throw new Error('dsh-intelligent-ui: conversation service unavailable in this composition')
      }
      return conversation
    }

    function submitter(ctx) {
      return (sessionId) => ({
        submit: (text) => conversationOf(ctx, sessionId).send(text),
      })
    }

    /* ------------------------------------------------------------------ *
     * Plugin entry
     * ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ *
     * Settings page (plugins.bundle.config)
     * ------------------------------------------------------------------ */

    /**
     * Editable output-policy switch for the Plugins page. The value is a
     * volatile Host config field, so saving persists it into the profile patch;
     * the prompt section changes after the plugin reloads.
     */
    function PolicyConfig(props) {
      const form = props.form
      const t = typeof props.t === 'function' ? props.t : (key) => (MESSAGES.zh[key] ?? key)
      const [snapshot, setSnapshot] = React.useState(() => (form && typeof form.getSnapshot === 'function' ? form.getSnapshot() : undefined))
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState(null)

      React.useEffect(() => {
        if (!form || typeof form.subscribe !== 'function') return undefined
        const read = () => setSnapshot(form.getSnapshot())
        read()
        return form.subscribe(read)
      }, [form])

      if (!form) return h('p', { style: { color: 'var(--dsw-alias-label-tertiary,#8a93a3)', fontSize: 12 } }, t('policy.unavailable'))

      const value = snapshot && snapshot.value ? snapshot.value.outputPolicy : undefined
      const balanced = value === 'balanced'
      const writable = !snapshot || snapshot.writable !== false
      const disabled = saving || !writable

      const choose = (next) => {
        if (disabled || next === value) return
        setSaving(true)
        setNotice(null)
        Promise.resolve(form.set('outputPolicy', next)).then((ok) => {
          setNotice(ok === false ? 'failed' : 'saved')
        }).catch(() => setNotice('failed')).finally(() => setSaving(false))
      }

      const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0' }
      const hintStyle = { color: 'var(--dsw-alias-label-tertiary,#8a93a3)', fontSize: 12, lineHeight: '18px', marginTop: 2 }
      const optionStyle = (active) => ({ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px', border: '0.5px solid ' + (active ? 'var(--dsw-alias-state-business-primary,#2f6bff)' : 'var(--dsw-alias-border-l2,rgba(20,26,40,.1))'), borderRadius: 'var(--dsw-radius-md,8px)', background: active ? 'color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6bff) 8%,transparent)' : 'var(--dsw-alias-bg-layer-1,#fff)', cursor: disabled ? 'default' : 'pointer', opacity: disabled && !active ? 0.6 : 1 })
      const dotStyle = (active) => ({ flex: 'none', boxSizing: 'border-box', width: 16, height: 16, marginTop: 2, borderRadius: '50%', border: '1.5px solid ' + (active ? 'var(--dsw-alias-state-business-primary,#2f6bff)' : 'var(--dsw-alias-border-l3,rgba(20,26,40,.16))'), background: active ? 'var(--dsw-alias-state-business-primary,#2f6bff)' : 'transparent' })
      const option = (key, next) => h('label', { style: optionStyle(next === value), onClick: (event) => { event.preventDefault(); choose(next) } },
        h('span', { style: dotStyle(next === value), 'aria-hidden': 'true' }),
        h('span', { style: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 } },
          h('span', { style: { color: 'var(--dsw-alias-label-primary,#1b1f27)', fontSize: 13, lineHeight: '20px' } }, t(key)),
          h('span', { style: hintStyle }, t(key + 'Hint'))))

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }, 'data-intelligent-ui-policy': 'true' },
        h('div', { style: rowStyle },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 } },
            h('div', { style: { color: 'var(--dsw-alias-label-primary,#1b1f27)', fontSize: 14, lineHeight: '20px' } }, t('policy.title')),
            h('div', { style: hintStyle }, t('policy.description')))),
        h('div', { role: 'radiogroup', 'aria-label': t('policy.title'), style: { display: 'flex', flexDirection: 'column', gap: 6 } },
          option('policy.cardsFirst', 'cards-first'),
          option('policy.balanced', 'balanced')),
        h('div', { style: hintStyle }, t('policy.reload')),
        notice === null ? null : h('div', { role: 'status', style: { color: notice === 'failed' ? 'var(--dsw-alias-state-error-primary,#c62828)' : 'var(--dsw-alias-state-success-primary,#12854a)', fontSize: 12, lineHeight: '18px' } }, t(notice === 'failed' ? 'policy.failed' : 'policy.saved')))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: MESSAGES.zh, en: MESSAGES.en }), 'dsh-intelligent-ui: locale')
      // v6.4: the bundle owns a Settings page for its volatile outputPolicy.
      // Optional: a composition without Settings simply has no page.
      if (typeof ctx.inject === 'function') {
        try {
          ctx.inject(['configForms'], (child) => {
            if (!child.configForms || typeof child.configForms.whileServed !== 'function') return
            child.effect(() => child.configForms.whileServed(['intelligent-ui'], () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
              name: 'plugins.bundle.config',
              key: '@an-an-618/dsh-intelligent-ui',
              locale: NS,
              inject: () => ({ form: child.configForms.get('intelligent-ui'), t: ctx.locale.bind(NS) }),
            }, PolicyConfig))), 'dsh-intelligent-ui: policy page')
          })
        } catch (error) {
          if (ctx.logger !== undefined && typeof ctx.logger.warn === 'function') {
            ctx.logger.warn('dsh-intelligent-ui: policy page unavailable', error)
          }
        }
      }
      // v2.2: the tool row is a stateless summary, so it injects nothing. Only
      // the turnTail seat gets the session-scoped submit channel.
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'render_ui',
        locale: NS,
      }, RenderUiView))
      ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'ask_with_ui',
        locale: NS,
      }, AskWithUiView))
      // Optional surface: a composition without the standard chat transcript
      // declares no turnTail slot. There is then no interactive copy at all —
      // the summary still reports the result and the validation receipt stays
      // in the tool transcript.
      const inject = submitter(ctx)
      const tails = [
        ['render-ui-tail', RenderUiTail],
        ['ask-ui-tail', AskUiTail],
      ]
      for (const entry of tails) {
        try {
          ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
            name: 'conversation.chat.turnTail',
            id: entry[0],
            order: 40,
            locale: NS,
            inject,
          }, entry[1]))
        } catch (error) {
          if (ctx.logger !== undefined && typeof ctx.logger.warn === 'function') {
            ctx.logger.warn('dsh-intelligent-ui: turnTail unavailable', error)
          }
        }
      }
    }

    return {
      inject: ['slots', 'sessions', 'locale'],
      apply,
      // Pure helpers and component entry points, exercised by test/client.test.mjs
      // in a DOM-free VM without mounting React.
      __test: {
        NS,
        MESSAGES,
        CSS,
        SERIES_COLORS,
        truthy,
        evalExpr,
        evalRichText,
        buildScope,
        initialState,
        isVisibleNode,
        formatSubmission,
        validationIssues,
        nodeCount,
        childGroupsOf,
        listItemKey,
        listLabelField,
        listItemLabelText,
        findTemplateControl,
        itemInitialValue,
        parseInlineText,
        safeHttpUrl,
        extractPartialSource,
        sourceTextOf,
        sourceSkeletonOf,
        parsePartialJson,
        previewFromSource,
        draftKeyOf,
        draftValues,
        readDraft,
        saveDraft,
        clearDraft,
        chartGeometry,
        chartValue,
        checklistValues,
        sparklineGeometry,
        formatNumber,
        viewOfBlock,
        interactionCount,
        turnNumberOf,
        matchesKind,
        findMeta,
        conversationOf,
        components: { RenderUiView, AskWithUiView, RenderUiTail, AskUiTail, IntelligentCard, ToolCallCard, CardSummary, SourceSkeleton, PreviewCard, ChartView, TabsView, ImageView, SparklineView },
      },
    }
  },
})
