/**
 * Intelligent UI v4 — spec compiler.
 *
 * Turns one declarative spec plus the calling tool's envelope into the
 * `CompiledMeta` persisted through `presentationMeta` (`CONTRACT.md` §6 / §13 / §14):
 *
 *   { v: 7, kind, title, description?, submit?, ask?, nodes }
 *
 * `spec.controls` is a recursive node tree in v3: every entry is either a
 * control or a layout container whose children are nodes again, up to four
 * levels deep, with v4 `list` templates. v2 flat specs remain valid input (the
 * tree is simply one level deep); the Host always emits `v: 4`, and the Client
 * accepts v2/v3/v4/v5/v6/v7.
 *
 * The compiler is a pure function of its input. It never evaluates an
 * expression, never builds code, and never touches I/O; the Client interprets
 * the emitted AST. Every failure is a `SpecError` naming the first offending
 * path (for example `controls[2].children[0].text`), which DSH surfaces as the
 * tool result.
 *
 * @module intelligent-ui/lib/compile
 */

import {
  CHART_KINDS,
  CONTROL_KINDS,
  ID_PATTERN,
  KINDS,
  LIMITS,
  SpecError,
  assertAllowedKeys,
  assertObject,
  bytesOf,
  compileControl,
  compileFields,
  compileItemLabel,
  compileItemName,
  compileListItems,
  compileRichText,
  compileState,
  compileVisibleWhen,
  requiredNumber,
  SELECTABLE_CHART_KINDS,
} from './catalog.js'

/** Top-level spec fields accepted by this version. */
export const SPEC_FIELDS = Object.freeze(['title', 'description', 'state', 'controls'])

/** `ask` envelope fields accepted by this version. */
export const ASK_FIELDS = Object.freeze(['prompt', 'submitLabel', 'noteLabel', 'allowNote'])

/** Program version emitted by this Host. */
export const PROGRAM_VERSION = 7

/** @typedef {'deliver' | 'ask'} Kind */

function readTitle(spec) {
  if (typeof spec.title !== 'string') throw new SpecError('spec.title', 'is required and must be a string')
  const title = spec.title
  if (title.trim() === '') throw new SpecError('spec.title', 'must not be empty')
  if (title.length > LIMITS.title.max) throw new SpecError('spec.title', `must be at most ${LIMITS.title.max} characters`)
  return title
}

function readControls(spec) {
  if (!Array.isArray(spec.controls)) throw new SpecError('spec.controls', 'is required and must be an array')
  if (spec.controls.length < LIMITS.controls.min) {
    throw new SpecError('spec.controls', `must contain at least ${LIMITS.controls.min} control(s)`)
  }
  if (spec.controls.length > LIMITS.controls.max) {
    throw new SpecError('spec.controls', `must contain at most ${LIMITS.controls.max} controls`)
  }
  return spec.controls
}

function readDescription(spec, allowedRefs) {
  if (spec.description === undefined) return undefined
  if (typeof spec.description !== 'string') throw new SpecError('spec.description', 'must be a string')
  if (spec.description.length > LIMITS.description.max) {
    throw new SpecError('spec.description', `must be at most ${LIMITS.description.max} characters`)
  }
  return compileRichText(spec.description, 'spec.description', {
    allowedRefs,
    maxExpression: LIMITS.shortExpression,
  })
}

function nonEmptyText(value, path) {
  if (typeof value !== 'string') throw new SpecError(path, 'must be a string')
  if (value.trim() === '') throw new SpecError(path, 'must not be empty')
  return value
}

function boundedText(value, path, max) {
  const text = nonEmptyText(value, path)
  if (text.length > max) throw new SpecError(path, `must be at most ${max} characters`)
  return text
}

function readAsk(ask, defaults) {
  assertObject(ask, 'ask')
  assertAllowedKeys(ask, ASK_FIELDS, 'ask')
  const prompt = boundedText(ask.prompt, 'ask.prompt', LIMITS.askPrompt)
  const label = ask.submitLabel === undefined
    ? defaults.submitLabel
    : nonEmptyText(ask.submitLabel, 'ask.submitLabel')
  if (ask.allowNote !== undefined && typeof ask.allowNote !== 'boolean') {
    throw new SpecError('ask.allowNote', 'must be a boolean')
  }
  const allowNote = ask.allowNote !== false
  const submit = { label, allowNote }
  if (allowNote) {
    const noteLabel = ask.noteLabel === undefined
      ? defaults.noteLabel
      : nonEmptyText(ask.noteLabel, 'ask.noteLabel')
    submit.noteLabel = noteLabel
  }
  return { ask: { prompt }, submit }
}

/** Validate one container's plain children list and recurse. */
function walkChildren(descriptor, raw, path, depth, stats, interactiveIds, scope, listNames, templateControls) {
  const rule = descriptor.children
  const list = raw[rule.key]
  const listPath = `${path}.${rule.key}`
  if (!Array.isArray(list)) throw new SpecError(listPath, 'is required and must be an array of nodes')
  if (list.length < rule.min || list.length > rule.max) {
    throw new SpecError(listPath, `must have ${rule.min}-${rule.max} child node(s)`)
  }
  list.forEach((child, index) => walkNode(child, `${listPath}[${index}]`, depth + 1, stats, interactiveIds, scope, listNames, templateControls))
}

/** Validate one container's branch lists (`columns` / `tabs`) and recurse. */
function walkBranches(descriptor, raw, path, depth, stats, interactiveIds, scope, listNames, templateControls) {
  const rule = descriptor.branches
  const list = raw[rule.key]
  const listPath = `${path}.${rule.key}`
  if (!Array.isArray(list)) {
    throw new SpecError(listPath, `is required and must be an array of ${rule.count.min}-${rule.count.max} branches`)
  }
  if (list.length < rule.count.min || list.length > rule.count.max) {
    throw new SpecError(listPath, `must have ${rule.count.min}-${rule.count.max} branches`)
  }
  list.forEach((branch, index) => {
    const branchPath = `${listPath}[${index}]`
    assertObject(branch, branchPath)
    assertAllowedKeys(branch, [rule.childrenKey, ...Object.keys(rule.fields)], branchPath)
    const children = branch[rule.childrenKey]
    const childrenPath = `${branchPath}.${rule.childrenKey}`
    if (!Array.isArray(children)) throw new SpecError(childrenPath, 'is required and must be an array of nodes')
    if (children.length < rule.minChildren || children.length > rule.maxChildren) {
      throw new SpecError(childrenPath, `must have ${rule.minChildren}-${rule.maxChildren} child node(s)`)
    }
    children.forEach((child, childIndex) => {
      walkNode(child, `${childrenPath}[${childIndex}]`, depth + 1, stats, interactiveIds, scope, listNames, templateControls)
    })
  })
}

/** Validate one global interactive id against the shared set. */
function validateInteractiveId(rawId, path, interactiveIds) {
  if (typeof rawId !== 'string') throw new SpecError(`${path}.id`, 'is required for interactive controls')
  if (rawId.length < LIMITS.id.min || rawId.length > LIMITS.id.max) {
    throw new SpecError(`${path}.id`, `must be ${LIMITS.id.min}-${LIMITS.id.max} characters`)
  }
  if (!ID_PATTERN.test(rawId)) throw new SpecError(`${path}.id`, `must match ${ID_PATTERN}`)
  if (interactiveIds.has(rawId)) throw new SpecError(`${path}.id`, `duplicate id "${rawId}"`)
  interactiveIds.add(rawId)
}

/**
 * Register the single interactive control a v6.1 list template may contain.
 * Template ids are local: they are validated here for shape, counted once, and
 * never added to the card-wide interactive id set. The caller compares them
 * against the external ids after the whole walk.
 */
function recordTemplateControl(rawId, path, scope, templateControls) {
  const info = scope !== undefined && scope.templateInfo !== undefined ? scope.templateInfo : undefined
  if (info === undefined) throw new SpecError(path, 'internal: template context is missing')
  info.count += 1
  if (info.count > 1) throw new SpecError(path, 'a list template may contain at most one interactive control')
  if (typeof rawId !== 'string') throw new SpecError(`${path}.id`, 'is required for interactive controls')
  if (rawId.length < LIMITS.id.min || rawId.length > LIMITS.id.max) {
    throw new SpecError(`${path}.id`, `must be ${LIMITS.id.min}-${LIMITS.id.max} characters`)
  }
  if (!ID_PATTERN.test(rawId)) throw new SpecError(`${path}.id`, `must match ${ID_PATTERN}`)
  templateControls.push({ path: `${path}.id`, name: rawId })
}

/**
 * Pass 1: structural walk. Collects interactive ids across the whole tree,
 * enforces depth/node/children limits and container/id rules, and validates
 * branch wrappers. Field values and expressions are left to pass 2.
 */
function walkNode(raw, path, depth, stats, interactiveIds, scope, listNames, templateControls) {
  const inTemplate = scope !== undefined && scope.inTemplate === true
  if (depth > LIMITS.depth) throw new SpecError(path, `nesting depth exceeds ${LIMITS.depth} levels`)
  stats.nodes += 1
  if (stats.nodes > LIMITS.nodeTotal) {
    throw new SpecError(path, `the card exceeds ${LIMITS.nodeTotal} nodes`)
  }
  assertObject(raw, path)
  if (typeof raw.kind !== 'string') throw new SpecError(`${path}.kind`, 'must be a string')
  const descriptor = CONTROL_KINDS[raw.kind]
  if (descriptor === undefined) {
    throw new SpecError(`${path}.kind`, `unknown node "${raw.kind}"; supported: ${KINDS.join(', ')}`)
  }
  if (inTemplate && descriptor.list !== undefined) {
    throw new SpecError(path, 'nested list containers are not allowed inside a list template')
  }
  if (descriptor.container === true) {
    if (Object.hasOwn(raw, 'id')) throw new SpecError(`${path}.id`, 'is not allowed on container nodes')
    if (descriptor.list !== undefined) {
      const rule = descriptor.list
      const { items } = compileListItems(raw[rule.itemsKey], `${path}.${rule.itemsKey}`)
      const itemName = compileItemName(raw[rule.itemNameKey], `${path}.${rule.itemNameKey}`)
      compileItemLabel(raw[rule.itemLabelKey], `${path}.${rule.itemLabelKey}`, items)
      listNames.push({ path: `${path}.${rule.itemNameKey}`, name: itemName })
      if (raw[rule.templateKey] === undefined) {
        throw new SpecError(`${path}.${rule.templateKey}`, 'is required and must be one node')
      }
      const templateInfo = { count: 0 }
      walkNode(
        raw[rule.templateKey],
        `${path}.${rule.templateKey}`,
        depth + 1,
        stats,
        interactiveIds,
        { inTemplate: true, templateInfo },
        listNames,
        templateControls,
      )
      return
    }
    if (descriptor.children !== undefined) walkChildren(descriptor, raw, path, depth, stats, interactiveIds, scope, listNames, templateControls)
    if (descriptor.branches !== undefined) walkBranches(descriptor, raw, path, depth, stats, interactiveIds, scope, listNames, templateControls)
    return
  }
  if (raw.kind === 'chart') {
    // v6: a chart becomes interactive only when it carries an `id`.
    if (Object.hasOwn(raw, 'id') && raw.id !== undefined) {
      if (typeof raw.chart === 'string' && CHART_KINDS.includes(raw.chart) && !SELECTABLE_CHART_KINDS.includes(raw.chart)) {
        throw new SpecError(`${path}.id`, `is only allowed on ${SELECTABLE_CHART_KINDS.join('/')} charts; "${raw.chart}" cannot be selected`)
      }
      if (inTemplate) {
        recordTemplateControl(raw.id, path, scope, templateControls)
        return
      }
      validateInteractiveId(raw.id, path, interactiveIds)
    }
    return
  }
  if (descriptor.interactive) {
    if (inTemplate) {
      recordTemplateControl(raw.id, path, scope, templateControls)
      return
    }
    if (typeof raw.id !== 'string') throw new SpecError(`${path}.id`, 'is required for interactive controls')
    validateInteractiveId(raw.id, path, interactiveIds)
    return
  }
  if (Object.hasOwn(raw, 'id')) throw new SpecError(`${path}.id`, 'is not allowed on non-interactive controls')
}

/** Compile one branch's own fields (`tabs[].label`). */
function compileBranchFields(rule, rawBranch, branchPath, env) {
  const compiled = {}
  for (const [name, fieldDescriptor] of Object.entries(rule.fields)) {
    const value = rawBranch[name]
    const fieldPath = `${branchPath}.${name}`
    if (value === undefined) {
      if (fieldDescriptor.required === true) throw new SpecError(fieldPath, 'is required')
      continue
    }
    if (fieldDescriptor.type !== 'richtext') {
      throw new SpecError(fieldPath, `internal: unsupported branch field type "${fieldDescriptor.type}"`)
    }
    compiled[name] = compileRichText(value, fieldPath, { allowedRefs: env.allowedRefs })
  }
  return compiled
}

/**
 * Pass 2: compile one node (and, for containers, its whole subtree) into the
 * recursive program node.
 */
function compileListNode(raw, descriptor, path, env) {
  const rule = descriptor.list
  const allowed = ['kind', 'visibleWhen', rule.itemsKey, rule.templateKey, rule.itemNameKey, ...Object.keys(descriptor.fields)]
  assertAllowedKeys(raw, allowed, path)
  const { items, fields } = compileListItems(raw[rule.itemsKey], `${path}.${rule.itemsKey}`)
  const itemName = compileItemName(raw[rule.itemNameKey], `${path}.${rule.itemNameKey}`)
  const itemLabel = compileItemLabel(raw[rule.itemLabelKey], `${path}.${rule.itemLabelKey}`, items)
  const node = { kind: 'list', items, itemName }
  if (itemLabel !== undefined) node.itemLabel = itemLabel
  if (raw.gap !== undefined) {
    node.gap = requiredNumber(raw.gap, `${path}.gap`, { integer: true, min: LIMITS.gap.min, max: LIMITS.gap.max })
  }
  const visibleWhen = compileVisibleWhen(raw.visibleWhen, path, env)
  if (visibleWhen !== undefined) node.visibleWhen = visibleWhen

  const itemRefs = new Set(fields.map((fieldName) => `${itemName}.${fieldName}`))
  const templateEnv = { ...env, allowedRefs: new Set([...env.allowedRefs, ...itemRefs]) }
  node.template = compileNode(raw[rule.templateKey], `${path}.${rule.templateKey}`, templateEnv)
  return node
}

function compileNode(raw, path, env) {
  const descriptor = CONTROL_KINDS[raw.kind]
  if (descriptor.container !== true) return compileControl(raw, path, env)
  if (descriptor.list !== undefined) return compileListNode(raw, descriptor, path, env)

  const allowed = ['kind', 'visibleWhen', ...Object.keys(descriptor.fields)]
  if (descriptor.children !== undefined) allowed.push(descriptor.children.key)
  if (descriptor.branches !== undefined) allowed.push(descriptor.branches.key)
  assertAllowedKeys(raw, allowed, path)

  const node = { kind: raw.kind }
  Object.assign(node, compileFields(descriptor, raw, path, env))
  const visibleWhen = compileVisibleWhen(raw.visibleWhen, path, env)
  if (visibleWhen !== undefined) node.visibleWhen = visibleWhen

  if (descriptor.children !== undefined) {
    const rule = descriptor.children
    node[rule.key] = raw[rule.key].map((child, index) => (
      compileNode(child, `${path}.${rule.key}[${index}]`, env)
    ))
  }
  if (descriptor.branches !== undefined) {
    const rule = descriptor.branches
    node[rule.key] = raw[rule.key].map((branch, index) => {
      const branchPath = `${path}.${rule.key}[${index}]`
      const compiled = compileBranchFields(rule, branch, branchPath, env)
      compiled[rule.childrenKey] = branch[rule.childrenKey].map((child, childIndex) => (
        compileNode(child, `${branchPath}.${rule.childrenKey}[${childIndex}]`, env)
      ))
      return compiled
    })
  }
  return node
}

/**
 * Compile one spec.
 *
 * @param {unknown} spec - the model-supplied spec object.
 * @param {{
 *   kind: Kind,
 *   ask?: unknown,
 *   defaults?: { submitLabel?: string, noteLabel?: string },
 * }} options
 *   `kind` selects the tool envelope; `ask` is required for `kind: 'ask'`;
 *   `defaults` localizes the submit/note labels.
 * @returns {object} the §6 CompiledMeta, pure JSON data.
 * @throws {SpecError} naming the first offending path.
 */
export function compileSpec(spec, options) {
  if (options === undefined || (options.kind !== 'deliver' && options.kind !== 'ask')) {
    throw new SpecError('spec', 'internal: compiler needs kind "deliver" or "ask"')
  }
  assertObject(spec, 'spec')
  assertAllowedKeys(spec, SPEC_FIELDS, 'spec')

  let serialized
  try {
    serialized = JSON.stringify(spec)
  } catch {
    throw new SpecError('spec', 'must be JSON-serializable')
  }
  const size = bytesOf(serialized)
  if (size > LIMITS.specBytes) {
    throw new SpecError('spec', `serialized spec is ${size} bytes; the limit is ${LIMITS.specBytes}`)
  }

  const title = readTitle(spec)
  const controls = readControls(spec)

  // Pass 1: structure and ids only, so every expression sees the full id set and
  // duplicate ids/depth overflows are reported before any RichText is parsed.
  const interactiveIds = new Set()
  const listNames = []
  const templateControls = []
  const stats = { nodes: 0 }
  controls.forEach((control, index) => {
    walkNode(control, `controls[${index}]`, 1, stats, interactiveIds, undefined, listNames, templateControls)
  })
  for (const entry of listNames) {
    if (interactiveIds.has(entry.name)) {
      throw new SpecError(entry.path, `itemName "${entry.name}" must not collide with an interactive control id`)
    }
  }
  for (const entry of templateControls) {
    if (interactiveIds.has(entry.name)) {
      throw new SpecError(entry.path, `must not conflict with an external interactive control id "${entry.name}"`)
    }
  }

  const state = compileState(spec.state, interactiveIds)
  const description = readDescription(spec, interactiveIds)
  const imagePolicy = options.image !== undefined && typeof options.image === 'object'
    ? options.image
    : { hosts: [], allowHttp: false }
  const env = { allowedRefs: interactiveIds, state, imagePolicy }

  // Pass 2: full field validation and compilation, in document order.
  const nodes = controls.map((control, index) => compileNode(control, `controls[${index}]`, env))

  const meta = { v: PROGRAM_VERSION, kind: options.kind, title }
  if (description !== undefined) meta.description = description
  if (options.kind === 'ask') {
    const envelope = readAsk(options.ask, {
      submitLabel: options.defaults?.submitLabel ?? 'Submit',
      noteLabel: options.defaults?.noteLabel ?? 'Note',
    })
    meta.submit = envelope.submit
    meta.ask = envelope.ask
  }
  meta.nodes = nodes
  return meta
}

/** Compute 1-based line/column for a UTF-16 offset. */
function lineColumnOf(source, offset) {
  let line = 1
  let column = 1
  const end = Math.max(0, Math.min(source.length, offset))
  for (let index = 0; index < end; index += 1) {
    if (source[index] === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

/** Turn one JSON.parse failure into a location-bearing detail string. */
function jsonErrorDetail(error, source) {
  const message = String(error !== undefined && error !== null && error.message ? error.message : error)
  const position = /at position (\d+)/.exec(message)
  let offset
  if (position !== null) {
    offset = Number(position[1])
  } else {
    // V8 omits the position for "unexpected token" errors on some inputs; its
    // message quotes the offending source slice, so locate that slice as a
    // best-effort offset instead of giving up on a location.
    const snippet = /"([\s\S]*?)" is not valid JSON/.exec(message)
    const index = snippet === null ? -1 : source.indexOf(snippet[1])
    offset = index >= 0 ? Math.min(source.length, index + Math.max(0, snippet[1].length - 1)) : 0
  }
  const { line, column } = lineColumnOf(source, offset)
  let cleaned = message.replace(/ in JSON(?: at position \d+)?(?: \(line \d+ column \d+\))?/, '')
  cleaned = cleaned.replace(/, "[\s\S]*" is not valid JSON$/, '')
  return `${cleaned} at offset ${offset} (line ${line}, column ${column})`
}

/**
 * Strictly parse the v4.1 `source` argument (§14.6).
 *
 * `source` is the same spec written as one compact JSON string. The Host parses
 * it here and then reuses `compileSpec`, so object mode and source mode produce
 * identical `CompiledMeta`. This function performs no I/O and never evaluates
 * model-authored code.
 *
 * @param {unknown} source - the raw tool argument.
 * @returns {object} the decoded spec object.
 * @throws {SpecError} with `source` as the path and an offset on invalid JSON.
 */
export function parseSource(source) {
  if (typeof source !== 'string') throw new SpecError('source', 'must be a string')
  const bytes = bytesOf(source)
  // The JSON-string form carries escaping overhead; cap it generously and let
  // compileSpec enforce the strict 128 KiB limit on the decoded spec.
  const limit = Math.floor(LIMITS.specBytes * 1.5)
  if (bytes > limit) throw new SpecError('source', `serialized source is ${bytes} bytes; the limit is ${limit}`)
  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new SpecError('source', `is not valid JSON (${jsonErrorDetail(error, source)})`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SpecError('source', 'must decode to a JSON object')
  }
  return parsed
}

/** Depth-first walk over a compiled node tree (containers included). */
function walkCompiledNodes(nodes, visit) {
  if (!Array.isArray(nodes)) return
  for (const node of nodes) {
    if (node === undefined || node === null || typeof node !== 'object') continue
    visit(node)
    if (Array.isArray(node.children)) walkCompiledNodes(node.children, visit)
    if (Array.isArray(node.columns)) {
      for (const branch of node.columns) walkCompiledNodes(branch === undefined || branch === null ? undefined : branch.children, visit)
    }
    if (Array.isArray(node.tabs)) {
      for (const branch of node.tabs) walkCompiledNodes(branch === undefined || branch === null ? undefined : branch.children, visit)
    }
    if (node.kind === 'list' && node.template !== undefined && node.template !== null) {
      walkCompiledNodes([node.template], visit)
    }
  }
}

/** Ids of every interactive node in a compiled meta, in depth-first render order. */
export function interactionIds(meta) {
  const ids = []
  walkCompiledNodes(meta.nodes, (node) => {
    if (typeof node.id === 'string') ids.push(node.id)
  })
  return ids
}

/**
 * Human/model-facing interaction summary, e.g. `['slider seats', 'switch yearly']`.
 * Used for the short receipt; kept out of the persisted program.
 */
export function interactionSummary(meta) {
  const summary = []
  walkCompiledNodes(meta.nodes, (node) => {
    if (typeof node.id === 'string') summary.push(`${node.kind} ${node.id}`)
  })
  return summary
}

/** Total node count of a compiled tree (receipts and tests). */
export function nodeCount(meta) {
  let count = 0
  walkCompiledNodes(meta.nodes, () => {
    count += 1
  })
  return count
}
