/**
 * Host-half tests for Intelligent UI v2.
 *
 * Zero dependencies beyond `node:test` / `node:assert`. Run with:
 *
 *   node test/host.test.mjs
 *
 * Covers the Host items required by CONTRACT.md §11: valid compilation, unknown
 * controls, duplicate ids, limits/out-of-range values, expression parsing and
 * errors, RichText segmentation, both tool schemas and receipts, the prompt
 * section, and the no-dynamic-code rule.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ASK_TOOL,
  RENDER_TOOL,
  apply,
  buildReceipt,
  compileToolArgs,
} from '../index.js'
import { SpecError, compileRichText } from '../lib/catalog.js'
import { compileSpec, interactionIds, interactionSummary, nodeCount } from '../lib/compile.js'
import { ExprError, collectRefs, parseExpression, tokenize } from '../lib/expr.js'
import { SECTION_NAME, SECTION_ORDER, buildPromptSection, toolDescriptions } from '../lib/prompt.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '..')

const VALID_SPEC = {
  title: 'Team plan estimate',
  description: 'About ${= seats * 29 }/mo',
  state: { seats: 8, yearly: true },
  controls: [
    { kind: 'heading', text: 'Seats and billing' },
    { kind: 'slider', id: 'seats', label: 'Seats', min: 1, max: 50, step: 1 },
    { kind: 'switch', id: 'yearly', label: 'Bill yearly' },
    { kind: 'callout', tone: 'info', text: 'Discount from 20 seats.' },
    { kind: 'stat', label: 'Estimated monthly', value: '${= seats * 29 }', hint: 'excl. tax' },
    { kind: 'table', columns: ['Plan', 'Price'], rows: [['Basic', '$9'], ['Pro', '$29']] },
    { kind: 'chart', chart: 'bar', categories: ['Q1', 'Q2'], series: [{ name: 'revenue', values: [12, '{= seats }'] }], height: 200, valueFormat: 'currency' },
    { kind: 'select', id: 'tier', label: 'Tier', options: [{ value: 'basic', label: 'Basic' }, { value: 'pro', label: 'Pro' }] },
    { kind: 'number', id: 'count', label: 'Count', min: 0, max: 10, initial: 3 },
    { kind: 'input', id: 'note', label: 'Note' },
    { kind: 'textarea', id: 'details', label: 'Details', rows: 3 },
    { kind: 'progress', value: 40, label: 'Setup' },
    { kind: 'badge', text: 'New', tone: 'success' },
    { kind: 'divider' },
  ],
}

/**
 * Mirror of DSH's system-prompt template check (0.2.1-rc.2): `{{name}}` is a
 * variable reference, and any other double-brace content aborts every turn with
 * "malformed prompt variable reference". The fake ctx enforces it so a prompt
 * section that would brick DSH fails here instead.
 */
function assertDshTemplateSafe(text) {
  for (const match of String(text).matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    if (!/^[a-z][a-z0-9_]*$/.test(match[1])) {
      throw new Error(`malformed prompt variable reference ${JSON.stringify(match[0])}`)
    }
  }
}

function makeCtx() {
  const tools = []
  const sections = []
  const effects = []
  const ctx = {
    tools: {
      register(definition) {
        tools.push(definition)
        return () => {}
      },
    },
    systemPrompt: {
      section(section) {
        assertDshTemplateSafe(section.text)
        sections.push(section)
        return () => {}
      },
    },
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
  }
  return { ctx, tools, sections }
}

function toolNamed(tools, name) {
  const definition = tools.find((candidate) => candidate.name === name)
  assert.ok(definition, `tool ${name} was not registered`)
  return definition
}

/** Minimal mirror of the registry's receipt validation, so tests fail loudly. */
function assertReceiptValue(value, kind) {
  assert.equal(typeof value, 'object')
  assert.equal(value.ok, true)
  assert.equal(value.kind, kind)
  assert.equal(typeof value.title, 'string')
  assert.equal(typeof value.nodes, 'number')
  assert.ok(Number.isInteger(value.nodes))
  assert.ok(Array.isArray(value.interactions))
  assert.ok(value.interactions.every((id) => typeof id === 'string'))
  assert.equal(typeof value.receipt, 'string')
  assert.deepEqual(Object.keys(value).sort(), ['interactions', 'kind', 'nodes', 'ok', 'receipt', 'title'])
}

function findNode(meta, id) {
  const node = meta.nodes.find((candidate) => candidate.id === id)
  assert.ok(node, `node ${id} missing`)
  return node
}

// ---------------------------------------------------------------------------
// compilation
// ---------------------------------------------------------------------------

test('compiles a valid delivery spec into §6 CompiledMeta', () => {
  const meta = compileSpec(VALID_SPEC, { kind: 'deliver' })
  assert.equal(meta.v, 7)
  assert.equal(meta.kind, 'deliver')
  assert.equal(meta.title, 'Team plan estimate')
  assert.equal(meta.submit, undefined)
  assert.equal(meta.ask, undefined)
  assert.equal(meta.nodes.length, VALID_SPEC.controls.length)
  assert.deepEqual(meta.nodes.map((node) => node.kind), VALID_SPEC.controls.map((control) => control.kind))

  // RichText compiled everywhere, description included.
  assert.equal(meta.description.parts[0].k, 'lit')
  const exprPart = meta.description.parts.find((part) => part.k === 'expr')
  assert.equal(exprPart.e.t, 'bin')
  assert.equal(exprPart.e.op, '*')
  assert.equal(exprPart.e.b.v, 29)

  // No raw interpolation survives in the persisted program.
  assert.ok(!JSON.stringify(meta).includes('{{'), 'compiled meta leaked a raw {{ … }} expression')
  assert.ok(!JSON.stringify(meta).includes('{='), 'compiled meta leaked a raw {= … } expression')

  // `state` seeds interactive nodes; defaults are resolved for all of them.
  assert.equal(findNode(meta, 'seats').initial, 8)
  assert.equal(findNode(meta, 'yearly').initial, true)
  assert.equal(findNode(meta, 'tier').initial, 'basic')
  assert.equal(findNode(meta, 'count').initial, 3)
  assert.equal(findNode(meta, 'note').initial, '')
  assert.equal(findNode(meta, 'details').initial, '')
  assert.equal(findNode(meta, 'seats').step, 1)
  assert.equal(findNode(meta, 'details').rows, 3)

  // Non-interactive rendering fields stay data, not strings with expressions.
  const stat = meta.nodes.find((node) => node.kind === 'stat')
  assert.equal(stat.value.parts[0].k, 'lit')
  assert.equal(stat.value.parts[1].k, 'expr')

  assert.deepEqual(interactionIds(meta), ['seats', 'yearly', 'tier', 'count', 'note', 'details'])
  assert.equal(interactionSummary(meta)[0], 'slider seats')
})

test('control initial wins over state; visibleWhen and ternary compile to Expr', () => {
  const meta = compileSpec({
    title: 'T',
    state: { seats: 8 },
    controls: [
      { kind: 'slider', id: 'seats', label: 'Seats', min: 1, max: 50, initial: 12 },
      { kind: 'switch', id: 'yearly', label: 'Yearly' },
      { kind: 'stat', label: 'Total', value: '{= yearly ? seats * 12 : seats }', visibleWhen: 'yearly == true && seats > 10' },
    ],
  }, { kind: 'deliver' })
  assert.equal(findNode(meta, 'seats').initial, 12)
  const stat = meta.nodes.find((node) => node.kind === 'stat')
  assert.equal(stat.visibleWhen.t, 'and')
  assert.equal(stat.visibleWhen.a.t, 'bin')
  assert.equal(stat.value.parts[0].e.t, 'cond')
})

test('rejects unknown controls, duplicate ids, ids on non-interactive controls and missing ids', () => {
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'heading', text: 'x' }, { kind: 'carousel' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[1\]\.kind: unknown node "carousel"/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'switch', id: 'a' }, { kind: 'checkbox', id: 'a' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[1\]\.id: duplicate id "a"/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'heading', id: 'a', text: 'x' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id: is not allowed on non-interactive controls/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'switch', label: 'x' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id: is required/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'switch', id: 'bad-id', label: 'x' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id: must match/.test(error.message),
  )
})

test('rejects unknown fields at spec, control, option and series level', () => {
  assert.throws(
    () => compileSpec({ title: 'T', url: 'https://example.com', controls: [{ kind: 'divider' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /spec\.url: unknown field/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'divider', onClick: 'x' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.onClick: unknown field/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'select', id: 's', label: 'S', options: [{ value: 'a', label: 'A', extra: true }] }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.options\[0\]\.extra: unknown field/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: [1], color: 'red' }] }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /series\[0\]\.color: unknown field/.test(error.message),
  )
})

test('enforces field limits and out-of-range values with the offending path', () => {
  const cases = [
    [{ title: '', controls: [{ kind: 'divider' }] }, /spec\.title/],
    [{ title: 'x'.repeat(121), controls: [{ kind: 'divider' }] }, /spec\.title/],
    [{ title: 'T', controls: [] }, /spec\.controls/],
    [{ title: 'T', description: 'x'.repeat(401), controls: [{ kind: 'divider' }] }, /spec\.description/],
    [{ title: 'T', controls: [{ kind: 'progress', value: 101 }] }, /controls\[0\]\.value/],
    [{ title: 'T', controls: [{ kind: 'slider', id: 'a', label: 'A', min: 0, max: 10, initial: 11 }] }, /controls\[0\]\.initial/],
    [{ title: 'T', controls: [{ kind: 'slider', id: 'a', label: 'A', min: 10, max: 0 }] }, /controls\[0\]\.min/],
    [{ title: 'T', state: { a: 5 }, controls: [{ kind: 'slider', id: 'a', label: 'A', min: 0, max: 4 }] }, /state\.a/],
    [{ title: 'T', state: { nope: 1 }, controls: [{ kind: 'divider' }] }, /state\.nope/],
    [{ title: 'T', controls: [{ kind: 'table', columns: ['a', 'b'], rows: [['only-one']] }] }, /controls\[0\]\.rows\[0\]/],
    [{ title: 'T', controls: [{ kind: 'chart', chart: 'bar', categories: ['a', 'b'], series: [{ values: [1] }] }] }, /series\[0\]\.values/],
    [{ title: 'T', controls: [{ kind: 'textarea', id: 't', label: 'T', rows: 9 }] }, /controls\[0\]\.rows/],
    [{ title: 'T', controls: [{ kind: 'select', id: 's', label: 'S', options: [{ value: 'a', label: 'A' }], initial: 'b' }] }, /controls\[0\]\.initial/],
    [{ title: 'T', controls: Array.from({ length: 41 }, () => ({ kind: 'divider' })) }, /spec\.controls/],
    [{ title: 'T', controls: [{ kind: 'text', text: 'x'.repeat(140000) }] }, /serialized spec is/],
  ]
  for (const [spec, pattern] of cases) {
    assert.throws(() => compileSpec(spec, { kind: 'deliver' }), (error) => error instanceof SpecError && pattern.test(error.message))
  }
})

test('v2.1: chart values accept numbers and {= } expression strings', () => {
  const spec = {
    title: 'Dynamic chart',
    controls: [
      { kind: 'slider', id: 'seats', label: 'Seats', min: 1, max: 50 },
      { kind: 'chart', chart: 'line', categories: ['Q1', 'Q2', 'Q3'], series: [
        { name: 'static', values: [12, 18, 24] },
        { name: 'dynamic', values: [1, '{= seats * 2}', '{= seats + 1 }'] },
      ] },
    ],
  }
  const meta = compileSpec(spec, { kind: 'deliver' })
  const chart = meta.nodes[1]
  assert.deepEqual(chart.series[0].values, [12, 18, 24])
  assert.equal(chart.series[1].values[0], 1)
  assert.deepEqual(chart.series[1].values[1], {
    parts: [{ k: 'expr', e: { t: 'bin', op: '*', a: { t: 'ref', name: 'seats' }, b: { t: 'lit', v: 2 } } }],
  })
  assert.equal(chart.series[1].values[2].parts[0].e.op, '+')
  // The compiled program carries data only: no raw interpolation survives.
  assert.ok(!JSON.stringify(meta).includes('{='), 'meta leaked a raw {= … } expression')
  assert.ok(!JSON.stringify(meta).includes('{{'), 'meta leaked a raw {{ … }} expression')

  // The legacy delimiter is still accepted inside a chart value.
  const legacy = compileSpec({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: ['{{ 1 + 1 }}'] }] }],
  }, { kind: 'deliver' })
  assert.equal(legacy.nodes[0].series[0].values[0].parts[0].k, 'expr')
})

test('v2.1: dynamic chart value errors name the exact value path', () => {
  const chart = (values) => ({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'bar', categories: ['a', 'b'], series: [{ values }] }],
  })
  assert.throws(
    () => compileSpec(chart([1, '{= missing * 2}']), { kind: 'deliver' }),
    (error) => error instanceof SpecError
      && /controls\[0\]\.series\[0\]\.values\[1\]/.test(error.message)
      && /unknown variable "missing"/.test(error.message),
  )
  assert.throws(
    () => compileSpec(chart([1, '{= seats + }']), { kind: 'deliver' }),
    (error) => error instanceof SpecError
      && /controls\[0\]\.series\[0\]\.values\[1\]/.test(error.message)
      && /unexpected end of expression/.test(error.message),
  )
  assert.throws(
    () => compileSpec(chart([1, '{= seats']), { kind: 'deliver' }),
    (error) => error instanceof SpecError
      && /controls\[0\]\.series\[0\]\.values\[1\]/.test(error.message)
      && /unclosed "\{=" expression/.test(error.message),
  )
  assert.throws(
    () => compileSpec(chart([1, '{= foo(1) }']), { kind: 'deliver' }),
    (error) => error instanceof SpecError
      && /controls\[0\]\.series\[0\]\.values\[1\]/.test(error.message),
  )
  assert.throws(
    () => compileSpec(chart([1, true]), { kind: 'deliver' }),
    (error) => error instanceof SpecError
      && /controls\[0\]\.series\[0\]\.values\[1\]: must be a finite number or an expression string/.test(error.message),
  )
  assert.throws(
    () => compileSpec(chart([1, 2, 3]), { kind: 'deliver' }),
    (error) => error instanceof SpecError
      && /controls\[0\]\.series\[0\]\.values: must have 2 value/.test(error.message),
  )
})

test('prompt documents dynamic chart values and never teaches double braces', () => {
  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    assert.ok(text.includes('chart.series[].values'), `${language} prompt does not document chart values`)
    assert.ok(text.includes('{= seats * 2}'), `${language} prompt lacks the dynamic-value example`)
    assert.ok(!text.includes('{{'), `${language} prompt contains "{{"`)
    assert.ok(!text.includes('}}'), `${language} prompt contains "}}"`)
  }
})

test('ask envelope compiles §6 submit/ask with defaults and overrides', () => {
  const meta = compileSpec(VALID_SPEC, {
    kind: 'ask',
    ask: { prompt: 'Confirm this plan?' },
    defaults: { submitLabel: '提交', noteLabel: '备注' },
  })
  assert.equal(meta.kind, 'ask')
  assert.deepEqual(meta.ask, { prompt: 'Confirm this plan?' })
  assert.deepEqual(meta.submit, { label: '提交', allowNote: true, noteLabel: '备注' })

  const custom = compileSpec(VALID_SPEC, {
    kind: 'ask',
    ask: { prompt: 'OK?', submitLabel: '确定', noteLabel: '说明', allowNote: false },
    defaults: { submitLabel: '提交', noteLabel: '备注' },
  })
  assert.deepEqual(custom.submit, { label: '确定', allowNote: false })

  assert.throws(
    () => compileSpec(VALID_SPEC, { kind: 'ask', ask: {}, defaults: { submitLabel: 'S', noteLabel: 'N' } }),
    (error) => error instanceof SpecError && /ask\.prompt/.test(error.message),
  )
  assert.throws(
    () => compileSpec(VALID_SPEC, { kind: 'ask', ask: { prompt: 'x', allowNote: 'yes' }, defaults: { submitLabel: 'S', noteLabel: 'N' } }),
    (error) => error instanceof SpecError && /ask\.allowNote/.test(error.message),
  )
})

// ---------------------------------------------------------------------------
// RichText and expressions
// ---------------------------------------------------------------------------

test('RichText splits literals and expressions; a pure string stays one lit part', () => {
  const refs = new Set(['seats'])
  const mixed = compileRichText('a ${{seats * 29}} b', 'p', { allowedRefs: refs })
  assert.equal(mixed.parts.length, 3)
  assert.deepEqual(mixed.parts[0], { k: 'lit', v: 'a $' })
  assert.equal(mixed.parts[1].k, 'expr')
  assert.equal(mixed.parts[1].e.t, 'bin')
  assert.deepEqual(mixed.parts[2], { k: 'lit', v: ' b' })

  assert.deepEqual(compileRichText('plain', 'p', { allowedRefs: refs }), { parts: [{ k: 'lit', v: 'plain' }] })
  assert.deepEqual(compileRichText('', 'p', { allowedRefs: refs }), { parts: [{ k: 'lit', v: '' }] })

  // Adjacent literals merge instead of producing two parts.
  const merged = compileRichText('{{seats}}{{seats}}', 'p', { allowedRefs: refs })
  assert.equal(merged.parts.filter((part) => part.k === 'lit').length, 0)
  assert.equal(merged.parts.length, 2)

  // A}} inside a quoted expression string does not close the interpolation.
  const quoted = compileRichText('{{ "}}" }}', 'p', { allowedRefs: refs })
  assert.deepEqual(quoted.parts[0], { k: 'expr', e: { t: 'lit', v: '}}' } })
})

test('RichText rejects unclosed, empty and over-long expressions with a path', () => {
  const refs = new Set()
  assert.throws(
    () => compileRichText('a {{seats', 'controls[0].text', { allowedRefs: refs }),
    (error) => error instanceof SpecError && /controls\[0\]\.text: unclosed/.test(error.message),
  )
  assert.throws(
    () => compileRichText('a {{ }} b', 'controls[0].text', { allowedRefs: refs }),
    (error) => error instanceof SpecError && /empty/.test(error.message),
  )
  assert.throws(
    () => compileRichText('{{1234}}', 'controls[0].text', { allowedRefs: refs, maxExpression: 3 }),
    (error) => error instanceof SpecError && /at most 3 characters/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', description: 'x' + '{{' + 'seats + '.repeat(10) + '1}}', controls: [{ kind: 'divider' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /spec\.description: expression/.test(error.message),
  )
})

test('expression parser builds the §5.3 AST with precedence and associativity', () => {
  const root = parseExpression('1 + 2 * 3 == 7 && !flag ? "a" : "b"')
  assert.equal(root.t, 'cond')
  assert.deepEqual(root.a, { t: 'lit', v: 'a' })
  assert.deepEqual(root.b, { t: 'lit', v: 'b' })
  assert.equal(root.c.t, 'and')
  assert.equal(root.c.a.t, 'bin')
  assert.equal(root.c.a.op, '==')
  assert.equal(root.c.a.b.v, 7)
  assert.equal(root.c.a.a.op, '+')
  assert.equal(root.c.a.a.b.op, '*')
  assert.equal(root.c.b.t, 'un')
  assert.equal(root.c.b.op, '!')
  assert.deepEqual(parseExpression('1 + 2 * 3'), { t: 'bin', op: '+', a: { t: 'lit', v: 1 }, b: { t: 'bin', op: '*', a: { t: 'lit', v: 2 }, b: { t: 'lit', v: 3 } } })
  assert.deepEqual(parseExpression('cond ? "a" : "b"'), { t: 'cond', c: { t: 'ref', name: 'cond' }, a: { t: 'lit', v: 'a' }, b: { t: 'lit', v: 'b' } })
  assert.deepEqual(parseExpression('item.price'), { t: 'ref', name: 'item.price' })
  assert.deepEqual(collectRefs(parseExpression('item.a + item.b + other')), ['item.a', 'item.b', 'other'])
  const ternary = parseExpression('a ? b : c ? d : e')
  assert.equal(ternary.t, 'cond')
  assert.equal(ternary.b.t, 'cond')
  assert.equal(parseExpression('-1 - -2').t, 'bin')
  assert.equal(parseExpression('(1 + 2) * 3').a.t, 'bin')
  assert.equal(tokenize('12 .5 "s" true').length, 4)
  assert.deepEqual(collectRefs(root), ['flag'])
})

test('expression parser reports positions and rejects calls/membership syntax', () => {
  for (const [source, pattern] of [
    ['1 +', /unexpected end/],
    ['a..b', /malformed number|unexpected character/],
    ['foo(1)', /unexpected trailing token "\("/],
    ['a.b.c', /only one level of property access/],
    ['a, b', /unexpected character/],
    ['"unterminated', /unterminated string/],
    ['', /empty expression/],
  ]) {
    assert.throws(() => parseExpression(source), (error) => error instanceof ExprError && pattern.test(error.message), source)
  }
  assert.throws(() => parseExpression('1 +'), (error) => error.position === 3)
  assert.throws(
    () => compileRichText('{{missing + 1}}', 'controls[0].text', { allowedRefs: new Set(['known']) }),
    (error) => error instanceof SpecError && /unknown variable "missing"/.test(error.message),
  )
})

// ---------------------------------------------------------------------------
// tool definitions, receipts, prompt
// ---------------------------------------------------------------------------

test('registers both tools with the contract schemas and localized descriptions', () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, {})
  assert.deepEqual(tools.map((tool) => tool.name), [RENDER_TOOL, ASK_TOOL])

  const specOrSource = {
    spec: {
      type: 'object',
      description: 'Complete spec object. Provide exactly one of spec or source.',
    },
    source: {
      type: 'string',
      description: 'Complete spec as compact JSON text. Provide exactly one of spec or source; preferred for long cards because the client can show a read-only skeleton while it streams.',
    },
  }
  const render = toolNamed(tools, RENDER_TOOL)
  assert.deepEqual(render.parameters, {
    type: 'object',
    additionalProperties: false,
    properties: specOrSource,
  })
  const ask = toolNamed(tools, ASK_TOOL)
  assert.deepEqual(ask.parameters, {
    type: 'object',
    additionalProperties: false,
    required: ['ask'],
    properties: {
      ...specOrSource,
      ask: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          submitLabel: { type: 'string' },
          noteLabel: { type: 'string' },
          allowNote: { type: 'boolean' },
        },
      },
    },
  })
  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 40)
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(typeof tool.output.presentationMeta, 'function')
    assert.deepEqual(tool.output.schema.required, ['ok', 'kind', 'title', 'nodes', 'interactions', 'receipt'])
  }
  assert.ok(toolDescriptions('zh').render_ui.includes('交付卡'))
  assert.ok(toolDescriptions('en').render_ui.includes('delivery card'))
})

test('execute returns the §6 receipt value; render returns it as one text block', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, {})
  const render = toolNamed(tools, RENDER_TOOL)
  const value = await render.execute({ spec: VALID_SPEC })
  assertReceiptValue(value, 'deliver')
  assert.equal(value.title, 'Team plan estimate')
  assert.equal(value.nodes, VALID_SPEC.controls.length)
  assert.ok(value.receipt.includes('Team plan estimate'))
  assert.ok(value.receipt.includes('slider seats'))
  assert.ok(!value.receipt.includes('{{'))
  assert.ok(!value.receipt.includes('{='))
  const content = render.output.render({ spec: VALID_SPEC }, value)
  assert.deepEqual(content, [{ type: 'text', text: value.receipt }])
  const meta = render.output.presentationMeta({ spec: VALID_SPEC }, value)
  assert.deepEqual(meta, compileToolArgs(RENDER_TOOL, { spec: VALID_SPEC }, 'zh'))
  assert.equal(meta.v, 7)
  assert.equal(meta.kind, 'deliver')

  const ask = toolNamed(tools, ASK_TOOL)
  const asked = await ask.execute({ spec: VALID_SPEC, ask: { prompt: 'OK?' } })
  assertReceiptValue(asked, 'ask')
  const askedMeta = ask.output.presentationMeta({ spec: VALID_SPEC, ask: { prompt: 'OK?' } }, asked)
  assert.equal(askedMeta.kind, 'ask')
  assert.deepEqual(askedMeta.submit, { label: '提交', allowNote: true, noteLabel: '备注' })
  assert.deepEqual(askedMeta.ask, { prompt: 'OK?' })
  // Ask receipts mention the submit path back to the model.
  assert.ok(asked.receipt.includes('[Intelligent UI]'))
})

test('language changes descriptions and receipts; compile errors surface from execute', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, { language: 'en' })
  const render = toolNamed(tools, RENDER_TOOL)
  const value = await render.execute({ spec: VALID_SPEC })
  assert.ok(value.receipt.startsWith('Rendered "Team plan estimate"'))
  assert.ok(toolNamed(tools, RENDER_TOOL).description.includes('delivery card'))

  const meta = compileSpec(VALID_SPEC, { kind: 'deliver' })
  assert.ok(buildReceipt(meta, 'zh').includes('已在会话中渲染'))
  assert.ok(buildReceipt(meta, 'en').includes('Rendered'))

  await assert.rejects(
    () => render.execute({ spec: { title: 'T', controls: [{ kind: 'slider', id: 'a', label: 'A', min: 0, max: 1, initial: 5 }] } }),
    (error) => error instanceof SpecError && /controls\[0\]\.initial/.test(error.message),
  )
})

test('prompt section has the §9 identity, content and size; prompt:false disables it', () => {
  const zh = buildPromptSection({ language: 'zh' })
  assert.ok(zh.includes(RENDER_TOOL) && zh.includes(ASK_TOOL))
  assert.ok(zh.includes('控件目录') && zh.includes('表达式') && zh.includes('常见错误'))
  assert.ok(zh.includes('ask_with_ui'))
  assert.ok(zh.includes('{= '))
  assert.ok(zh.length > 900, `zh prompt too short: ${zh.length}`)
  assert.ok(zh.length < 7000, `zh prompt too long: ${zh.length}`)

  const en = buildPromptSection({ language: 'en' })
  assert.ok(en.includes('Control catalog') && en.includes('Expressions') && en.includes('Common mistakes'))
  assert.ok(en.length > 1200 && en.length < 12000)

  const { ctx, sections } = makeCtx()
  apply(ctx, { prompt: true, language: 'zh' })
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, SECTION_NAME)
  assert.equal(sections[0].order, SECTION_ORDER)
  assert.equal(sections[0].text, zh)

  const disabled = makeCtx()
  apply(disabled.ctx, { prompt: false })
  assert.equal(disabled.sections.length, 0)
  assert.equal(disabled.tools.length, 2)

  const fallback = makeCtx()
  apply(fallback.ctx, { language: 'fr' })
  assert.equal(fallback.sections[0].text, zh)
})

test('outputPolicy switches between cards-first and balanced prompt text', () => {
  const cardsFirst = buildPromptSection({ language: 'zh', outputPolicy: 'cards-first' })
  assert.ok(cardsFirst.includes('应出尽出'))
  assert.ok(cardsFirst.includes('一句话事实或闲聊才用纯文字'))

  const balanced = buildPromptSection({ language: 'zh', outputPolicy: 'balanced' })
  assert.ok(balanced.includes('默认优先用于结构化回答'))
  assert.ok(!balanced.includes('应出尽出'))
  assert.ok(balanced.length < cardsFirst.length)

  const enBalanced = buildPromptSection({ language: 'en', outputPolicy: 'balanced' })
  assert.ok(enBalanced.includes('Prefer these tools for structured answers'))
  assert.ok(!enBalanced.includes('cards by default, exhaustively'))

  for (const text of [cardsFirst, balanced]) {
    assert.ok(!text.includes('{{') && !text.includes('}}'))
  }

  const { ctx, sections } = makeCtx()
  apply(ctx, { language: 'zh', outputPolicy: 'balanced' })
  assert.equal(sections[0].text, balanced)

  const fallback = makeCtx()
  apply(fallback.ctx, { language: 'zh', outputPolicy: 'unknown' })
  assert.equal(fallback.sections[0].text, cardsFirst)
})

test('accepts boundary sizes and rejects one past them', () => {
  const forty = { title: 'T', controls: Array.from({ length: 40 }, (_, index) => ({ kind: 'divider' })) }
  assert.equal(compileSpec(forty, { kind: 'deliver' }).nodes.length, 40)
  const eight = { title: 'T', controls: [{ kind: 'table', columns: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], rows: [['1', '2', '3', '4', '5', '6', '7', '8']] }] }
  assert.equal(compileSpec(eight, { kind: 'deliver' }).nodes[0].columns.length, 8)
  const longTitle = { title: 'x'.repeat(120), controls: [{ kind: 'divider' }] }
  assert.equal(compileSpec(longTitle, { kind: 'deliver' }).title.length, 120)
})

test('meta is plain lossless JSON and presentationMeta works without a prior execute', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, { language: 'zh' })
  const render = toolNamed(tools, RENDER_TOOL)
  assert.throws(() => compileToolArgs(RENDER_TOOL, undefined, 'zh'), (error) => error instanceof SpecError && /arguments/.test(error.message))
  const direct = render.output.presentationMeta({ spec: VALID_SPEC }, { ok: true })
  assert.deepEqual(JSON.parse(JSON.stringify(direct)), direct)
  assert.equal(direct.v, 7)
  assert.equal(direct.kind, 'deliver')

  const value = await render.execute({ spec: VALID_SPEC })
  const meta = render.output.presentationMeta({ spec: VALID_SPEC }, value)
  assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta)
})

test('prompt stays inside the v5 §15.3 1800-2400 token target (rough estimate)', () => {
  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
    // Chinese characters count ~1 token; the remaining ASCII/JSON counts ~4 chars/token.
    const estimate = cjk + (text.length - cjk) / 4
    assert.ok(estimate >= 1800, `${language} prompt is only ~${Math.round(estimate)} tokens`)
    assert.ok(estimate <= 2600, `${language} prompt is ~${Math.round(estimate)} tokens (target <=2600)`)
  }
})

// ---------------------------------------------------------------------------
// v3: recursive layout, new controls, chart types, inline markup
// ---------------------------------------------------------------------------

test('v3: recursive containers compile into a v3 node tree', () => {
  const spec = {
    title: 'v3 layout',
    description: 'nested',
    state: { seats: 2 },
    controls: [
      { kind: 'section', title: 'Plan', description: 'Pick', children: [
        { kind: 'row', gap: 2, align: 'center', wrap: true, children: [
          { kind: 'slider', id: 'seats', label: 'Seats', min: 1, max: 10 },
          { kind: 'image', src: 'https://example.com/a.png', alt: 'A', height: 120, fit: 'cover' },
        ] },
        { kind: 'grid', columns: 2, gap: 1, children: [{ kind: 'badge', text: 'x' }, { kind: 'divider' }] },
        { kind: 'columns', gap: 1, columns: [
          { children: [{ kind: 'keyValue', items: [{ label: 'k', value: 'v' }], columns: 2 }] },
          { children: [{ kind: 'steps', items: [{ label: 'one', state: 'done' }, { label: 'two', description: 'd' }] }] },
        ] },
        { kind: 'tabs', tabs: [
          { label: 'A', children: [{ kind: 'link', href: 'https://example.com/docs', text: 'Docs' }] },
          { label: 'B', children: [{ kind: 'choice', id: 'tier', label: 'Tier', columns: 2, options: [
            { value: 'pro', label: 'Pro', description: 'small' },
            { value: 'team', label: 'Team' },
          ] }] },
        ] },
      ] },
    ],
  }
  const meta = compileSpec(spec, { kind: 'deliver' })
  assert.equal(meta.v, 7)
  const section = meta.nodes[0]
  assert.equal(section.kind, 'section')
  assert.equal(section.title.parts[0].v, 'Plan')
  assert.equal(section.description.parts[0].v, 'Pick')
  assert.equal(section.children.length, 4)
  const row = section.children[0]
  assert.equal(row.kind, 'row')
  assert.equal(row.gap, 2)
  assert.equal(row.align, 'center')
  assert.equal(row.wrap, true)
  assert.equal(row.children[0].kind, 'slider')
  assert.equal(row.children[0].initial, 2)
  assert.equal(row.children[1].height, 120)
  assert.equal(row.children[1].fit, 'cover')
  assert.equal(section.children[1].kind, 'grid')
  assert.equal(section.children[1].columns, 2)
  const columns = section.children[2]
  assert.equal(columns.columns.length, 2)
  assert.equal(columns.columns[0].children[0].items[0].label.parts[0].v, 'k')
  assert.equal(columns.columns[1].children[0].items[0].state, 'done')
  const tabs = section.children[3]
  assert.equal(tabs.tabs.length, 2)
  assert.equal(tabs.tabs[0].label.parts[0].v, 'A')
  assert.equal(tabs.tabs[0].children[0].text.parts[0].v, 'Docs')
  const choice = tabs.tabs[1].children[0]
  assert.equal(choice.kind, 'choice')
  assert.equal(choice.initial, 'pro')
  assert.equal(choice.columns, 2)
  assert.deepEqual(interactionIds(meta), ['seats', 'tier'])
  assert.deepEqual(interactionSummary(meta), ['slider seats', 'choice tier'])
  assert.ok(!JSON.stringify(meta).includes('{='), 'meta leaked a raw expression delimiter')
})

test('v3: nesting depth, per-container children and total node limits', () => {
  const nest = (depth) => {
    let node = { kind: 'divider' }
    for (let index = 0; index < depth; index += 1) node = { kind: 'section', children: [node] }
    return node
  }
  // Top level is depth 1, so three nested containers keep the leaf at depth 4.
  assert.equal(compileSpec({ title: 'T', controls: [nest(3)] }, { kind: 'deliver' }).nodes.length, 1)
  assert.throws(
    () => compileSpec({ title: 'T', controls: [nest(4)] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /nesting depth exceeds 4/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'section', children: [] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 1-20 child node/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'section', children: Array.from({ length: 21 }, () => ({ kind: 'divider' })) }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 1-20 child node/.test(error.message),
  )
  const wide = {
    title: 'T',
    controls: Array.from({ length: 7 }, () => ({
      kind: 'grid',
      columns: 2,
      children: Array.from({ length: 20 }, () => ({ kind: 'divider' })),
    })),
  }
  assert.throws(
    () => compileSpec(wide, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /exceeds 120 nodes/.test(error.message),
  )
})

test('v3: columns and tabs branch wrappers are validated', () => {
  const columnsWith = (count) => ({
    title: 'T',
    controls: [{
      kind: 'columns',
      columns: Array.from({ length: count }, () => ({ children: [{ kind: 'divider' }] })),
    }],
  })
  assert.equal(compileSpec(columnsWith(2), { kind: 'deliver' }).nodes[0].columns.length, 2)
  assert.equal(compileSpec(columnsWith(4), { kind: 'deliver' }).nodes[0].columns.length, 4)
  assert.throws(
    () => compileSpec(columnsWith(1), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.columns: must have 2-4 branches/.test(error.message),
  )
  assert.throws(
    () => compileSpec(columnsWith(5), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 2-4 branches/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'columns', columns: [{ children: [{ kind: 'divider' }], extra: true }, { children: [{ kind: 'divider' }] }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.columns\[0\]\.extra: unknown field/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'columns', columns: [{ children: [] }, { children: [{ kind: 'divider' }] }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 1-20 child node/.test(error.message),
  )

  const tabsWith = (count, label) => ({
    title: 'T',
    controls: [{
      kind: 'tabs',
      tabs: Array.from({ length: count }, () => (label === undefined
        ? { children: [{ kind: 'divider' }] }
        : { label, children: [{ kind: 'divider' }] })),
    }],
  })
  assert.equal(compileSpec(tabsWith(2, 'A'), { kind: 'deliver' }).nodes[0].tabs.length, 2)
  assert.throws(
    () => compileSpec(tabsWith(1, 'A'), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 2-6 branches/.test(error.message),
  )
  assert.throws(
    () => compileSpec(tabsWith(2, undefined), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.tabs\[0\]\.label: is required/.test(error.message),
  )
})

test('v3: interactive ids are global across the tree; state and expressions resolve', () => {
  const spec = {
    title: 'Nested refs',
    description: 'Top sees ${= seats }',
    state: { seats: 4 },
    controls: [
      { kind: 'section', children: [
        { kind: 'box', border: true, children: [
          { kind: 'slider', id: 'seats', label: 'Seats', min: 1, max: 10 },
          { kind: 'stat', label: 'Total', value: '${= seats * 3 }' },
        ] },
      ] },
      { kind: 'section', children: [{ kind: 'switch', id: 'seats', label: 'Duplicate' }] },
    ],
  }
  assert.throws(
    () => compileSpec(spec, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[1\]\.children\[0\]\.id: duplicate id "seats"/.test(error.message),
  )

  const good = JSON.parse(JSON.stringify(spec))
  good.controls[1].children[0].id = 'yearly'
  const meta = compileSpec(good, { kind: 'deliver' })
  assert.equal(meta.nodes[0].children[0].children[0].initial, 4)
  assert.equal(meta.nodes[0].children[0].children[1].value.parts[1].e.b.v, 3)
  assert.equal(meta.description.parts[1].e.name, 'seats')
})

test('v3: image and link URLs are http(s) only and bounded', () => {
  const image = (src) => compileSpec({ title: 'T', controls: [{ kind: 'image', src }] }, { kind: 'deliver' }).nodes[0]
  assert.equal(image('https://example.com/a.png').src, 'https://example.com/a.png')
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'image', src: 'http://example.com/a.png?x=1' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /http images are disabled/.test(error.message),
  )
  for (const src of ['javascript:alert(1)', 'ftp://example.com/a.png', '/relative.png', 'data:image/png;base64,xx']) {
    assert.throws(
      () => compileSpec({ title: 'T', controls: [{ kind: 'image', src }] }, { kind: 'deliver' }),
      (error) => error instanceof SpecError && /controls\[0\]\.src/.test(error.message),
    )
  }
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'image', src: `https://example.com/${'x'.repeat(2048)}` }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.src/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'image', src: 'https://example.com', height: 40 }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.height/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'link', href: 'mailto:a@b.c', text: 'Mail' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.href/.test(error.message),
  )
  const link = compileSpec({ title: 'T', controls: [{ kind: 'link', href: 'https://example.com', text: 'Site' }] }, { kind: 'deliver' }).nodes[0]
  assert.equal(link.text.parts[0].v, 'Site')
})

test('v3: choice compiles options, required, initial and columns', () => {
  const controls = [{
    kind: 'choice',
    id: 'plan',
    label: 'Plan',
    required: true,
    columns: 3,
    options: [
      { value: 'pro', label: 'Pro', description: 'Small team' },
      { value: 'team', label: 'Team' },
    ],
  }]
  const node = compileSpec({ title: 'Pick', controls }, { kind: 'ask', ask: { prompt: 'Pick one' } }).nodes[0]
  assert.equal(node.kind, 'choice')
  assert.equal(node.id, 'plan')
  assert.equal(node.required, true)
  assert.equal(node.columns, 3)
  assert.equal(node.initial, 'pro')
  assert.deepEqual(node.options.map((option) => option.value), ['pro', 'team'])
  assert.equal(node.options[0].description.parts[0].v, 'Small team')

  const seeded = compileSpec({ title: 'Pick', state: { plan: 'team' }, controls }, { kind: 'deliver' })
  assert.equal(seeded.nodes[0].initial, 'team')

  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'choice', id: 'c', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /duplicate option value/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'choice', id: 'c', initial: 'z', options: [{ value: 'a', label: 'A' }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.initial/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'choice', options: [{ value: 'a', label: 'A' }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id/.test(error.message),
  )
})

test('v3: area, pie and donut charts compile; unknown chart kinds fail', () => {
  for (const chart of ['bar', 'line', 'area', 'pie', 'donut']) {
    const meta = compileSpec({
      title: 'T',
      controls: [{ kind: 'chart', chart, categories: ['a', 'b'], series: [{ values: [1, 2] }] }],
    }, { kind: 'deliver' })
    assert.equal(meta.nodes[0].chart, chart)
  }
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'chart', chart: 'radar', categories: ['a'], series: [{ values: [1] }] }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.chart/.test(error.message),
  )
})

test('v3/v4: containers reject ids; flat v2 specs still compile to v4', () => {
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'section', id: 'x', children: [{ kind: 'divider' }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id/.test(error.message),
  )
  const flat = compileSpec(VALID_SPEC, { kind: 'deliver' })
  assert.equal(flat.v, 7)
  assert.ok(flat.nodes.every((node) => typeof node.kind === 'string' && node.children === undefined))
  assert.equal(flat.nodes.length, VALID_SPEC.controls.length)
})

test('v3: inline rich-text markup stays literal for the client', () => {
  const markup = '**bold** *italic* `code` [site](https://example.com)'
  const meta = compileSpec({ title: 'Markup', controls: [{ kind: 'text', text: markup }] }, { kind: 'deliver' })
  assert.deepEqual(meta.nodes[0].text, { parts: [{ k: 'lit', v: markup }] })
  const mixed = compileSpec({ title: 'M', controls: [{ kind: 'text', text: 'x {= 1 + 1 } **b**' }] }, { kind: 'deliver' })
  assert.deepEqual(mixed.nodes[0].text.parts[0], { k: 'lit', v: 'x ' })
  assert.equal(mixed.nodes[0].text.parts[1].k, 'expr')
  assert.deepEqual(mixed.nodes[0].text.parts[2], { k: 'lit', v: ' **b**' })
})

test('v3: prompt documents containers, new controls, inline markup and limits', () => {
  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    for (const needle of ['section', 'tabs', 'choice', 'image', 'link', 'keyValue', 'steps', 'area', 'pie', 'donut', 'list', 'scatter', 'heatmap', 'itemName', 'source', '120']) {
      assert.ok(text.includes(needle), `${language} prompt is missing "${needle}"`)
    }
    assert.ok(text.includes('{= '), `${language} prompt lacks the canonical delimiter`)
    const boldMarker = language === 'en' ? '**bold**' : '**粗体**'
    assert.ok(text.includes(boldMarker), `${language} prompt lacks inline markup documentation`)
    assert.ok(!text.includes('{{'), `${language} prompt contains "{{"`)
    assert.ok(!text.includes('}}'), `${language} prompt contains "}}"`)
  }
})

// ---------------------------------------------------------------------------
// v4: list templates, image allow-list, scatter/heatmap
// ---------------------------------------------------------------------------

test('v4: list compiles items, itemName, gap and item.field references', () => {
  const spec = {
    title: 'List card',
    controls: [{
      kind: 'list',
      items: [{ name: 'Pro', price: 20, hot: true }, { name: 'Team', price: 40, hot: false }],
      itemName: 'row',
      gap: 2,
      template: {
        kind: 'box',
        border: true,
        children: [
          { kind: 'text', text: '{= row.name } / {= row.price }' },
          { kind: 'badge', text: '{= row.hot ? "hot" : "cold" }', visibleWhen: 'row.hot == true' },
        ],
      },
    }],
  }
  const meta = compileSpec(spec, { kind: 'deliver' })
  assert.equal(meta.v, 7)
  const list = meta.nodes[0]
  assert.equal(list.kind, 'list')
  assert.equal(list.itemName, 'row')
  assert.equal(list.gap, 2)
  assert.deepEqual(list.items, [{ name: 'Pro', price: 20, hot: true }, { name: 'Team', price: 40, hot: false }])
  assert.equal(list.template.kind, 'box')
  const text = list.template.children[0].text
  assert.deepEqual(text.parts[0], { k: 'expr', e: { t: 'ref', name: 'row.name' } })
  assert.deepEqual(text.parts[1], { k: 'lit', v: ' / ' })
  assert.deepEqual(text.parts[2], { k: 'expr', e: { t: 'ref', name: 'row.price' } })
  assert.equal(list.template.children[1].visibleWhen.t, 'bin')
  assert.deepEqual(list.template.children[1].visibleWhen.a, { t: 'ref', name: 'row.hot' })
  // No raw interpolation survives; items are data, not nodes.
  assert.ok(!JSON.stringify(meta).includes('{='))

  const byDefault = compileSpec({
    title: 'T',
    controls: [{ kind: 'list', items: [{ a: 1 }], template: { kind: 'text', text: '{= item.a }' } }],
  }, { kind: 'deliver' })
  assert.equal(byDefault.nodes[0].itemName, 'item')
  assert.equal(nodeCount(byDefault), 2)
})

test('v4/v6.1: list templates allow one interactive control; nested lists/items still validated', () => {
  const list = (overrides) => ({
    title: 'T',
    controls: [{ kind: 'list', items: [{ a: 1 }], template: { kind: 'divider' }, ...overrides }],
  })
  // v6.1: a template may hold exactly one interactive control (local id).
  const oneControl = compileSpec(list({ template: { kind: 'slider', id: 'x', label: 'X', min: 0, max: 1 } }), { kind: 'deliver' })
  assert.equal(oneControl.nodes[0].template.id, 'x')
  assert.throws(
    () => compileSpec(list({ template: { kind: 'list', items: [{ a: 1 }], template: { kind: 'divider' } } }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /nested list containers/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'list', items: [], template: { kind: 'divider' } }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 1-50 item/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'list', items: [{ a: {} }], template: { kind: 'divider' } }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.items\[0\]\.a/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'list', items: [{ 'bad-key': 1 }], template: { kind: 'divider' } }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /items\[0\]\.bad-key/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [
        { kind: 'slider', id: 'item', label: 'Seats', min: 0, max: 1 },
        { kind: 'list', items: [{ a: 1 }], template: { kind: 'divider' } },
      ],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[1\]\.itemName: itemName "item" must not collide/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'list', items: [{ a: 1 }], template: { kind: 'text', text: '{= item.missing }' } }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /template\.text/.test(error.message) && /unknown variable "item\.missing"/.test(error.message),
  )
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'list', items: [{ a: 1 }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /template: is required/.test(error.message),
  )
})

test('v4: list template participates in node count and depth limits, items do not', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{
      kind: 'list',
      items: Array.from({ length: 50 }, (_, index) => ({ n: index })),
      template: { kind: 'section', children: [{ kind: 'divider' }] },
    }],
  }, { kind: 'deliver' })
  assert.equal(nodeCount(meta), 3)

  // list(1) -> template section(2) -> section(3) -> section(4) -> leaf(5) is too deep.
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{
        kind: 'list',
        items: [{ n: 1 }],
        template: { kind: 'section', children: [{ kind: 'section', children: [{ kind: 'section', children: [{ kind: 'divider' }] }] }] },
      }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /nesting depth exceeds 4/.test(error.message),
  )
})

test('v4: image allow-list, https default and always-rejected private hosts', () => {
  const policy = { hosts: ['cdn.example.com'], allowHttp: false }
  const image = (src, extra = {}) => compileSpec({
    title: 'T',
    controls: [{ kind: 'image', src }],
  }, { kind: 'deliver', image: { ...policy, ...extra } }).nodes[0]

  assert.equal(image('https://cdn.example.com/a.png').src, 'https://cdn.example.com/a.png')
  assert.equal(image('https://img.cdn.example.com/a.png').src, 'https://img.cdn.example.com/a.png')
  assert.throws(() => image('https://other.example.com/a.png'), (error) => /not in imageHosts/.test(error.message))
  assert.throws(() => image('http://cdn.example.com/a.png'), (error) => /http images are disabled/.test(error.message))
  assert.equal(image('http://cdn.example.com/a.png', { allowHttp: true }).src, 'http://cdn.example.com/a.png')

  for (const host of ['localhost', 'foo.local', '127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.1.1', '[::1]', '[fe80::1]']) {
    assert.throws(
      () => image(`https://${host}/a.png`, { allowHttp: true }),
      (error) => error instanceof SpecError && /not allowed/.test(error.message),
      host,
    )
  }
  // Default policy (no image options) is still https-only and unlimited hosts.
  assert.throws(
    () => compileSpec({ title: 'T', controls: [{ kind: 'image', src: 'http://cdn.example.com/a.png' }] }, { kind: 'deliver' }),
    (error) => /http images are disabled/.test(error.message),
  )
  // link rules are unchanged: plain http is still fine.
  assert.equal(
    compileSpec({ title: 'T', controls: [{ kind: 'link', href: 'http://example.com', text: 'x' }] }, { kind: 'deliver' }).nodes[0].href,
    'http://example.com',
  )
})

test('v4: apply() forwards imageHosts/allowHttpImages config into compilation', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, { imageHosts: ['cdn.example.com'], allowHttpImages: true })
  const render = toolNamed(tools, RENDER_TOOL)
  const ok = await render.execute({ spec: { title: 'T', controls: [{ kind: 'image', src: 'http://cdn.example.com/x.png' }] } })
  assert.equal(ok.ok, true)
  await assert.rejects(
    () => render.execute({ spec: { title: 'T', controls: [{ kind: 'image', src: 'https://other.example.com/x.png' }] } }),
    (error) => error instanceof SpecError && /not in imageHosts/.test(error.message),
  )
})

test('v4: scatter compiles points and rejects categories/values', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{
      kind: 'chart',
      chart: 'scatter',
      series: [{ name: 'A', points: [{ x: 1, y: 4 }, { x: 2, y: 9 }] }],
      height: 220,
      valueFormat: 'number',
    }],
  }, { kind: 'deliver' })
  assert.equal(meta.nodes[0].series[0].points.length, 2)
  assert.deepEqual(meta.nodes[0].series[0].points[1], { x: 2, y: 9 })

  const scatter = (overrides) => ({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'scatter', series: [{ points: [{ x: 1, y: 1 }] }], ...overrides }],
  })
  assert.throws(() => compileSpec(scatter({ categories: ['a'] }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.categories: unknown field/.test(error.message))
  assert.throws(() => compileSpec({ title: 'T', controls: [{ kind: 'chart', chart: 'scatter', series: [{ values: [1] }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /series\[0\]\.values: unknown field/.test(error.message))
  assert.throws(() => compileSpec({ title: 'T', controls: [{ kind: 'chart', chart: 'scatter', series: [{ points: [] }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must have 1-200 point/.test(error.message))
  assert.throws(() => compileSpec({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'scatter', series: [{ points: Array.from({ length: 201 }, () => ({ x: 1, y: 1 })) }] }],
  }, { kind: 'deliver' }), (error) => error instanceof SpecError && /must have 1-200 point/.test(error.message))
  assert.throws(() => compileSpec({ title: 'T', controls: [{ kind: 'chart', chart: 'scatter', series: [{ points: [{ x: 1, y: '2' }] }] }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /points\[0\]\.y: must be a finite number/.test(error.message))
})

test('v4: heatmap compiles categories and rows with matching widths', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{
      kind: 'chart',
      chart: 'heatmap',
      categories: ['Mon', 'Tue', 'Wed'],
      rows: [{ label: 'AM', values: [1, 3, 5] }, { label: 'PM', values: [2, 4, 6] }],
      height: 200,
      valueFormat: 'number',
    }],
  }, { kind: 'deliver' })
  assert.equal(meta.nodes[0].rows.length, 2)
  assert.deepEqual(meta.nodes[0].rows[1], { label: 'PM', values: [2, 4, 6] })

  const heatmap = (overrides) => ({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'heatmap', categories: ['a', 'b'], rows: [{ label: 'r', values: [1, 2] }], ...overrides }],
  })
  assert.throws(() => compileSpec(heatmap({ series: [{ values: [1] }] }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.series: unknown field/.test(error.message))
  assert.throws(() => compileSpec(heatmap({ categories: Array.from({ length: 25 }, (_, i) => `c${i}`) }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /categories: must have at most 24/.test(error.message))
  assert.throws(() => compileSpec(heatmap({ rows: [] }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /rows: must have 1-12 row/.test(error.message))
  assert.throws(() => compileSpec(heatmap({ rows: [{ label: 'r', values: [1] }] }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /values: must have 2 value/.test(error.message))
  assert.throws(() => compileSpec(heatmap({ rows: [{ values: [1, 2] }] }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /rows\[0\]\.label: must be a string/.test(error.message))
  assert.throws(() => compileSpec(heatmap({ rows: [{ label: 'r', values: [1, '2'] }] }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /values\[1\]: must be a finite number/.test(error.message))
})

test('v4: prompt documents list/scatter/heatmap/image policy and stays brace-free', () => {
  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    for (const needle of ['list', 'scatter', 'heatmap', 'imageHosts', 'itemName', 'http']) {
      assert.ok(text.includes(needle), `${language} prompt is missing "${needle}"`)
    }
    assert.ok(!text.includes('{{') && !text.includes('}}'), `${language} prompt contains a double brace`)
  }
})

// ---------------------------------------------------------------------------
// v4.1: source (compact JSON text) entry
// ---------------------------------------------------------------------------

test('v4.1: source mode produces the same meta, receipt and value as spec mode', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, {})
  const render = toolNamed(tools, RENDER_TOOL)
  const source = JSON.stringify(VALID_SPEC)

  const viaSpec = compileToolArgs(RENDER_TOOL, { spec: VALID_SPEC }, 'zh')
  const viaSource = compileToolArgs(RENDER_TOOL, { source }, 'zh')
  assert.deepEqual(viaSource, viaSpec)
  assert.equal(viaSource.v, 7)

  const executedSpec = await render.execute({ spec: VALID_SPEC })
  const executedSource = await render.execute({ source })
  assert.deepEqual(executedSource, executedSpec)

  const metaSpec = render.output.presentationMeta({ spec: VALID_SPEC }, executedSpec)
  const metaSource = render.output.presentationMeta({ source }, executedSource)
  assert.deepEqual(metaSource, metaSpec)
  assert.equal(metaSource.v, 7)
  assert.ok(!JSON.stringify(metaSource).includes('"source"'), 'source mode must not leak its transport text into meta')

  // presentationMeta can also run without a prior execute (cache miss path).
  const direct = render.output.presentationMeta({ source }, { ok: true })
  assert.deepEqual(direct, viaSpec)
})

test('v4.1: spec and source are mutually exclusive', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, {})
  const render = toolNamed(tools, RENDER_TOOL)
  const source = JSON.stringify(VALID_SPEC)
  await assert.rejects(
    () => render.execute({ spec: VALID_SPEC, source }),
    (error) => error instanceof SpecError && /arguments/.test(error.message) && /both were provided/.test(error.message),
  )
  await assert.rejects(
    () => render.execute({}),
    (error) => error instanceof SpecError && /arguments/.test(error.message) && /neither was provided/.test(error.message),
  )
})

test('v4.1: invalid source JSON reports offset with line and column', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, {})
  const render = toolNamed(tools, RENDER_TOOL)
  await assert.rejects(
    () => render.execute({ source: '{"title":"T",}' }),
    (error) => error instanceof SpecError
      && error.path === 'source'
      && /is not valid JSON/.test(error.message)
      && /offset \d+/.test(error.message)
      && /line \d+, column \d+/.test(error.message),
  )
  // The V8 message omits "position" for this shape; the fallback still locates it.
  await assert.rejects(
    () => render.execute({ source: '{"a": }' }),
    (error) => error instanceof SpecError && /offset \d+/.test(error.message),
  )
})

test('v4.1: source must decode to an object and stays under the string-size cap', () => {
  for (const source of ['[]', 'null', '42', '"text"']) {
    assert.throws(
      () => compileToolArgs(RENDER_TOOL, { source }, 'zh'),
      (error) => error instanceof SpecError && /must decode to a JSON object/.test(error.message),
    )
  }
  const tooBig = 'x'.repeat(210000)
  assert.throws(
    () => compileToolArgs(RENDER_TOOL, { source: tooBig }, 'zh'),
    (error) => error instanceof SpecError && /serialized source is/.test(error.message),
  )
})

test('v4.1: ask_with_ui accepts source and stays identical to spec mode', async () => {
  const { ctx, tools } = makeCtx()
  apply(ctx, {})
  const ask = toolNamed(tools, ASK_TOOL)
  const askArgs = { prompt: 'Confirm this plan?' }
  const source = JSON.stringify(VALID_SPEC)

  const viaSpec = compileToolArgs(ASK_TOOL, { spec: VALID_SPEC, ask: askArgs }, 'zh')
  const viaSource = compileToolArgs(ASK_TOOL, { source, ask: askArgs }, 'zh')
  assert.deepEqual(viaSource, viaSpec)
  assert.equal(viaSource.kind, 'ask')
  assert.deepEqual(viaSource.submit, { label: '提交', allowNote: true, noteLabel: '备注' })

  const executed = await ask.execute({ source, ask: askArgs })
  const executedSpec = await ask.execute({ spec: VALID_SPEC, ask: askArgs })
  assert.deepEqual(executed, executedSpec)

  // `ask` itself is still required regardless of the spec/source mode.
  await assert.rejects(
    () => ask.execute({ source }),
    (error) => error instanceof SpecError && /ask/.test(error.message),
  )
})

test('v4.1: prompt documents source mode without bringing back double braces', () => {
  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    assert.ok(text.includes('source'), `${language} prompt should document source mode`)
    assert.ok(!text.includes('{{') && !text.includes('}}'), `${language} prompt contains a double brace`)
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const estimate = cjk + (text.length - cjk) / 4
    assert.ok(estimate >= 1800 && estimate <= 2600, `${language} prompt is ~${Math.round(estimate)} tokens`)
    for (const [name, description] of Object.entries(toolDescriptions(language))) {
      assert.ok(description.includes('source'), `${language} ${name} description should mention source`)
    }
  }
})

// ---------------------------------------------------------------------------
// v5: stepper / rating / checklist / codeblock / quote / timeline / sparkline
// ---------------------------------------------------------------------------

test('v5: stepper compiles defaults, bounds, state and required', () => {
  const node = compileSpec({ title: 'T', controls: [{ kind: 'stepper', id: 'n', label: 'Qty' }] }, { kind: 'deliver' }).nodes[0]
  assert.equal(node.kind, 'stepper')
  assert.deepEqual({ min: node.min, max: node.max, step: node.step, initial: node.initial }, { min: 0, max: 100, step: 1, initial: 0 })

  const configured = compileSpec({
    title: 'T',
    state: { n: 5 },
    controls: [{ kind: 'stepper', id: 'n', label: 'Qty', min: 2, max: 9, step: 2, initial: 7, required: true }],
  }, { kind: 'ask', ask: { prompt: 'How many?' } }).nodes[0]
  assert.deepEqual({ min: configured.min, max: configured.max, step: configured.step, initial: configured.initial, required: configured.required }, { min: 2, max: 9, step: 2, initial: 7, required: true })

  const seeded = compileSpec({
    title: 'T',
    state: { n: 5 },
    controls: [{ kind: 'stepper', id: 'n', label: 'Qty', min: 2, max: 9 }],
  }, { kind: 'deliver' }).nodes[0]
  assert.equal(seeded.initial, 5)

  const stepper = (overrides) => ({ title: 'T', controls: [{ kind: 'stepper', id: 'n', label: 'Qty', ...overrides }] })
  assert.throws(() => compileSpec(stepper({ min: 10, max: 1 }), { kind: 'deliver' }), (error) => /controls\[0\]\.min/.test(error.message))
  assert.throws(() => compileSpec(stepper({ step: 0 }), { kind: 'deliver' }), (error) => /controls\[0\]\.step: must be positive/.test(error.message))
  assert.throws(() => compileSpec(stepper({ min: 1.5 }), { kind: 'deliver' }), (error) => /controls\[0\]\.min: must be an integer/.test(error.message))
  assert.throws(() => compileSpec(stepper({ initial: 200 }), { kind: 'deliver' }), (error) => /controls\[0\]\.initial/.test(error.message))
})

test('v5: rating compiles max/initial defaults, bounds and required', () => {
  const node = compileSpec({ title: 'T', controls: [{ kind: 'rating', id: 'r', label: 'Rate' }] }, { kind: 'deliver' }).nodes[0]
  assert.equal(node.kind, 'rating')
  assert.equal(node.max, 5)
  assert.equal(node.initial, 0)

  const configured = compileSpec({
    title: 'T',
    state: { r: 4 },
    controls: [{ kind: 'rating', id: 'r', label: 'Rate', max: 10, required: true }],
  }, { kind: 'deliver' }).nodes[0]
  assert.equal(configured.max, 10)
  assert.equal(configured.initial, 4)
  assert.equal(configured.required, true)

  const rating = (overrides) => ({ title: 'T', controls: [{ kind: 'rating', id: 'r', label: 'Rate', ...overrides }] })
  assert.throws(() => compileSpec(rating({ max: 2 }), { kind: 'deliver' }), (error) => /controls\[0\]\.max: must be >= 3/.test(error.message))
  assert.throws(() => compileSpec(rating({ max: 11 }), { kind: 'deliver' }), (error) => /controls\[0\]\.max: must be <= 10/.test(error.message))
  assert.throws(() => compileSpec(rating({ max: 5, initial: 6 }), { kind: 'deliver' }), (error) => /controls\[0\]\.initial/.test(error.message))
  assert.throws(() => compileSpec(rating({ initial: -1 }), { kind: 'deliver' }), (error) => /controls\[0\]\.initial/.test(error.message))
})

test('v5: checklist compiles options, canonical initial, columns and required', () => {
  const options = [
    { value: 'a', label: 'A', description: 'first' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ]
  const node = compileSpec({
    title: 'T',
    state: { picks: 'b' },
    controls: [{ kind: 'checklist', id: 'picks', options, columns: 2, required: true }],
  }, { kind: 'ask', ask: { prompt: 'Pick some' } }).nodes[0]
  assert.equal(node.kind, 'checklist')
  assert.equal(node.initial, 'b')
  assert.equal(node.columns, 2)
  assert.equal(node.required, true)
  assert.equal(node.options[0].description.parts[0].v, 'first')

  const canonical = compileSpec({
    title: 'T',
    controls: [{ kind: 'checklist', id: 'picks', options, initial: ' c, a ' }],
  }, { kind: 'deliver' }).nodes[0]
  assert.equal(canonical.initial, 'c,a')

  const checklist = (overrides) => ({ title: 'T', controls: [{ kind: 'checklist', id: 'picks', options, ...overrides }] })
  assert.throws(() => compileSpec(checklist({ initial: 'z' }), { kind: 'deliver' }), (error) => /controls\[0\]\.initial/.test(error.message))
  assert.throws(() => compileSpec(checklist({ initial: 'a,,b' }), { kind: 'deliver' }), (error) => /empty entries/.test(error.message))
  assert.throws(() => compileSpec(checklist({ initial: 5 }), { kind: 'deliver' }), (error) => /initial: must be a string/.test(error.message))
  assert.throws(() => compileSpec(checklist({ columns: 4 }), { kind: 'deliver' }), (error) => /controls\[0\]\.columns: must be <= 3/.test(error.message))
  assert.throws(() => compileSpec(checklist({ options: Array.from({ length: 11 }, (_, index) => ({ value: `v${index}`, label: 'x' })) }), { kind: 'deliver' }), (error) => /must have 1-10 item/.test(error.message))
  assert.throws(() => compileSpec(checklist({ options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }] }), { kind: 'deliver' }), (error) => /duplicate option value/.test(error.message))
})

test('v5: codeblock validates code length, language and title', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{ kind: 'codeblock', code: 'const x = 1', language: 'ts', title: 'Snippet' }],
  }, { kind: 'deliver' })
  assert.equal(meta.nodes[0].code, 'const x = 1')
  assert.equal(meta.nodes[0].language, 'ts')
  assert.equal(meta.nodes[0].title.parts[0].v, 'Snippet')

  const codeblock = (overrides) => ({ title: 'T', controls: [{ kind: 'codeblock', code: 'x', ...overrides }] })
  assert.throws(() => compileSpec({ title: 'T', controls: [{ kind: 'codeblock' }] }, { kind: 'deliver' }), (error) => /controls\[0\]\.code: is required/.test(error.message))
  assert.throws(() => compileSpec(codeblock({ code: '' }), { kind: 'deliver' }), (error) => /controls\[0\]\.code: must be at least 1/.test(error.message))
  assert.throws(() => compileSpec(codeblock({ code: 'x'.repeat(4001) }), { kind: 'deliver' }), (error) => /controls\[0\]\.code: must be at most 4000/.test(error.message))
  assert.throws(() => compileSpec(codeblock({ language: 'x'.repeat(21) }), { kind: 'deliver' }), (error) => /language: must be at most 20/.test(error.message))
  assert.throws(() => compileSpec(codeblock({ code: 1 }), { kind: 'deliver' }), (error) => /code: must be a string/.test(error.message))
  assert.equal(compileSpec(codeblock({ code: 'x'.repeat(4000) }), { kind: 'deliver' }).nodes[0].code.length, 4000)
})

test('v5: quote keeps RichText text and optional cite', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [
      { kind: 'slider', id: 'seats', label: 'Seats', min: 0, max: 10 },
      { kind: 'quote', text: 'There are {= seats } seats.', cite: '— Team' },
    ],
  }, { kind: 'deliver' })
  const quote = meta.nodes[1]
  assert.equal(quote.kind, 'quote')
  assert.equal(quote.text.parts[1].k, 'expr')
  assert.equal(quote.cite.parts[0].v, '— Team')
  assert.throws(() => compileSpec({ title: 'T', controls: [{ kind: 'quote' }] }, { kind: 'deliver' }), (error) => /controls\[0\]\.text: is required/.test(error.message))
})

test('v5: timeline validates items, states and RichText parts', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{
      kind: 'timeline',
      items: [
        { label: 'Kickoff', time: 'Jan', state: 'done' },
        { label: 'Build', description: 'In progress', state: 'current' },
        { label: 'Ship', state: 'pending' },
      ],
    }],
  }, { kind: 'deliver' })
  assert.equal(meta.nodes[0].items.length, 3)
  assert.equal(meta.nodes[0].items[1].description.parts[0].v, 'In progress')
  assert.equal(meta.nodes[0].items[0].time.parts[0].v, 'Jan')
  assert.equal(meta.nodes[0].items[0].state, 'done')
  assert.equal(meta.nodes[0].items[2].state, 'pending')

  const timeline = (items) => ({ title: 'T', controls: [{ kind: 'timeline', items }] })
  assert.throws(() => compileSpec(timeline([]), { kind: 'deliver' }), (error) => /must have 1-12 item/.test(error.message))
  assert.throws(() => compileSpec(timeline(Array.from({ length: 13 }, () => ({ label: 'x' }))), { kind: 'deliver' }), (error) => /must have 1-12 item/.test(error.message))
  assert.throws(() => compileSpec(timeline([{ label: 'x', state: 'later' }]), { kind: 'deliver' }), (error) => /controls\[0\]\.items\[0\]\.state/.test(error.message))
  assert.throws(() => compileSpec(timeline([{ time: 'now' }]), { kind: 'deliver' }), (error) => /items\[0\]\.label: is required/.test(error.message))
})

test('v5: sparkline compiles numbers and expressions, height and tone', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [
      { kind: 'slider', id: 'seats', label: 'Seats', min: 0, max: 10 },
      { kind: 'sparkline', values: [1, 4, '{= seats * 2 }'], tone: 'success' },
    ],
  }, { kind: 'deliver' })
  const spark = meta.nodes[1]
  assert.equal(spark.kind, 'sparkline')
  assert.equal(spark.values[0], 1)
  assert.deepEqual(spark.values[2], { parts: [{ k: 'expr', e: { t: 'bin', op: '*', a: { t: 'ref', name: 'seats' }, b: { t: 'lit', v: 2 } } }] })
  assert.equal(spark.height, 40)
  assert.equal(spark.tone, 'success')
  assert.ok(!JSON.stringify(meta).includes('{='))

  const sparkline = (overrides) => ({ title: 'T', controls: [{ kind: 'sparkline', values: [1, 2], ...overrides }] })
  assert.throws(() => compileSpec(sparkline({ values: [1] }), { kind: 'deliver' }), (error) => /must have 2-32 item/.test(error.message))
  assert.throws(() => compileSpec(sparkline({ values: Array.from({ length: 33 }, () => 1) }), { kind: 'deliver' }), (error) => /must have 2-32 item/.test(error.message))
  assert.throws(() => compileSpec(sparkline({ values: [1, Infinity] }), { kind: 'deliver' }), (error) => /must be finite/.test(error.message))
  assert.throws(() => compileSpec(sparkline({ values: [1, '{= missing }'] }), { kind: 'deliver' }), (error) => /unknown variable "missing"/.test(error.message))
  assert.throws(() => compileSpec(sparkline({ values: [1, 2], height: 23 }), { kind: 'deliver' }), (error) => /controls\[0\]\.height/.test(error.message))
  assert.throws(() => compileSpec(sparkline({ values: [1, 2], tone: 'loud' }), { kind: 'deliver' }), (error) => /controls\[0\]\.tone/.test(error.message))
})

test('v5: program version 5 and prompt document the new controls without braces', () => {
  const flat = compileSpec(VALID_SPEC, { kind: 'deliver' })
  assert.equal(flat.v, 7)
  const listSpec = compileSpec({
    title: 'T',
    controls: [{ kind: 'list', items: [{ n: 1 }], template: { kind: 'text', text: '{= item.n }' } }],
  }, { kind: 'deliver' })
  assert.equal(listSpec.v, 7)

  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    for (const needle of ['stepper', 'rating', 'checklist', 'codeblock', 'quote', 'timeline', 'sparkline']) {
      assert.ok(text.includes(needle), `${language} prompt is missing "${needle}"`)
    }
    assert.ok(!text.includes('{{') && !text.includes('}}'), `${language} prompt contains a double brace`)
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const estimate = cjk + (text.length - cjk) / 4
    assert.ok(estimate >= 1800 && estimate <= 2600, `${language} prompt is ~${Math.round(estimate)} tokens`)
  }
})

// ---------------------------------------------------------------------------
// v6: chart tooltip (client-only) and clickable category selection
// ---------------------------------------------------------------------------

test('v6: selectable chart compiles id/label/select/initial/required', () => {
  const control = {
    kind: 'chart',
    chart: 'bar',
    categories: ['Jan', 'Feb', 'Mar'],
    series: [{ name: 'Revenue', values: [10, 20, 30] }],
    id: 'pick',
    label: 'Pick a month',
    select: 'category',
    initial: 'Feb',
    required: true,
  }
  const meta = compileSpec({ title: 'T', controls: [control] }, { kind: 'ask', ask: { prompt: 'Which month?' } })
  assert.equal(meta.v, 7)
  const node = meta.nodes[0]
  assert.equal(node.kind, 'chart')
  assert.equal(node.id, 'pick')
  assert.equal(node.select, 'category')
  assert.equal(node.initial, 'Feb')
  assert.equal(node.required, true)
  assert.equal(node.label.parts[0].v, 'Pick a month')
  assert.deepEqual(interactionIds(meta), ['pick'])
  assert.deepEqual(interactionSummary(meta), ['chart pick'])
  assert.equal(nodeCount(meta), 1)

  // state seeds the selection; a missing initial defaults to no selection.
  const seeded = compileSpec({
    title: 'T',
    state: { pick: 'Mar' },
    controls: [{ ...control, initial: undefined }],
  }, { kind: 'deliver' })
  assert.equal(seeded.nodes[0].initial, 'Mar')
  const bare = compileSpec({
    title: 'T',
    controls: [{ ...control, initial: undefined, required: undefined, select: undefined }],
  }, { kind: 'deliver' })
  assert.equal(bare.nodes[0].initial, '')
  assert.equal(Object.hasOwn(bare.nodes[0], 'required'), false)
  assert.equal(Object.hasOwn(bare.nodes[0], 'select'), false)
})

test('v6: only cartesian/pie/donut charts can be selected; fields are validated', () => {
  const heatmap = {
    kind: 'chart',
    chart: 'heatmap',
    categories: ['a'],
    rows: [{ label: 'r', values: [1] }],
    id: 'pick',
  }
  assert.throws(
    () => compileSpec({ title: 'T', controls: [heatmap] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id: is only allowed on bar\/line\/area\/pie\/donut charts/.test(error.message),
  )
  const scatter = {
    kind: 'chart',
    chart: 'scatter',
    series: [{ points: [{ x: 1, y: 2 }] }],
    id: 'pick',
  }
  assert.throws(
    () => compileSpec({ title: 'T', controls: [scatter] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id: is only allowed on/.test(error.message),
  )

  const selectable = (overrides) => ({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'line', categories: ['a', 'b'], series: [{ values: [1, 2] }], id: 'p', ...overrides }],
  })
  assert.throws(() => compileSpec(selectable({ initial: 'z' }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.initial: must be one of the chart categories/.test(error.message))
  assert.throws(() => compileSpec(selectable({ initial: 1 }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.initial: must be a category string/.test(error.message))
  assert.throws(() => compileSpec(selectable({ select: 'value' }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.select: must be one of category/.test(error.message))
  assert.throws(() => compileSpec(selectable({ required: 'yes' }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.required: must be a boolean/.test(error.message))
  assert.throws(
    () => compileSpec({ title: 'T', state: { p: 3 }, controls: [{ kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: [1] }], id: 'p' }] }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /state\.p: must be a category string/.test(error.message),
  )
})

test('v6: chart selection fields require an id', () => {
  const chart = (overrides) => ({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: [1] }], ...overrides }],
  })
  for (const [fieldName, value] of [['label', 'Pick'], ['select', 'category'], ['initial', 'a'], ['required', true]]) {
    assert.throws(
      () => compileSpec(chart({ [fieldName]: value }), { kind: 'deliver' }),
      (error) => error instanceof SpecError
        && new RegExp(`controls\\[0\\]\\.${fieldName}: is only allowed when the chart has an id`).test(error.message),
      fieldName,
    )
  }
})

test('v6/v6.1: selectable chart ids are global outside templates, local inside one template', () => {
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [
        { kind: 'slider', id: 'pick', label: 'Seats', min: 0, max: 1 },
        { kind: 'chart', chart: 'pie', categories: ['a'], series: [{ values: [1] }], id: 'pick' },
      ],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[1\]\.id: duplicate id "pick"/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: [1] }], id: 'bad-id' }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.id: must match/.test(error.message),
  )
  // v6.1: a selectable chart inside a template is the template's single local control.
  const localChart = compileSpec({
    title: 'T',
    controls: [{
      kind: 'list',
      items: [{ n: 1 }],
      template: { kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: ['{= item.n }'] }], id: 'pick' },
    }],
  }, { kind: 'deliver' })
  assert.equal(localChart.nodes[0].template.id, 'pick')
  assert.deepEqual(interactionIds(localChart), ['pick'])
})

test('v6: tooltip needs no Host fields; program v6 keeps older charts unchanged', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'bar', categories: ['a', 'b'], series: [{ values: [1, 2] }] }],
  }, { kind: 'deliver' })
  assert.equal(meta.v, 7)
  const node = meta.nodes[0]
  for (const key of ['id', 'label', 'select', 'initial', 'required', 'tooltip']) {
    assert.equal(Object.hasOwn(node, key), false, `non-selectable chart must not carry ${key}`)
  }
  assert.ok(!JSON.stringify(meta).includes('tooltip'))
  // v5-era specs still compile to v6.
  const legacy = compileSpec({
    title: 'T',
    controls: [
      { kind: 'stepper', id: 'n', label: 'N' },
      { kind: 'sparkline', values: [1, 2] },
    ],
  }, { kind: 'deliver' })
  assert.equal(legacy.v, 7)
})

test('v6: prompt documents clickable charts and tooltip without double braces', () => {
  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    assert.ok(text.toLowerCase().includes('tooltip'), `${language} prompt is missing tooltip`)
    assert.ok(text.includes('required 依赖 id') || text.includes('required 仅与 id') || text.includes('required needs an id'), `${language} prompt is missing the required/id rule`)
    assert.ok(!text.includes('{{') && !text.includes('}}'), `${language} prompt contains a double brace`)
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const estimate = cjk + (text.length - cjk) / 4
    assert.ok(estimate >= 1800 && estimate <= 2600, `${language} prompt is ~${Math.round(estimate)} tokens`)
  }
})

// ---------------------------------------------------------------------------
// v6.1: one local interactive control inside a list template
// ---------------------------------------------------------------------------

test('v6.1: list template allows one interactive control with a local id', () => {
  const spec = {
    title: 'T',
    state: { seats: 5 },
    controls: [
      { kind: 'slider', id: 'seats', label: 'Seats', min: 0, max: 10 },
      {
        kind: 'list',
        items: [{ name: 'A', qty: 2 }, { name: 'B', qty: 3 }],
        itemLabel: 'name',
        template: {
          kind: 'section',
          children: [
            { kind: 'slider', id: 'qty', label: 'Qty', min: 0, max: 5, required: true },
            { kind: 'text', text: '{= item.name } / {= seats }' },
          ],
        },
      },
    ],
  }
  const meta = compileSpec(spec, { kind: 'deliver' })
  assert.equal(meta.v, 7)
  const list = meta.nodes[1]
  assert.equal(list.itemLabel, 'name')
  assert.equal(list.template.kind, 'section')
  assert.equal(list.template.children[0].id, 'qty')
  assert.equal(list.template.children[0].required, true)
  assert.equal(list.template.children[1].text.parts[0].e.name, 'item.name')
  assert.equal(list.template.children[1].text.parts[2].e.name, 'seats')
  // The template control is counted once for interactions and once for nodes.
  assert.deepEqual(interactionIds(meta), ['seats', 'qty'])
  assert.equal(nodeCount(meta), 5)

  // Local ids are not card-wide: state and external expressions cannot see them.
  assert.throws(
    () => compileSpec({ ...spec, state: { qty: 3 } }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /state\.qty: must reference an interactive control id/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [...spec.controls, { kind: 'text', text: '{= qty }' }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /unknown variable "qty"/.test(error.message),
  )
})

test('v6.1: a template holds at most one interactive control; local ids may repeat across lists', () => {
  const twoControls = (children) => ({
    title: 'T',
    controls: [{ kind: 'list', items: [{ a: 1 }], template: { kind: 'section', children } }],
  })
  assert.throws(
    () => compileSpec(twoControls([
      { kind: 'slider', id: 'x', label: 'X', min: 0, max: 1 },
      { kind: 'switch', id: 'y', label: 'Y' },
    ]), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /at most one interactive control/.test(error.message),
  )
  assert.throws(
    () => compileSpec(twoControls([
      { kind: 'chart', chart: 'bar', categories: ['a'], series: [{ values: [1] }], id: 'pick' },
      { kind: 'input', id: 'note', label: 'Note' },
    ]), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /at most one interactive control/.test(error.message),
  )
  // Two sibling lists may each use the same local id.
  const sibling = compileSpec({
    title: 'T',
    controls: [
      { kind: 'list', items: [{ a: 1 }], template: { kind: 'slider', id: 'qty', label: 'Qty', min: 0, max: 1 } },
      { kind: 'list', items: [{ a: 2 }], template: { kind: 'switch', id: 'qty', label: 'On' } },
    ],
  }, { kind: 'deliver' })
  assert.deepEqual(interactionIds(sibling), ['qty', 'qty'])

  // A template id must not collide with an external interactive id.
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [
        { kind: 'slider', id: 'qty', label: 'Qty', min: 0, max: 1 },
        { kind: 'list', items: [{ a: 1 }], template: { kind: 'slider', id: 'qty', label: 'Qty', min: 0, max: 1 } },
      ],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /must not conflict with an external interactive control id "qty"/.test(error.message),
  )
})

test('v6.1: itemLabel is validated against items and preserved in the program', () => {
  const list = (overrides) => ({
    title: 'T',
    controls: [{ kind: 'list', items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 2 }], template: { kind: 'divider' }, ...overrides }],
  })
  assert.equal(compileSpec(list({ itemLabel: 'name' }), { kind: 'deliver' }).nodes[0].itemLabel, 'name')
  assert.equal(Object.hasOwn(compileSpec(list({}), { kind: 'deliver' }).nodes[0], 'itemLabel'), false)

  assert.throws(
    () => compileSpec(list({ itemLabel: 'missing' }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.itemLabel: field "missing" is missing from items\[0\]/.test(error.message),
  )
  assert.throws(
    () => compileSpec({
      title: 'T',
      controls: [{ kind: 'list', items: [{ name: 'A' }, { qty: 1 }], itemLabel: 'name', template: { kind: 'divider' } }],
    }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /missing from items\[1\]/.test(error.message),
  )
  assert.throws(
    () => compileSpec(list({ itemLabel: 5 }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /itemLabel: must be a non-empty field name/.test(error.message),
  )
  assert.throws(
    () => compileSpec(list({ itemLabel: 'bad-name' }), { kind: 'deliver' }),
    (error) => error instanceof SpecError && /itemLabel: must match/.test(error.message),
  )
})

test('v6.1: template control keeps initial/required for the client to derive per item', () => {
  const meta = compileSpec({
    title: 'T',
    controls: [{
      kind: 'list',
      items: [{ name: 'A' }, { name: 'B' }],
      itemLabel: 'name',
      template: {
        kind: 'row',
        children: [
          { kind: 'number', id: 'score', label: 'Score', min: 1, max: 9, initial: 4, required: true },
          { kind: 'text', text: '{= item.name }' },
        ],
      },
    }],
  }, { kind: 'deliver' })
  const template = meta.nodes[0].template
  assert.equal(template.children[0].initial, 4)
  assert.equal(template.children[0].required, true)
  assert.equal(template.children[1].text.parts[0].e.name, 'item.name')
  assert.equal(meta.v, 7)
})

test('v6.1: program v7 keeps older specs compiling and prompt documents list interactions', () => {
  assert.equal(compileSpec(VALID_SPEC, { kind: 'deliver' }).v, 7)
  const legacy = compileSpec({
    title: 'T',
    controls: [{ kind: 'chart', chart: 'pie', categories: ['a'], series: [{ values: [1] }], id: 'pick' }],
  }, { kind: 'deliver' })
  assert.equal(legacy.v, 7)

  for (const language of ['zh', 'en']) {
    const text = buildPromptSection({ language })
    for (const needle of ['itemLabel', 'template', 'required']) {
      assert.ok(text.includes(needle), `${language} prompt is missing "${needle}"`)
    }
    assert.ok(!text.includes('{{') && !text.includes('}}'), `${language} prompt contains a double brace`)
    const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const estimate = cjk + (text.length - cjk) / 4
    assert.ok(estimate >= 1800 && estimate <= 2600, `${language} prompt is ~${Math.round(estimate)} tokens`)
  }
})

// ---------------------------------------------------------------------------
// safety invariants
// ---------------------------------------------------------------------------

test('Host sources never evaluate expressions or build code, and never import DSH packages', () => {
  const files = [
    'index.js',
    'lib/catalog.js',
    'lib/compile.js',
    'lib/expr.js',
    'lib/prompt.js',
  ]
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8')
    assert.ok(!/\beval\s*\(/.test(source), `${file} uses eval()`)
    assert.ok(!/new\s+Function\b/.test(source), `${file} uses new Function`)
    assert.ok(!/from\s+['"]@deepseek-ai\//.test(source), `${file} imports a DSH package`)
  }
})

test('all compile/diagnostic errors are SpecError with a concrete path', () => {
  const probes = [
    { title: 'T', controls: [{ kind: 'nope' }] },
    { title: 'T', controls: [{ kind: 'slider', id: 'a', label: 'A' }] },
    { title: 'T', controls: [{ kind: 'chart', chart: 'bar', categories: ['a'], series: [] }] },
    { title: 'T', controls: [{ kind: 'badge', text: '{{x + 1}}' }] },
  ]
  for (const probe of probes) {
    assert.throws(
      () => compileSpec(probe, { kind: 'deliver' }),
      (error) => error instanceof SpecError && typeof error.path === 'string' && error.path.length > 0,
    )
  }
})

// ---------------------------------------------------------------------------
// DSH prompt-template safety (regression: v2.0.0 bricked every turn)
// ---------------------------------------------------------------------------

test('model-facing text never contains a double brace, in either language', () => {
  for (const language of ['zh', 'en']) {
    const section = buildPromptSection({ language })
    assert.ok(!section.includes('{{'), `${language} prompt section contains "{{"`)
    assert.ok(!section.includes('}}'), `${language} prompt section contains "}}"`)
    assert.doesNotThrow(() => assertDshTemplateSafe(section))
    for (const [name, description] of Object.entries(toolDescriptions(language))) {
      assert.ok(!description.includes('{{'), `${language} ${name} description contains "{{"`)
    }
  }
  // The emulated check itself rejects exactly what DSH rejected.
  assert.throws(() => assertDshTemplateSafe('a {{ }} b'), /malformed prompt variable reference/)
  assert.throws(() => assertDshTemplateSafe('${{seats * 29}}'), /malformed prompt variable reference/)
  assert.doesNotThrow(() => assertDshTemplateSafe('hello {{user_name}}'))
})

test('apply() registers a prompt section DSH can render, for every config', () => {
  for (const config of [{}, { language: 'zh' }, { language: 'en' }, { prompt: true, language: 'en' }]) {
    const { ctx, sections } = makeCtx()
    assert.doesNotThrow(() => apply(ctx, config))
    assert.equal(sections.length, 1)
  }
})

test('the example in the prompt compiles with the canonical {= } delimiter', () => {
  for (const language of ['zh', 'en']) {
    const section = buildPromptSection({ language })
    const json = section.slice(section.indexOf('```json\n{\n  "spec"') + 8, section.lastIndexOf('```'))
    const args = JSON.parse(json)
    const meta = compileSpec(args.spec, { kind: 'ask', ask: args.ask, defaults: { submitLabel: 'OK', noteLabel: 'Note' } })
    const exprs = meta.description.parts.filter((part) => part.k === 'expr')
    assert.equal(exprs.length, 2, `${language} example description should hold two expressions`)
  }
})

test('RichText: canonical {= } delimiter, with {{ }} still accepted as an alias', () => {
  const refs = new Set(['seats'])
  const canonical = compileRichText('a ${= seats * 29 } b', 'p', { allowedRefs: refs })
  const legacy = compileRichText('a ${{seats * 29}} b', 'p', { allowedRefs: refs })
  assert.deepEqual(canonical, legacy)
  assert.deepEqual(canonical.parts[0], { k: 'lit', v: 'a $' })
  assert.equal(canonical.parts[1].e.op, '*')

  // Mixed forms, adjacent, no literal between them.
  const mixed = compileRichText('{= seats }{{seats}}', 'p', { allowedRefs: refs })
  assert.equal(mixed.parts.length, 2)
  assert.ok(mixed.parts.every((part) => part.k === 'expr'))

  // A brace inside a quoted string does not close the interpolation.
  const quoted = compileRichText('{= "}" }', 'p', { allowedRefs: refs })
  assert.deepEqual(quoted.parts[0], { k: 'expr', e: { t: 'lit', v: '}' } })

  // A lone brace or `=` outside an interpolation is literal text.
  assert.deepEqual(compileRichText('x = {y} =', 'p', { allowedRefs: refs }), { parts: [{ k: 'lit', v: 'x = {y} =' }] })

  assert.throws(() => compileRichText('a {= seats', 'controls[0].text', { allowedRefs: refs }),
    (error) => error instanceof SpecError && /unclosed "\{=" expression/.test(error.message))
  assert.throws(() => compileRichText('a {= } b', 'controls[0].text', { allowedRefs: refs }),
    (error) => error instanceof SpecError && /empty/.test(error.message))
})

test('required is accepted on interactive controls and compiled into the node', () => {
  const meta = compileSpec({
    title: 'Required fields',
    controls: [
      { kind: 'input', id: 'name', label: 'Name', required: true },
      { kind: 'switch', id: 'agree', label: 'Agree', required: true },
      { kind: 'slider', id: 'seats', label: 'Seats', min: 1, max: 10, required: true },
      { kind: 'input', id: 'optional', label: 'Optional' },
    ],
  }, { kind: 'ask', ask: { prompt: 'Confirm?' } })
  assert.equal(meta.nodes[0].required, true)
  assert.equal(meta.nodes[1].required, true)
  assert.equal(meta.nodes[2].required, true)
  assert.equal(Object.hasOwn(meta.nodes[3], 'required'), false)
})

test('required is rejected on non-interactive controls and for non-boolean values', () => {
  assert.throws(() => compileSpec({
    title: 'Bad required',
    controls: [{ kind: 'heading', text: 'Title', required: true }],
  }, { kind: 'deliver' }),
    (error) => error instanceof SpecError && /controls\[0\]\.required/.test(error.message))

  assert.throws(() => compileSpec({
    title: 'Bad required value',
    controls: [{ kind: 'input', id: 'name', label: 'Name', required: 'yes' }],
  }, { kind: 'ask', ask: { prompt: 'Confirm?' } }),
    (error) => error instanceof SpecError && /controls\[0\]\.required/.test(error.message))
})

test('the prompt documents required without bringing back double braces', () => {
  for (const language of ['zh', 'en']) {
    const section = buildPromptSection({ language })
    assert.ok(section.includes('required'), `${language} prompt should mention required`)
    assert.ok(!section.includes('{{'), `${language} prompt must not contain "{{"`)
  }
})
