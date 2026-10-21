/**
 * Intelligent UI v4 — Host half.
 *
 * Registers two model-facing tools:
 *
 *  - `render_ui`   → a delivery card (`kind: 'deliver'`), no submit;
 *  - `ask_with_ui` → a question card (`kind: 'ask'`), one submit message back.
 *
 * Both accept either the `spec` object or its compact JSON text in `source`
 * (v4.1 streaming entry; exactly one of them), compile it with
 * `lib/compile.js`, and persist the
 * resulting `CompiledMeta` through `output.presentationMeta`; the Client reads
 * it back as `block.meta` and interprets it. `output.render` is only the short
 * receipt shown to the model, so the compiled program never returns as visible
 * content.
 *
 * No dynamic code: the Host parses expressions but never evaluates them.
 *
 * @module @an-an-618/dsh-intelligent-ui
 */

import { SpecError } from './lib/catalog.js'
import { Config } from './lib/config.js'
import { compileSpec, interactionIds, interactionSummary, nodeCount, parseSource } from './lib/compile.js'
import { SECTION_NAME, SECTION_ORDER, buildPromptSection, toolDescriptions } from './lib/prompt.js'

export const name = 'intelligent-ui'

/** Services required by the Host half (resolved by name, no package imports). */
export const inject = ['tools', 'systemPrompt']

/** Wire tool names. */
export const RENDER_TOOL = 'render_ui'
export const ASK_TOOL = 'ask_with_ui'

const TOOL_NAMES = [RENDER_TOOL, ASK_TOOL]

export { Config }

/** v4.1: `spec` (object) and `source` (compact JSON text) are both optional in
 * the schema; the Host enforces exactly-one at execution time. */
const SPEC_OR_SOURCE = Object.freeze({
  spec: Object.freeze({
    type: 'object',
    description: 'Complete spec object. Provide exactly one of spec or source.',
  }),
  source: Object.freeze({
    type: 'string',
    description: 'Complete spec as compact JSON text. Provide exactly one of spec or source; preferred for long cards because the client can show a read-only skeleton while it streams.',
  }),
})

const PARAMETERS = Object.freeze({
  [RENDER_TOOL]: Object.freeze({
    type: 'object',
    additionalProperties: false,
    properties: SPEC_OR_SOURCE,
  }),
  [ASK_TOOL]: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['ask'],
    properties: Object.freeze({
      ...SPEC_OR_SOURCE,
      ask: Object.freeze({
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: Object.freeze({
          prompt: { type: 'string' },
          submitLabel: { type: 'string' },
          noteLabel: { type: 'string' },
          allowNote: { type: 'boolean' },
        }),
      }),
    }),
  }),
})

/** §6: the receipt object every successful call returns. */
const OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'kind', 'title', 'nodes', 'interactions', 'receipt'],
  properties: {
    ok: { type: 'boolean' },
    kind: { type: 'string' },
    title: { type: 'string' },
    nodes: { type: 'integer' },
    interactions: { type: 'array', items: { type: 'string' } },
    receipt: { type: 'string' },
  },
})

/** Localized submit/note label defaults for `ask_with_ui`. */
function labelDefaults(language) {
  return language === 'en'
    ? { submitLabel: 'Submit', noteLabel: 'Note' }
    : { submitLabel: '提交', noteLabel: '备注' }
}

/** Localized short receipt for one compiled card. */
export function buildReceipt(meta, language) {
  const interactions = interactionSummary(meta)
  const fieldList = interactions.length > 0
    ? interactions.join(language === 'en' ? ', ' : '、')
    : (language === 'en' ? 'no interactive fields' : '无交互控件')
  if (language === 'en') {
    if (meta.kind === 'ask') {
      const note = meta.submit?.allowNote === true
        ? ` The card also accepts an optional note labelled "${meta.submit.noteLabel}".`
        : ''
      return `Rendered the question card "${meta.title}" in the conversation: ${fieldList}, ${nodeCount(meta)} node(s) total. Submit button: "${meta.submit?.label ?? 'Submit'}".${note} The user's answer arrives as one user message starting with [Intelligent UI]; do not describe the options again.`
    }
    return `Rendered "${meta.title}" in the conversation: ${fieldList}, ${nodeCount(meta)} node(s) total. The card is a delivery card: there is no submit button, and the user's local interactions do not start a new turn.`
  }
  if (meta.kind === 'ask') {
    const note = meta.submit?.allowNote === true
      ? `卡片还提供备注输入（「${meta.submit.noteLabel}」）。`
      : ''
    return `已在会话中渲染提问卡「${meta.title}」：${fieldList}，共 ${nodeCount(meta)} 个节点；提交按钮为「${meta.submit?.label ?? '提交'}」。${note}用户提交后你会收到一条以 [Intelligent UI] 开头的用户消息，无需再复述选项。`
  }
  return `已在会话中渲染「${meta.title}」：${fieldList}，共 ${nodeCount(meta)} 个节点。这是交付卡：没有提交按钮，用户的本地交互不会开启新回合。`
}

/**
 * Compile the arguments of one tool call.
 * @param {string} toolName - `render_ui` or `ask_with_ui`.
 * @param {object} args - validated tool arguments.
 * @param {'zh' | 'en'} language - label language for the ask envelope.
 * @returns {object} §6 CompiledMeta.
 */
export function compileToolArgs(toolName, args, language, imagePolicy) {
  if (!isObject(args)) throw new SpecError('arguments', 'must be an object')
  const hasSpec = Object.hasOwn(args, 'spec') && args.spec !== undefined
  const hasSource = Object.hasOwn(args, 'source') && args.source !== undefined
  if (hasSpec === hasSource) {
    throw new SpecError(
      'arguments',
      hasSpec
        ? 'provide exactly one of "spec" (object) or "source" (compact JSON text); both were provided'
        : 'provide exactly one of "spec" (object) or "source" (compact JSON text); neither was provided',
    )
  }
  const spec = hasSource ? parseSource(args.source) : args.spec
  const image = isObject(imagePolicy) ? imagePolicy : { hosts: [], allowHttp: false }
  if (toolName === RENDER_TOOL) return compileSpec(spec, { kind: 'deliver', image })
  if (toolName === ASK_TOOL) {
    return compileSpec(spec, { kind: 'ask', ask: args.ask, defaults: labelDefaults(language), image })
  }
  throw new Error(`intelligent-ui: internal: unknown tool "${toolName}"`)
}

/**
 * Build one registry-ready tool definition.
 * @param {string} toolName - wire name.
 * @param {'zh' | 'en'} language
 * @param {Record<string, object>} cache - per-apply cache from arguments to meta.
 * @param {Record<string, string>} descriptions - localized descriptions.
 */
function toolDefinition(toolName, language, cache, descriptions, imagePolicy) {
  return {
    name: toolName,
    description: descriptions[toolName],
    parameters: PARAMETERS[toolName],
    output: {
      schema: OUTPUT_SCHEMA,
      render(_args, value) {
        return [{ type: 'text', text: value.receipt }]
      },
      presentationMeta(args) {
        const cached = isObject(args) ? cache.get(args) : undefined
        // Recompiling is deterministic; the cache only avoids the extra pass.
        return cached ?? compileToolArgs(toolName, args, language, imagePolicy)
      },
    },
    async execute(args) {
      const meta = compileToolArgs(toolName, args, language, imagePolicy)
      if (isObject(args)) cache.set(args, meta)
      return {
        ok: true,
        kind: meta.kind,
        title: meta.title,
        nodes: nodeCount(meta),
        interactions: interactionIds(meta),
        receipt: buildReceipt(meta, language),
      }
    },
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalize the row config (`prompt`, `language`, image policy) without failing
 * activation. `imageHosts` defaults to `[]` (no host restriction) and
 * `allowHttpImages` to `false` (https only), per CONTRACT §14.2.
 */
/** Volatile config fields are unwrapped to their current plain value. */
function valueOf(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

function readConfig(config) {
  const source = isObject(config) ? config : {}
  const imageHosts = Array.isArray(source.imageHosts)
    ? source.imageHosts
      .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
      .map((entry) => entry.trim().toLowerCase())
    : []
  const language = valueOf(source.language)
  const outputPolicy = valueOf(source.outputPolicy)
  return {
    prompt: valueOf(source.prompt) !== false,
    language: language === 'en' ? 'en' : 'zh',
    outputPolicy: outputPolicy === 'balanced' ? 'balanced' : 'cards-first',
    imagePolicy: { hosts: imageHosts, allowHttp: valueOf(source.allowHttpImages) === true },
  }
}

/**
 * Register both tools and, unless disabled, the model-facing prompt section.
 * @param {object} ctx - plugin context with `tools` and `systemPrompt`.
 * @param {{ prompt?: boolean, language?: 'zh' | 'en', outputPolicy?: 'cards-first' | 'balanced', imageHosts?: string[], allowHttpImages?: boolean }} [config]
 */
export function apply(ctx, config = {}) {
  const settings = readConfig(config)
  const descriptions = toolDescriptions(settings.language)
  const cache = new WeakMap()

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (child) => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'intelligent-ui: settings presentation'))
  }

  if (settings.prompt) {
    const text = buildPromptSection({ language: settings.language, outputPolicy: settings.outputPolicy })
    ctx.effect(() => ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text,
    }))
  }

  for (const toolName of TOOL_NAMES) {
    ctx.tools.register(toolDefinition(toolName, settings.language, cache, descriptions, settings.imagePolicy))
  }
}
