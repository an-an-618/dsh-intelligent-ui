/**
 * Intelligent UI v4 — the control catalog, field validation, limits, RichText
 * helpers and diagnostics.
 *
 * This module is the single source of truth for what a spec may contain. Both
 * the Host compiler (`lib/compile.js`) and the model-facing prompt
 * (`lib/prompt.js`) read it, so a control added here appears in both places.
 *
 * Everything is pure data and pure functions: no I/O, no dynamic code, no
 * `@deepseek-ai/*` imports. Field names and shapes follow `CONTRACT.md` §4,
 * §13 (v3 containers) and §14 (list templates, scatter/heatmap, image policy).
 *
 * @module intelligent-ui/lib/catalog
 */

import { ExprError, parseExpressionWithRefs } from './expr.js'

/** One compile/validation failure, always carrying the offending path. */
export class SpecError extends Error {
  /**
   * @param {string} path - JSON-ish path such as `controls[2].text`.
   * @param {string} message - the specific problem.
   */
  constructor(path, message) {
    super(`intelligent-ui: ${path}: ${message}`)
    this.name = 'SpecError'
    /** Path of the first offending field. */
    this.path = path
  }
}

/** Hard limits from §4.1 / §4.2, the v3 §13 additions and the v4 §14 additions. */
export const LIMITS = Object.freeze({
  /** Whole spec, serialized as UTF-8 JSON (v3 raised this to 128 KiB). */
  specBytes: 128 * 1024,
  title: Object.freeze({ min: 1, max: 120 }),
  description: Object.freeze({ min: 0, max: 400 }),
  controls: Object.freeze({ min: 1, max: 40 }),
  id: Object.freeze({ min: 1, max: 40 }),
  /** Expressions inside title/description. */
  shortExpression: 64,
  /** Expressions in other RichText fields and in visibleWhen (defensive cap). */
  longExpression: 1024,
  tableColumns: Object.freeze({ min: 1, max: 8 }),
  tableRows: Object.freeze({ min: 1, max: 100 }),
  chartCategories: Object.freeze({ min: 1, max: 32 }),
  chartSeries: Object.freeze({ min: 1, max: 6 }),
  chartHeight: Object.freeze({ min: 120, max: 400 }),
  options: Object.freeze({ min: 1, max: 20 }),
  textareaRows: Object.freeze({ min: 2, max: 8 }),
  askPrompt: 2000,
  /** v3: whole-card node budget, nesting depth and per-container child budget. */
  nodeTotal: 120,
  depth: 4,
  children: Object.freeze({ min: 1, max: 20 }),
  gap: Object.freeze({ min: 0, max: 8 }),
  gridColumns: Object.freeze({ min: 2, max: 4 }),
  columnsCount: Object.freeze({ min: 2, max: 4 }),
  tabsCount: Object.freeze({ min: 2, max: 6 }),
  urlMax: 2048,
  imageHeight: Object.freeze({ min: 80, max: 320 }),
  keyValueItems: Object.freeze({ min: 1, max: 12 }),
  keyValueColumns: Object.freeze({ min: 1, max: 2 }),
  stepsItems: Object.freeze({ min: 1, max: 8 }),
  choiceOptions: Object.freeze({ min: 1, max: 6 }),
  choiceColumns: Object.freeze({ min: 1, max: 3 }),
  /** v4 additions. */
  listItems: Object.freeze({ min: 1, max: 50 }),
  heatmapCategories: Object.freeze({ min: 1, max: 24 }),
  heatmapRows: Object.freeze({ min: 1, max: 12 }),
  scatterPoints: Object.freeze({ min: 1, max: 200 }),
  /** v5 additions. */
  code: Object.freeze({ min: 1, max: 4000 }),
  codeLanguage: Object.freeze({ min: 1, max: 20 }),
  timelineItems: Object.freeze({ min: 1, max: 12 }),
  sparkValues: Object.freeze({ min: 2, max: 32 }),
  sparkHeight: Object.freeze({ min: 24, max: 64 }),
  checklistOptions: Object.freeze({ min: 1, max: 10 }),
  checklistColumns: Object.freeze({ min: 1, max: 3 }),
  ratingMax: Object.freeze({ min: 3, max: 10 }),
})

/** Interactive control ids must be plain identifiers because they become expression variables. */
export const ID_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/** Tones shared by callout and badge. */
export const TONES = Object.freeze(['neutral', 'info', 'success', 'warn', 'error'])

/** Radius tokens shared by image and box containers. */
export const RADII = Object.freeze(['none', 'sm', 'md', 'lg', 'xl'])

/** Background tokens for box containers. */
export const BACKGROUNDS = Object.freeze(['base', 'layer-1', 'layer-2', 'muted'])

/** Chart kinds accepted by the `chart` control (v4 adds scatter/heatmap). */
export const CHART_KINDS = Object.freeze(['bar', 'line', 'area', 'pie', 'donut', 'scatter', 'heatmap'])

/** v6: only these chart kinds may carry an `id` and participate in selection. */
export const SELECTABLE_CHART_KINDS = Object.freeze(['bar', 'line', 'area', 'pie', 'donut'])

function field(type, extra = {}) {
  return Object.freeze({ type, ...extra })
}

/**
 * The catalog. `interactive: true` marks a control whose value is part of the
 * submitted answer and whose `id` is required. `fields` declares every accepted
 * field besides `kind`, `id` (interactive only) and `visibleWhen`.
 */
export const CONTROL_KINDS = Object.freeze({
  heading: Object.freeze({ interactive: false, fields: Object.freeze({ text: field('richtext', { required: true }) }) }),
  text: Object.freeze({ interactive: false, fields: Object.freeze({ text: field('richtext', { required: true }) }) }),
  divider: Object.freeze({ interactive: false, fields: Object.freeze({}) }),
  callout: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      text: field('richtext', { required: true }),
      tone: field('enum', { values: TONES }),
    }),
  }),
  badge: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      text: field('richtext', { required: true }),
      tone: field('enum', { values: TONES }),
    }),
  }),
  stat: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      value: field('richtext', { required: true }),
      hint: field('richtext'),
    }),
  }),
  progress: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      value: field('number', { required: true, min: 0, max: 100 }),
      label: field('richtext'),
    }),
  }),
  table: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      columns: field('stringArray', { required: true, minItems: LIMITS.tableColumns.min, maxItems: LIMITS.tableColumns.max }),
      rows: field('rows', { required: true, minItems: LIMITS.tableRows.min, maxItems: LIMITS.tableRows.max }),
    }),
  }),
  chart: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      chart: field('enum', { required: true, values: CHART_KINDS }),
      categories: field('stringArray', { required: true, minItems: LIMITS.chartCategories.min, maxItems: LIMITS.chartCategories.max }),
      series: field('series', { required: true, minItems: LIMITS.chartSeries.min, maxItems: LIMITS.chartSeries.max }),
      height: field('number', { integer: true, min: LIMITS.chartHeight.min, max: LIMITS.chartHeight.max }),
      valueFormat: field('enum', { values: Object.freeze(['number', 'currency', 'percent']) }),
    }),
  }),
  slider: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      min: field('number', { required: true }),
      max: field('number', { required: true }),
      step: field('number'),
      initial: field('number'),
    }),
  }),
  switch: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      initial: field('boolean'),
    }),
  }),
  checkbox: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      initial: field('boolean'),
    }),
  }),
  select: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      options: field('options', { required: true, minItems: LIMITS.options.min, maxItems: LIMITS.options.max }),
      initial: field('string'),
    }),
  }),
  radio: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      options: field('options', { required: true, minItems: LIMITS.options.min, maxItems: LIMITS.options.max }),
      initial: field('string'),
    }),
  }),
  number: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      min: field('number'),
      max: field('number'),
      step: field('number'),
      initial: field('number'),
    }),
  }),
  input: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      placeholder: field('string'),
      initial: field('string'),
    }),
  }),
  textarea: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      placeholder: field('string'),
      initial: field('string'),
      rows: field('number', { integer: true, min: LIMITS.textareaRows.min, max: LIMITS.textareaRows.max }),
    }),
  }),
  image: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      src: field('imageUrl', { required: true }),
      alt: field('string'),
      height: field('number', { integer: true, min: LIMITS.imageHeight.min, max: LIMITS.imageHeight.max }),
      radius: field('enum', { values: RADII }),
      fit: field('enum', { values: Object.freeze(['cover', 'contain']) }),
    }),
  }),
  link: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      href: field('url', { required: true }),
      text: field('richtext', { required: true }),
    }),
  }),
  keyValue: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      items: field('keyValueItems', { required: true, minItems: LIMITS.keyValueItems.min, maxItems: LIMITS.keyValueItems.max }),
      columns: field('number', { integer: true, min: LIMITS.keyValueColumns.min, max: LIMITS.keyValueColumns.max }),
    }),
  }),
  steps: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      items: field('stepsItems', { required: true, minItems: LIMITS.stepsItems.min, maxItems: LIMITS.stepsItems.max }),
    }),
  }),
  codeblock: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      code: field('string', { required: true, min: LIMITS.code.min, max: LIMITS.code.max }),
      language: field('string', { min: LIMITS.codeLanguage.min, max: LIMITS.codeLanguage.max }),
      title: field('richtext'),
    }),
  }),
  quote: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      text: field('richtext', { required: true }),
      cite: field('richtext'),
    }),
  }),
  timeline: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      items: field('timelineItems', { required: true, minItems: LIMITS.timelineItems.min, maxItems: LIMITS.timelineItems.max }),
    }),
  }),
  sparkline: Object.freeze({
    interactive: false,
    fields: Object.freeze({
      values: field('sparkValues', { required: true, minItems: LIMITS.sparkValues.min, maxItems: LIMITS.sparkValues.max }),
      height: field('number', { integer: true, min: LIMITS.sparkHeight.min, max: LIMITS.sparkHeight.max }),
      tone: field('enum', { values: TONES }),
    }),
  }),
  choice: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext'),
      required: field('boolean'),
      options: field('choiceOptions', { required: true, minItems: LIMITS.choiceOptions.min, maxItems: LIMITS.choiceOptions.max }),
      initial: field('string'),
      columns: field('number', { integer: true, min: LIMITS.choiceColumns.min, max: LIMITS.choiceColumns.max }),
    }),
  }),
  stepper: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      min: field('number', { integer: true }),
      max: field('number', { integer: true }),
      step: field('number', { integer: true }),
      initial: field('number'),
    }),
  }),
  rating: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext', { required: true }),
      required: field('boolean'),
      max: field('number', { integer: true, min: LIMITS.ratingMax.min, max: LIMITS.ratingMax.max }),
      initial: field('number'),
    }),
  }),
  checklist: Object.freeze({
    interactive: true,
    fields: Object.freeze({
      label: field('richtext'),
      required: field('boolean'),
      options: field('checklistOptions', { required: true, minItems: LIMITS.checklistOptions.min, maxItems: LIMITS.checklistOptions.max }),
      initial: field('string'),
      columns: field('number', { integer: true, min: LIMITS.checklistColumns.min, max: LIMITS.checklistColumns.max }),
    }),
  }),
  // v3 containers: recursive layout nodes. `children`/`branches` describe the
  // nested node lists; the compiler walks them (they are not plain fields).
  section: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({
      title: field('richtext'),
      description: field('richtext'),
    }),
    children: Object.freeze({ key: 'children', min: LIMITS.children.min, max: LIMITS.children.max }),
  }),
  box: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({
      padding: field('number', { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max }),
      gap: field('number', { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max }),
      border: field('boolean'),
      radius: field('enum', { values: RADII }),
      background: field('enum', { values: BACKGROUNDS }),
    }),
    children: Object.freeze({ key: 'children', min: LIMITS.children.min, max: LIMITS.children.max }),
  }),
  row: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({
      gap: field('number', { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max }),
      align: field('enum', { values: Object.freeze(['start', 'center', 'end', 'stretch']) }),
      wrap: field('boolean'),
    }),
    children: Object.freeze({ key: 'children', min: LIMITS.children.min, max: LIMITS.children.max }),
  }),
  grid: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({
      columns: field('number', { required: true, integer: true, min: LIMITS.gridColumns.min, max: LIMITS.gridColumns.max }),
      gap: field('number', { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max }),
    }),
    children: Object.freeze({ key: 'children', min: LIMITS.children.min, max: LIMITS.children.max }),
  }),
  columns: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({
      gap: field('number', { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max }),
    }),
    branches: Object.freeze({
      key: 'columns',
      count: LIMITS.columnsCount,
      childrenKey: 'children',
      minChildren: LIMITS.children.min,
      maxChildren: LIMITS.children.max,
      fields: Object.freeze({}),
    }),
  }),
  tabs: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({}),
    branches: Object.freeze({
      key: 'tabs',
      count: LIMITS.tabsCount,
      childrenKey: 'children',
      minChildren: LIMITS.children.min,
      maxChildren: LIMITS.children.max,
      fields: Object.freeze({ label: field('richtext', { required: true }) }),
    }),
  }),
  // v4: `items` (primitive records) + one `template` Node. The compiler expands
  // the template per item on the Client and scopes `itemName.field` references.
  list: Object.freeze({
    container: true,
    interactive: false,
    fields: Object.freeze({
      itemName: field('string'),
      itemLabel: field('string'),
      gap: field('number', { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max }),
    }),
    list: Object.freeze({
      itemsKey: 'items',
      templateKey: 'template',
      itemNameKey: 'itemName',
      itemLabelKey: 'itemLabel',
      defaultItemName: 'item',
      maxItems: LIMITS.listItems.max,
    }),
  }),
})

/** All control kinds, in prompt order. */
export const KINDS = Object.freeze(Object.keys(CONTROL_KINDS))

/** Kinds that produce a submitted field. */
export const INTERACTIVE_KINDS = Object.freeze(
  new Set(KINDS.filter((kind) => CONTROL_KINDS[kind].interactive)),
)

/** v3 containers (recursive layout nodes). */
export const CONTAINER_KINDS = Object.freeze(
  new Set(KINDS.filter((kind) => CONTROL_KINDS[kind].container === true)),
)

/** Whether one kind is a v3 container node. */
export function isContainerKind(kind) {
  return CONTAINER_KINDS.has(kind)
}

/** UTF-8 byte length of a string, without depending on Buffer. */
export function bytesOf(text) {
  return new TextEncoder().encode(String(text)).length
}

/** Throw a path-aware diagnostic unless the value is a plain object. */
export function assertObject(value, path) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SpecError(path, 'must be an object')
  }
  return value
}

/** Reject any field the catalog does not declare for this node. */
export function assertAllowedKeys(object, allowed, path) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new SpecError(`${path}.${key}`, 'unknown field')
  }
}

function optionalText(value, path, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'string') throw new SpecError(path, 'must be a string')
  if (value.length < min) throw new SpecError(path, `must be at least ${min} character(s)`)
  if (value.length > max) throw new SpecError(path, `must be at most ${max} characters`)
  return value
}

export function requiredNumber(value, path, descriptor) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new SpecError(path, 'must be a finite number')
  if (descriptor.integer === true && !Number.isInteger(value)) throw new SpecError(path, 'must be an integer')
  if (descriptor.min !== undefined && value < descriptor.min) throw new SpecError(path, `must be >= ${descriptor.min}`)
  if (descriptor.max !== undefined && value > descriptor.max) throw new SpecError(path, `must be <= ${descriptor.max}`)
  return value
}

/**
 * Interpolation delimiters, canonical first.
 *
 * `{= expr }` is the only form the model is taught. `{{ expr }}` is still
 * accepted as a legacy alias, but it must never appear in model-facing prompt
 * text: DSH renders system-prompt sections as templates where `{{name}}` is a
 * variable reference, and any other `{{ … }}` aborts every turn with
 * "malformed prompt variable reference".
 */
export const EXPRESSION_DELIMITERS = Object.freeze([
  Object.freeze({ open: '{=', close: '}' }),
  Object.freeze({ open: '{{', close: '}}' }),
])

/** Find the earliest opening delimiter at or after `from`, or null. */
function findExpressionStart(text, from) {
  let best = null
  for (const delimiter of EXPRESSION_DELIMITERS) {
    const index = text.indexOf(delimiter.open, from)
    if (index !== -1 && (best === null || index < best.index)) best = { index, ...delimiter }
  }
  return best
}

/**
 * Find the closing delimiter of one interpolation, ignoring braces inside a
 * quoted string. Returns -1 when the interpolation is never closed.
 */
function findExpressionEnd(text, from, close) {
  let quote = ''
  let escaped = false
  for (let index = from; index <= text.length - close.length; index += 1) {
    const char = text[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (text.startsWith(close, index)) return index
  }
  return -1
}

/**
 * Compile one RichText string into `{ parts: [...] }`.
 *
 * Literal text stays literal; every `{= expression }` (or legacy `{{ expression }}`)
 * becomes an AST. Adjacent
 * literal runs are merged, and a pure string still yields a single `lit` part so
 * the Client handles exactly one shape.
 *
 * @param {string} value - spec string, possibly containing `{= … }` / `{{ … }}`.
 * @param {string} path - diagnostic path.
 * @param {{ allowedRefs: Set<string>, maxExpression?: number }} options
 * @returns {{ parts: Array<{k: 'lit', v: string} | {k: 'expr', e: object}> }}
 */
export function compileRichText(value, path, options) {
  if (typeof value !== 'string') throw new SpecError(path, 'must be a string')
  const allowedRefs = options.allowedRefs
  const maxExpression = options.maxExpression ?? LIMITS.longExpression
  const parts = []
  const pushLiteral = (text) => {
    if (text === '') return
    const last = parts[parts.length - 1]
    if (last !== undefined && last.k === 'lit') last.v += text
    else parts.push({ k: 'lit', v: text })
  }
  let cursor = 0
  while (cursor < value.length) {
    const start = findExpressionStart(value, cursor)
    if (start === null) {
      pushLiteral(value.slice(cursor))
      break
    }
    pushLiteral(value.slice(cursor, start.index))
    const bodyStart = start.index + start.open.length
    const close = findExpressionEnd(value, bodyStart, start.close)
    if (close === -1) throw new SpecError(path, `unclosed "${start.open}" expression`)
    const source = value.slice(bodyStart, close).trim()
    if (source === '') throw new SpecError(path, `empty "${start.open} ${start.close}" expression`)
    if (source.length > maxExpression) throw new SpecError(path, `expression must be at most ${maxExpression} characters`)
    let ast
    try {
      ast = parseExpressionWithRefs(source, allowedRefs)
    } catch (error) {
      if (error instanceof ExprError) throw new SpecError(path, `expression ${JSON.stringify(source)}: ${error.message}`)
      throw error
    }
    parts.push({ k: 'expr', e: ast })
    cursor = close + start.close.length
  }
  if (parts.length === 0) parts.push({ k: 'lit', v: '' })
  return { parts }
}

/** Concatenate the literal parts of a RichText (expression parts count as empty). */
export function plainText(richText) {
  if (richText === undefined || richText === null) return ''
  if (!Array.isArray(richText.parts)) return ''
  return richText.parts.map((part) => (part.k === 'lit' ? part.v : '')).join('')
}

function compileEnum(value, path, descriptor) {
  if (typeof value !== 'string') throw new SpecError(path, 'must be a string')
  if (!descriptor.values.includes(value)) {
    throw new SpecError(path, `must be one of ${descriptor.values.join(', ')}`)
  }
  return value
}

function compileStringArray(value, path, descriptor) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of strings')
  const min = descriptor.minItems ?? 0
  const max = descriptor.maxItems ?? Number.MAX_SAFE_INTEGER
  if (value.length < min) throw new SpecError(path, `must have at least ${min} item(s)`)
  if (value.length > max) throw new SpecError(path, `must have at most ${max} item(s)`)
  return value.map((item, index) => optionalText(item, `${path}[${index}]`, { min: 0 }))
}

function compileOptions(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of { value, label } objects')
  if (value.length < LIMITS.options.min) throw new SpecError(path, `must have at least ${LIMITS.options.min} item(s)`)
  if (value.length > LIMITS.options.max) throw new SpecError(path, `must have at most ${LIMITS.options.max} item(s)`)
  const seen = new Set()
  return value.map((option, index) => {
    const optionPath = `${path}[${index}]`
    assertObject(option, optionPath)
    assertAllowedKeys(option, ['value', 'label'], optionPath)
    if (typeof option.value !== 'string' || option.value === '') throw new SpecError(`${optionPath}.value`, 'must be a non-empty string')
    if (seen.has(option.value)) throw new SpecError(`${optionPath}.value`, `duplicate option value "${option.value}"`)
    seen.add(option.value)
    if (option.label === undefined) throw new SpecError(`${optionPath}.label`, 'is required')
    return {
      value: option.value,
      label: compileRichText(option.label, `${optionPath}.label`, { allowedRefs }),
    }
  })
}

function compileRows(value, path, allowedRefs, columns) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be a two-dimensional array of RichText cells')
  if (value.length < LIMITS.tableRows.min) throw new SpecError(path, `must have at least ${LIMITS.tableRows.min} row(s)`)
  if (value.length > LIMITS.tableRows.max) throw new SpecError(path, `must have at most ${LIMITS.tableRows.max} row(s)`)
  const width = columns.length
  return value.map((row, rowIndex) => {
    const rowPath = `${path}[${rowIndex}]`
    if (!Array.isArray(row)) throw new SpecError(rowPath, 'must be an array of cells')
    if (row.length !== width) throw new SpecError(rowPath, `must have ${width} cell(s), one per column`)
    return row.map((cell, cellIndex) => compileRichText(cell, `${rowPath}[${cellIndex}]`, { allowedRefs }))
  })
}

/**
 * Compile chart series.
 *
 * Each `values` item is either a plain number (rendered as-is) or a RichText
 * string; a string item is compiled exactly like any other RichText, so it may
 * hold `{= expression }` (or the legacy `{{ expression }}` alias) and the Client
 * recomputes it from local state. The expression may reference interactive
 * control ids only, the same set every other RichText field sees.
 */
function compileSeries(value, path, categoryCount, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of series')
  if (value.length < LIMITS.chartSeries.min) throw new SpecError(path, `must have at least ${LIMITS.chartSeries.min} series`)
  if (value.length > LIMITS.chartSeries.max) throw new SpecError(path, `must have at most ${LIMITS.chartSeries.max} series`)
  return value.map((series, index) => {
    const seriesPath = `${path}[${index}]`
    assertObject(series, seriesPath)
    assertAllowedKeys(series, ['name', 'values'], seriesPath)
    if (series.name !== undefined) optionalText(series.name, `${seriesPath}.name`, { min: 0 })
    if (!Array.isArray(series.values)) {
      throw new SpecError(`${seriesPath}.values`, 'must be an array of numbers or expression strings')
    }
    if (series.values.length !== categoryCount) {
      throw new SpecError(`${seriesPath}.values`, `must have ${categoryCount} value(s), one per category`)
    }
    const values = series.values.map((item, valueIndex) => {
      const itemPath = `${seriesPath}.values[${valueIndex}]`
      if (typeof item === 'number') {
        if (!Number.isFinite(item)) throw new SpecError(itemPath, 'number values must be finite')
        return item
      }
      if (typeof item === 'string') return compileRichText(item, itemPath, { allowedRefs })
      throw new SpecError(itemPath, 'must be a finite number or an expression string')
    })
    return series.name === undefined ? { values } : { name: series.name, values }
  })
}

/** Parse one http(s) URL field (§13.2): string, 1..2048 chars, http/https only. */
function parseHttpUrl(value, path) {
  if (typeof value !== 'string') throw new SpecError(path, 'must be a string')
  if (value.length === 0 || value.length > LIMITS.urlMax) {
    throw new SpecError(path, `must be 1-${LIMITS.urlMax} characters`)
  }
  if (!/^https?:\/\//i.test(value)) throw new SpecError(path, 'must be an http(s) URL')
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new SpecError(path, 'must be a valid http(s) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SpecError(path, 'must be an http(s) URL')
  }
  return parsed
}

/** Validate one generic http(s) URL field (`link.href`); §14.2 keeps link rules unchanged. */
function compileUrl(value, path) {
  parseHttpUrl(value, path)
  return value
}

function normalizeHostname(hostname) {
  let host = String(hostname).toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  return host
}

function isPrivateIPv4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (match === null) return false
  const parts = match.slice(1, 5).map(Number)
  if (parts.some((part) => part > 255)) return true
  const [a, b] = parts
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
}

function isPrivateIPv6(host) {
  if (!host.includes(':')) return false
  if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  // fe80::/10 link-local.
  if (/^fe[89ab][0-9a-f]?:/.test(host)) return true
  if (host.startsWith('::ffff:')) return isPrivateIPv4(host.slice('::ffff:'.length))
  return false
}

function isForbiddenImageHost(host) {
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === 'local' || host.endsWith('.local')) return true
  return isPrivateIPv4(host) || isPrivateIPv6(host)
}

/** Match a host against the configured allow-list: exact host or a subdomain. */
function matchesAllowedHost(host, allowedHosts) {
  for (const allowed of allowedHosts) {
    const candidate = normalizeHostname(allowed).replace(/^\./, '')
    if (candidate === '') continue
    if (host === candidate || host.endsWith(`.${candidate}`)) return true
  }
  return false
}

/**
 * Validate `image.src` under the v4 image policy (§14.2).
 *
 * Policy: `{ hosts: string[], allowHttp: boolean }`. Empty `hosts` means no
 * host restriction; `allowHttp: false` (the default) accepts only https.
 * Localhost, `.local`, private/loopback IPv4 and IPv6 loopback/link-local hosts
 * are always rejected, even when listed in `hosts`.
 */
function compileImageUrl(value, path, policy) {
  const parsed = parseHttpUrl(value, path)
  const allowHttp = policy !== undefined && policy.allowHttp === true
  if (parsed.protocol === 'http:' && !allowHttp) {
    throw new SpecError(path, 'http images are disabled; use https or enable allowHttpImages')
  }
  const host = normalizeHostname(parsed.hostname)
  if (host === '') throw new SpecError(path, 'must include a host')
  if (isForbiddenImageHost(host)) {
    throw new SpecError(path, `image host "${host}" is not allowed (localhost/private addresses are always rejected)`)
  }
  const hosts = policy !== undefined && Array.isArray(policy.hosts) ? policy.hosts : []
  if (hosts.length > 0 && !matchesAllowedHost(host, hosts)) {
    throw new SpecError(path, `image host "${host}" is not in imageHosts`)
  }
  return value
}

/** Compile `keyValue.items` (§13.2): 1..12 `{ label, value }` RichText pairs. */
function compileKeyValueItems(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of { label, value } items')
  if (value.length < LIMITS.keyValueItems.min || value.length > LIMITS.keyValueItems.max) {
    throw new SpecError(path, `must have ${LIMITS.keyValueItems.min}-${LIMITS.keyValueItems.max} item(s)`)
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    assertObject(item, itemPath)
    assertAllowedKeys(item, ['label', 'value'], itemPath)
    if (item.label === undefined) throw new SpecError(`${itemPath}.label`, 'is required')
    if (item.value === undefined) throw new SpecError(`${itemPath}.value`, 'is required')
    return {
      label: compileRichText(item.label, `${itemPath}.label`, { allowedRefs }),
      value: compileRichText(item.value, `${itemPath}.value`, { allowedRefs }),
    }
  })
}

/** Compile `steps.items` (§13.2): 1..8 `{ label, description?, state? }` entries. */
function compileStepsItems(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of step items')
  if (value.length < LIMITS.stepsItems.min || value.length > LIMITS.stepsItems.max) {
    throw new SpecError(path, `must have ${LIMITS.stepsItems.min}-${LIMITS.stepsItems.max} item(s)`)
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    assertObject(item, itemPath)
    assertAllowedKeys(item, ['label', 'description', 'state'], itemPath)
    if (item.label === undefined) throw new SpecError(`${itemPath}.label`, 'is required')
    const compiled = { label: compileRichText(item.label, `${itemPath}.label`, { allowedRefs }) }
    if (item.description !== undefined) {
      compiled.description = compileRichText(item.description, `${itemPath}.description`, { allowedRefs })
    }
    if (item.state !== undefined) {
      compiled.state = compileEnum(item.state, `${itemPath}.state`, { values: Object.freeze(['done', 'current', 'pending']) })
    }
    return compiled
  })
}

/** Compile `checklist.options` (§15.1): 1..10 multi-select options. */
function compileChecklistOptions(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of { value, label } options')
  if (value.length < LIMITS.checklistOptions.min || value.length > LIMITS.checklistOptions.max) {
    throw new SpecError(path, `must have ${LIMITS.checklistOptions.min}-${LIMITS.checklistOptions.max} item(s)`)
  }
  const seen = new Set()
  return value.map((option, index) => {
    const optionPath = `${path}[${index}]`
    assertObject(option, optionPath)
    assertAllowedKeys(option, ['value', 'label', 'description'], optionPath)
    if (typeof option.value !== 'string' || option.value === '') {
      throw new SpecError(`${optionPath}.value`, 'must be a non-empty string')
    }
    if (seen.has(option.value)) throw new SpecError(`${optionPath}.value`, `duplicate option value "${option.value}"`)
    seen.add(option.value)
    if (option.label === undefined) throw new SpecError(`${optionPath}.label`, 'is required')
    const compiled = {
      value: option.value,
      label: compileRichText(option.label, `${optionPath}.label`, { allowedRefs }),
    }
    if (option.description !== undefined) {
      compiled.description = compileRichText(option.description, `${optionPath}.description`, { allowedRefs })
    }
    return compiled
  })
}

const TIMELINE_STATES = Object.freeze(['done', 'current', 'pending'])

/** Compile `timeline.items` (§15.2): 1..12 chronological entries. */
function compileTimelineItems(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of timeline items')
  if (value.length < LIMITS.timelineItems.min || value.length > LIMITS.timelineItems.max) {
    throw new SpecError(path, `must have ${LIMITS.timelineItems.min}-${LIMITS.timelineItems.max} item(s)`)
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    assertObject(item, itemPath)
    assertAllowedKeys(item, ['label', 'description', 'time', 'state'], itemPath)
    if (item.label === undefined) throw new SpecError(`${itemPath}.label`, 'is required')
    const compiled = { label: compileRichText(item.label, `${itemPath}.label`, { allowedRefs }) }
    if (item.description !== undefined) {
      compiled.description = compileRichText(item.description, `${itemPath}.description`, { allowedRefs })
    }
    if (item.time !== undefined) {
      compiled.time = compileRichText(item.time, `${itemPath}.time`, { allowedRefs })
    }
    if (item.state !== undefined) {
      compiled.state = compileEnum(item.state, `${itemPath}.state`, { values: TIMELINE_STATES })
    }
    return compiled
  })
}

/**
 * Compile `sparkline.values` (§15.2): 2..32 entries, each a finite number or a
 * RichText expression string (same `{= }` rules as chart values).
 */
function compileSparkValues(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of numbers or expression strings')
  if (value.length < LIMITS.sparkValues.min || value.length > LIMITS.sparkValues.max) {
    throw new SpecError(path, `must have ${LIMITS.sparkValues.min}-${LIMITS.sparkValues.max} item(s)`)
  }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new SpecError(itemPath, 'number values must be finite')
      return item
    }
    if (typeof item === 'string') return compileRichText(item, itemPath, { allowedRefs })
    throw new SpecError(itemPath, 'must be a finite number or an expression string')
  })
}

/** Compile `choice.options` (§13.2): 1..6 cards with `{ value, label, description? }`. */
function compileChoiceOptions(value, path, allowedRefs) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of { value, label } options')
  if (value.length < LIMITS.choiceOptions.min || value.length > LIMITS.choiceOptions.max) {
    throw new SpecError(path, `must have ${LIMITS.choiceOptions.min}-${LIMITS.choiceOptions.max} item(s)`)
  }
  const seen = new Set()
  return value.map((option, index) => {
    const optionPath = `${path}[${index}]`
    assertObject(option, optionPath)
    assertAllowedKeys(option, ['value', 'label', 'description'], optionPath)
    if (typeof option.value !== 'string' || option.value === '') {
      throw new SpecError(`${optionPath}.value`, 'must be a non-empty string')
    }
    if (seen.has(option.value)) throw new SpecError(`${optionPath}.value`, `duplicate option value "${option.value}"`)
    seen.add(option.value)
    if (option.label === undefined) throw new SpecError(`${optionPath}.label`, 'is required')
    const compiled = {
      value: option.value,
      label: compileRichText(option.label, `${optionPath}.label`, { allowedRefs }),
    }
    if (option.description !== undefined) {
      compiled.description = compileRichText(option.description, `${optionPath}.description`, { allowedRefs })
    }
    return compiled
  })
}

/**
 * Compile one node's plain fields (everything except `kind`, `id`,
 * `visibleWhen` and the recursive `children`/branch lists).
 *
 * @param {object} descriptor - catalog entry for the kind.
 * @param {object} raw - raw node.
 * @param {string} path - diagnostic path.
 * @param {{ allowedRefs: Set<string>, state: Record<string, unknown> }} env
 * @returns {object} compiled field values.
 */
export function compileFields(descriptor, raw, path, env) {
  const compiled = {}
  for (const [name, fieldDescriptor] of Object.entries(descriptor.fields)) {
    const value = raw[name]
    const fieldPath = `${path}.${name}`
    if (value === undefined) {
      if (fieldDescriptor.required === true) throw new SpecError(fieldPath, 'is required')
      continue
    }
    let result
    switch (fieldDescriptor.type) {
      case 'richtext':
        result = compileRichText(value, fieldPath, { allowedRefs: env.allowedRefs })
        break
      case 'string':
        result = optionalText(value, fieldPath, {
          min: fieldDescriptor.min ?? 0,
          max: fieldDescriptor.max ?? Number.MAX_SAFE_INTEGER,
        })
        break
      case 'number':
        result = requiredNumber(value, fieldPath, fieldDescriptor)
        break
      case 'boolean':
        if (typeof value !== 'boolean') throw new SpecError(fieldPath, 'must be a boolean')
        result = value
        break
      case 'enum':
        result = compileEnum(value, fieldPath, fieldDescriptor)
        break
      case 'stringArray':
        result = compileStringArray(value, fieldPath, fieldDescriptor)
        break
      case 'options':
        result = compileOptions(value, fieldPath, env.allowedRefs)
        break
      case 'url':
        result = compileUrl(value, fieldPath)
        break
      case 'imageUrl':
        result = compileImageUrl(value, fieldPath, env.imagePolicy)
        break
      case 'keyValueItems':
        result = compileKeyValueItems(value, fieldPath, env.allowedRefs)
        break
      case 'stepsItems':
        result = compileStepsItems(value, fieldPath, env.allowedRefs)
        break
      case 'choiceOptions':
        result = compileChoiceOptions(value, fieldPath, env.allowedRefs)
        break
      case 'checklistOptions':
        result = compileChecklistOptions(value, fieldPath, env.allowedRefs)
        break
      case 'timelineItems':
        result = compileTimelineItems(value, fieldPath, env.allowedRefs)
        break
      case 'sparkValues':
        result = compileSparkValues(value, fieldPath, env.allowedRefs)
        break
      case 'rows':
        result = compileRows(value, fieldPath, env.allowedRefs, compiled.columns)
        break
      case 'series':
        result = compileSeries(value, fieldPath, compiled.categories.length, env.allowedRefs)
        break
      default:
        throw new SpecError(fieldPath, `internal: unsupported field type "${fieldDescriptor.type}"`)
    }
    compiled[name] = result
  }
  return compiled
}

/**
 * Compile an optional `visibleWhen` expression (accepted on every node).
 * @returns {object|undefined} the Expr AST, or undefined when absent.
 */
export function compileVisibleWhen(rawVisibleWhen, path, env) {
  if (rawVisibleWhen === undefined) return undefined
  if (typeof rawVisibleWhen !== 'string') throw new SpecError(`${path}.visibleWhen`, 'must be an expression string')
  if (rawVisibleWhen.length > LIMITS.longExpression) {
    throw new SpecError(`${path}.visibleWhen`, `must be at most ${LIMITS.longExpression} characters`)
  }
  try {
    return parseExpressionWithRefs(rawVisibleWhen, env.allowedRefs)
  } catch (error) {
    if (error instanceof ExprError) {
      throw new SpecError(`${path}.visibleWhen`, `expression ${JSON.stringify(rawVisibleWhen)}: ${error.message}`)
    }
    throw error
  }
}

/** Validate and clone `list.items` (§14.1): 1..50 primitive records. */
export function compileListItems(value, path) {
  if (!Array.isArray(value)) throw new SpecError(path, 'is required and must be an array of objects')
  if (value.length < LIMITS.listItems.min || value.length > LIMITS.listItems.max) {
    throw new SpecError(path, `must have ${LIMITS.listItems.min}-${LIMITS.listItems.max} item(s)`)
  }
  const fields = new Set()
  const items = value.map((item, index) => {
    const itemPath = `${path}[${index}]`
    assertObject(item, itemPath)
    const clone = {}
    for (const [key, fieldValue] of Object.entries(item)) {
      if (!ID_PATTERN.test(key)) throw new SpecError(`${itemPath}.${key}`, 'keys must match ^[a-zA-Z_][a-zA-Z0-9_]*$')
      if (typeof fieldValue === 'string') clone[key] = fieldValue
      else if (typeof fieldValue === 'boolean') clone[key] = fieldValue
      else if (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) clone[key] = fieldValue
      else throw new SpecError(`${itemPath}.${key}`, 'must be a string, number or boolean')
      fields.add(key)
    }
    return clone
  })
  return { items, fields: [...fields] }
}

/** Validate `list.itemName` (§14.1); returns the resolved name. */
export function compileItemName(value, path) {
  if (value === undefined) return 'item'
  if (typeof value !== 'string') throw new SpecError(path, 'must be a string')
  if (!ID_PATTERN.test(value)) throw new SpecError(path, 'must match ^[a-zA-Z_][a-zA-Z0-9_]*$')
  return value
}

/**
 * Validate `list.itemLabel` (§17.1): an item field name used as each row's label.
 * When omitted the Client derives the first string field, then the index.
 * @param {unknown} value - raw `itemLabel`.
 * @param {string} path - diagnostic path.
 * @param {Array<Record<string, unknown>>} items - already validated item records.
 * @returns {string|undefined} the validated field name, or undefined when absent.
 */
export function compileItemLabel(value, path, items) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value === '') throw new SpecError(path, 'must be a non-empty field name')
  if (!ID_PATTERN.test(value)) throw new SpecError(path, 'must match ^[a-zA-Z_][a-zA-Z0-9_]*$')
  for (let index = 0; index < items.length; index += 1) {
    if (!Object.hasOwn(items[index], value)) {
      throw new SpecError(path, `field "${value}" is missing from items[${index}]`)
    }
  }
  return value
}

/** Compile scatter series: 1..6 `{ name?, points: [{ x, y }] }` entries, 1..200 points each. */
function compileScatterSeries(value, path) {
  if (!Array.isArray(value)) throw new SpecError(path, 'must be an array of series')
  if (value.length < LIMITS.chartSeries.min || value.length > LIMITS.chartSeries.max) {
    throw new SpecError(path, `must have ${LIMITS.chartSeries.min}-${LIMITS.chartSeries.max} series`)
  }
  return value.map((series, index) => {
    const seriesPath = `${path}[${index}]`
    assertObject(series, seriesPath)
    assertAllowedKeys(series, ['name', 'points'], seriesPath)
    if (series.name !== undefined) optionalText(series.name, `${seriesPath}.name`, { min: 0 })
    if (!Array.isArray(series.points)) throw new SpecError(`${seriesPath}.points`, 'is required and must be an array of { x, y } points')
    if (series.points.length < LIMITS.scatterPoints.min || series.points.length > LIMITS.scatterPoints.max) {
      throw new SpecError(`${seriesPath}.points`, `must have ${LIMITS.scatterPoints.min}-${LIMITS.scatterPoints.max} point(s)`)
    }
    const points = series.points.map((point, pointIndex) => {
      const pointPath = `${seriesPath}.points[${pointIndex}]`
      assertObject(point, pointPath)
      assertAllowedKeys(point, ['x', 'y'], pointPath)
      for (const axis of ['x', 'y']) {
        if (typeof point[axis] !== 'number' || !Number.isFinite(point[axis])) {
          throw new SpecError(`${pointPath}.${axis}`, 'must be a finite number')
        }
      }
      return { x: point.x, y: point.y }
    })
    return series.name === undefined ? { points } : { name: series.name, points }
  })
}

/** Compile heatmap rows: 1..12 `{ label, values }` entries matching the categories width. */
function compileHeatmapRows(value, path, categoryCount) {
  if (!Array.isArray(value)) throw new SpecError(path, 'is required and must be an array of { label, values } rows')
  if (value.length < LIMITS.heatmapRows.min || value.length > LIMITS.heatmapRows.max) {
    throw new SpecError(path, `must have ${LIMITS.heatmapRows.min}-${LIMITS.heatmapRows.max} row(s)`)
  }
  return value.map((row, index) => {
    const rowPath = `${path}[${index}]`
    assertObject(row, rowPath)
    assertAllowedKeys(row, ['label', 'values'], rowPath)
    if (typeof row.label !== 'string') throw new SpecError(`${rowPath}.label`, 'must be a string')
    if (!Array.isArray(row.values)) throw new SpecError(`${rowPath}.values`, 'must be an array of numbers')
    if (row.values.length !== categoryCount) {
      throw new SpecError(`${rowPath}.values`, `must have ${categoryCount} value(s), one per category`)
    }
    const values = row.values.map((cell, cellIndex) => {
      if (typeof cell !== 'number' || !Number.isFinite(cell)) {
        throw new SpecError(`${rowPath}.values[${cellIndex}]`, 'must be a finite number')
      }
      return cell
    })
    return { label: row.label, values }
  })
}

/** Compile one chart node; the accepted fields depend on the chart kind (§14.3). */
function compileChartNode(raw, path, env) {
  assertObject(raw, path)
  if (raw.chart === undefined) throw new SpecError(`${path}.chart`, 'is required')
  const chart = compileEnum(raw.chart, `${path}.chart`, { values: CHART_KINDS })
  const base = ['kind', 'visibleWhen', 'chart', 'height', 'valueFormat']
  const mode = chart === 'scatter' ? 'scatter' : chart === 'heatmap' ? 'heatmap' : 'cartesian'
  const modeFields = mode === 'scatter'
    ? ['series']
    : mode === 'heatmap'
      ? ['categories', 'rows']
      : ['categories', 'series']
  const selectable = Object.hasOwn(raw, 'id') && raw.id !== undefined
  const selectionFields = ['label', 'select', 'initial', 'required']

  if (selectable && !SELECTABLE_CHART_KINDS.includes(chart)) {
    throw new SpecError(`${path}.id`, `is only allowed on ${SELECTABLE_CHART_KINDS.join('/')} charts; "${chart}" cannot be selected`)
  }
  if (!selectable) {
    for (const fieldName of selectionFields) {
      if (Object.hasOwn(raw, fieldName) && raw[fieldName] !== undefined) {
        throw new SpecError(
          `${path}.${fieldName}`,
          fieldName === 'required'
            ? 'is only allowed when the chart has an id'
            : 'is only allowed when the chart has an id',
        )
      }
    }
  }

  const allowed = [...base, ...modeFields, ...(selectable ? ['id', ...selectionFields] : [])]
  assertAllowedKeys(raw, allowed, path)

  const node = { kind: 'chart', chart }
  if (raw.height !== undefined) {
    node.height = requiredNumber(raw.height, `${path}.height`, {
      integer: true,
      min: LIMITS.chartHeight.min,
      max: LIMITS.chartHeight.max,
    })
  }
  if (raw.valueFormat !== undefined) {
    node.valueFormat = compileEnum(raw.valueFormat, `${path}.valueFormat`, {
      values: Object.freeze(['number', 'currency', 'percent']),
    })
  }

  if (mode === 'scatter') {
    if (raw.series === undefined) throw new SpecError(`${path}.series`, 'is required for a scatter chart')
    node.series = compileScatterSeries(raw.series, `${path}.series`)
  } else if (mode === 'heatmap') {
    if (raw.categories === undefined) throw new SpecError(`${path}.categories`, 'is required for a heatmap chart')
    node.categories = compileStringArray(raw.categories, `${path}.categories`, {
      minItems: LIMITS.heatmapCategories.min,
      maxItems: LIMITS.heatmapCategories.max,
    })
    if (raw.rows === undefined) throw new SpecError(`${path}.rows`, 'is required for a heatmap chart')
    node.rows = compileHeatmapRows(raw.rows, `${path}.rows`, node.categories.length)
  } else {
    if (raw.categories === undefined) throw new SpecError(`${path}.categories`, 'is required')
    node.categories = compileStringArray(raw.categories, `${path}.categories`, {
      minItems: LIMITS.chartCategories.min,
      maxItems: LIMITS.chartCategories.max,
    })
    if (raw.series === undefined) throw new SpecError(`${path}.series`, 'is required')
    node.series = compileSeries(raw.series, `${path}.series`, node.categories.length, env.allowedRefs)
  }

  if (selectable) {
    node.id = raw.id
    if (raw.label !== undefined) {
      node.label = compileRichText(raw.label, `${path}.label`, { allowedRefs: env.allowedRefs })
    }
    if (raw.select !== undefined) {
      node.select = compileEnum(raw.select, `${path}.select`, { values: Object.freeze(['category']) })
    }
    if (raw.required !== undefined) {
      if (typeof raw.required !== 'boolean') throw new SpecError(`${path}.required`, 'must be a boolean')
      node.required = raw.required
    }
    const fromState = env.state[node.id]
    const initial = raw.initial !== undefined ? raw.initial : (fromState !== undefined ? fromState : '')
    const initialPath = raw.initial !== undefined ? `${path}.initial` : `state.${node.id}`
    if (typeof initial !== 'string') throw new SpecError(initialPath, 'must be a category string')
    if (initial !== '' && !node.categories.includes(initial)) {
      throw new SpecError(initialPath, 'must be one of the chart categories')
    }
    node.initial = initial
  }

  const visibleWhen = compileVisibleWhen(raw.visibleWhen, path, env)
  if (visibleWhen !== undefined) node.visibleWhen = visibleWhen
  return node
}

/**
 * Compile one leaf control node (not a container).
 *
 * @param {object} raw - raw node from the spec.
 * @param {string} path - full diagnostic path such as `controls[0].children[1]`.
 * @param {{ allowedRefs: Set<string>, state: Record<string, unknown> }} env
 * @returns {object} the compiled node.
 */
export function compileControl(raw, path, env) {
  assertObject(raw, path)
  if (typeof raw.kind !== 'string') throw new SpecError(`${path}.kind`, 'must be a string')
  const descriptor = CONTROL_KINDS[raw.kind]
  if (descriptor === undefined) {
    throw new SpecError(`${path}.kind`, `unknown node "${raw.kind}"; supported: ${KINDS.join(', ')}`)
  }
  if (descriptor.container === true) {
    throw new SpecError(path, `internal: container "${raw.kind}" must be compiled by the tree walker`)
  }
  if (raw.kind === 'chart') return compileChartNode(raw, path, env)
  const allowed = ['kind', 'visibleWhen', ...Object.keys(descriptor.fields)]
  if (descriptor.interactive) allowed.push('id')
  assertAllowedKeys(raw, allowed, path)

  const node = { kind: raw.kind }
  if (descriptor.interactive) {
    if (typeof raw.id !== 'string') throw new SpecError(`${path}.id`, 'is required for interactive controls')
    node.id = raw.id
  }
  Object.assign(node, compileFields(descriptor, raw, path, env))
  // §15.2 default height; emitted so the Client only renders explicit values.
  if (raw.kind === 'sparkline' && node.height === undefined) node.height = 40
  const visibleWhen = compileVisibleWhen(raw.visibleWhen, path, env)
  if (visibleWhen !== undefined) node.visibleWhen = visibleWhen
  if (descriptor.interactive) resolveInteractive(node, raw, path, env)
  return node
}

/** Fold `state`, the control's own `initial`, and kind defaults into one value. */
export function resolveInteractive(node, control, path, env) {
  const fromState = env.state[node.id]
  const hasInitial = control.initial !== undefined
  const value = hasInitial ? control.initial : fromState
  switch (node.kind) {
    case 'slider': {
      if (node.min >= node.max) throw new SpecError(`${path}.min`, 'must be smaller than max')
      if (node.step !== undefined && !(node.step > 0)) throw new SpecError(`${path}.step`, 'must be positive')
      const step = node.step ?? 1
      const initial = value === undefined ? node.min : value
      if (typeof initial !== 'number' || !Number.isFinite(initial)) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, 'must be a finite number for a slider')
      }
      if (initial < node.min || initial > node.max) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be between ${node.min} and ${node.max}`)
      }
      node.step = step
      node.initial = initial
      return
    }
    case 'switch':
    case 'checkbox': {
      const initial = value === undefined ? false : value
      if (typeof initial !== 'boolean') {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be a boolean for ${node.kind}`)
      }
      node.initial = initial
      return
    }
    case 'select':
    case 'radio':
    case 'choice': {
      const values = node.options.map((option) => option.value)
      const initial = value === undefined ? values[0] : value
      if (typeof initial !== 'string') {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be a string for ${node.kind}`)
      }
      if (!values.includes(initial)) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must match one of the option values`)
      }
      node.initial = initial
      return
    }
    case 'number': {
      if (node.min !== undefined && node.max !== undefined && node.min > node.max) {
        throw new SpecError(`${path}.min`, 'must not be greater than max')
      }
      if (node.step !== undefined && !(node.step > 0)) throw new SpecError(`${path}.step`, 'must be positive')
      const initial = value === undefined ? (node.min ?? 0) : value
      if (typeof initial !== 'number' || !Number.isFinite(initial)) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, 'must be a finite number for a number control')
      }
      if (node.min !== undefined && initial < node.min) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be >= ${node.min}`)
      }
      if (node.max !== undefined && initial > node.max) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be <= ${node.max}`)
      }
      node.initial = initial
      return
    }
    case 'input':
    case 'textarea': {
      const initial = value === undefined ? '' : value
      if (typeof initial !== 'string') {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be a string for ${node.kind}`)
      }
      node.initial = initial
      return
    }
    case 'stepper': {
      const min = node.min ?? 0
      const max = node.max ?? 100
      const step = node.step ?? 1
      if (min > max) throw new SpecError(`${path}.min`, 'must not be greater than max')
      if (!(step > 0)) throw new SpecError(`${path}.step`, 'must be positive')
      const initial = value === undefined ? min : value
      if (typeof initial !== 'number' || !Number.isFinite(initial)) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, 'must be a finite number for a stepper')
      }
      if (initial < min || initial > max) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be between ${min} and ${max}`)
      }
      node.min = min
      node.max = max
      node.step = step
      node.initial = initial
      return
    }
    case 'rating': {
      const max = node.max ?? 5
      const initial = value === undefined ? 0 : value
      if (typeof initial !== 'number' || !Number.isFinite(initial)) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, 'must be a finite number for a rating')
      }
      if (initial < 0 || initial > max) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, `must be between 0 and ${max}`)
      }
      node.max = max
      node.initial = initial
      return
    }
    case 'checklist': {
      const initial = value === undefined ? '' : value
      if (typeof initial !== 'string') {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, 'must be a comma-separated string')
      }
      const values = node.options.map((option) => option.value)
      const tokens = initial === '' ? [] : initial.split(',').map((token) => token.trim())
      if (tokens.some((token) => token === '')) {
        throw new SpecError(hasInitial ? `${path}.initial` : `state.${node.id}`, 'must not contain empty entries')
      }
      for (const token of tokens) {
        if (!values.includes(token)) {
          throw new SpecError(
            hasInitial ? `${path}.initial` : `state.${node.id}`,
            `must contain only option values; "${token}" is not one of ${values.join(', ')}`,
          )
        }
      }
      node.initial = tokens.join(',')
      return
    }
    default:
      throw new SpecError(path, `internal: no initial rule for "${node.kind}"`)
  }
}

/**
 * Validate the optional `state` map (§4): every key must name an interactive
 * control, every value must be a scalar.
 * @param {unknown} state - raw `spec.state`.
 * @param {Set<string>} interactiveIds - ids collected from the controls.
 * @returns {Record<string, string|number|boolean>} a detached copy.
 */
export function compileState(state, interactiveIds) {
  if (state === undefined) return {}
  assertObject(state, 'state')
  const copy = {}
  for (const [key, value] of Object.entries(state)) {
    if (!interactiveIds.has(key)) throw new SpecError(`state.${key}`, 'must reference an interactive control id')
    if (typeof value === 'string') copy[key] = value
    else if (typeof value === 'boolean') copy[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) copy[key] = value
    else throw new SpecError(`state.${key}`, 'must be a string, number or boolean')
  }
  return copy
}
