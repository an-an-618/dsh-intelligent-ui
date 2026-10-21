/**
 * Intelligent UI v2 — expression lexer and parser.
 *
 * The Host never evaluates model-generated expressions. This module only turns
 * a RichText expression into the AST declared in `CONTRACT.md` §5.3; the Client
 * interprets that AST. There is deliberately no evaluator here, and no dynamic
 * code construction of any kind.
 *
 * Grammar (lowest to highest precedence):
 *
 *   ternary   := or ('?' ternary ':' ternary)?
 *   or        := and ('||' and)*
 *   and       := equality ('&&' equality)*
 *   equality  := relational (('==' | '!=') relational)*
 *   relational:= additive (('<' | '<=' | '>' | '>=') additive)*
 *   additive  := multiplicative (('+' | '-') multiplicative)*
 *   multiplicative := unary (('*' | '/' | '%') unary)*
 *   unary     := ('!' | '-') unary | primary
 *   primary   := number | string | 'true' | 'false' | name | '(' ternary ')'
 *
 * @module intelligent-ui/lib/expr
 */

/** Position-aware expression error (1-based column in the source string). */
export class ExprError extends Error {
  /**
   * @param {string} message - what is wrong, in the model's language (English).
   * @param {number} position - 0-based character offset into the expression.
   * @param {string} source - the expression source, for context.
   */
  constructor(message, position, source) {
    super(`${message} at column ${position + 1}${context(source, position)}`)
    this.name = 'ExprError'
    /** Structured position, for callers that want their own formatting. */
    this.position = position
    /** The source expression that failed to parse. */
    this.source = source
  }
}

function context(source, position) {
  if (typeof source !== 'string' || source.length === 0) return ''
  const from = Math.max(0, position - 12)
  const to = Math.min(source.length, position + 12)
  const before = source.slice(from, position)
  const after = source.slice(position, to)
  return ` in "${from > 0 ? '…' : ''}${before}⟨${after === '' ? 'EOF' : after}${to < source.length ? '…' : ''}"`
}

const PUNCTUATION = [
  '==', '!=', '<=', '>=', '&&', '||',
  '<', '>', '+', '-', '*', '/', '%', '!', '?', ':', '(', ')',
]

const IDENT_START = /[A-Za-z_]/
const IDENT_CONTINUE = /[A-Za-z0-9_]/
const DIGIT = /[0-9]/

/**
 * Split one expression into tokens.
 * @param {string} source - the expression text between `{{` and `}}`.
 * @returns {Array<{type: 'number'|'string'|'boolean'|'name'|'op', value: unknown, start: number, end: number}>}
 * @throws {ExprError} on an unknown character or an unterminated string.
 */
export function tokenize(source) {
  if (typeof source !== 'string') throw new ExprError('expression must be a string', 0, '')
  const tokens = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1
      continue
    }
    // Numbers: 12, 12.5, .5 (a leading '-' stays a unary operator).
    if (DIGIT.test(char) || (char === '.' && DIGIT.test(source[index + 1] ?? ''))) {
      const start = index
      while (DIGIT.test(source[index] ?? '')) index += 1
      if (source[index] === '.') {
        index += 1
        while (DIGIT.test(source[index] ?? '')) index += 1
      }
      if (source[index] === '.') throw new ExprError('malformed number', start, source)
      tokens.push({ type: 'number', value: Number(source.slice(start, index)), start, end: index })
      continue
    }
    // Strings: '...' or "..." with backslash escapes.
    if (char === "'" || char === '"') {
      const start = index
      const quote = char
      index += 1
      let value = ''
      let closed = false
      while (index < source.length) {
        const current = source[index]
        if (current === quote) {
          index += 1
          closed = true
          break
        }
        if (current === '\\') {
          const escaped = source[index + 1]
          if (escaped === undefined) break
          value += escape(escaped)
          index += 2
          continue
        }
        value += current
        index += 1
      }
      if (!closed) throw new ExprError('unterminated string literal', start, source)
      tokens.push({ type: 'string', value, start, end: index })
      continue
    }
    if (IDENT_START.test(char)) {
      const start = index
      index += 1
      while (IDENT_CONTINUE.test(source[index] ?? '')) index += 1
      let name = source.slice(start, index)
      // v4: `itemName.field` is the only property access the language allows.
      // It is lexed into a single name token so the AST stays { t: 'ref', name }.
      if (source[index] === '.' && IDENT_START.test(source[index + 1] ?? '')) {
        index += 1
        const fieldStart = index
        while (IDENT_CONTINUE.test(source[index] ?? '')) index += 1
        name = `${name}.${source.slice(fieldStart, index)}`
        if (source[index] === '.') {
          throw new ExprError('only one level of property access is allowed', index, source)
        }
      }
      if (name === 'true' || name === 'false') {
        tokens.push({ type: 'boolean', value: name === 'true', start, end: index })
      } else {
        tokens.push({ type: 'name', value: name, start, end: index })
      }
      continue
    }
    const punctuation = PUNCTUATION.find((candidate) => source.startsWith(candidate, index))
    if (punctuation === undefined) {
      throw new ExprError(`unexpected character "${char}"`, index, source)
    }
    tokens.push({ type: 'op', value: punctuation, start: index, end: index + punctuation.length })
    index += punctuation.length
  }
  return tokens
}

function escape(char) {
  switch (char) {
    case 'n': return '\n'
    case 't': return '\t'
    case 'r': return '\r'
    default: return char
  }
}

const BINARY = {
  '||': 'or',
  '&&': 'and',
  '==': 'bin',
  '!=': 'bin',
  '<': 'bin',
  '<=': 'bin',
  '>': 'bin',
  '>=': 'bin',
  '+': 'bin',
  '-': 'bin',
  '*': 'bin',
  '/': 'bin',
  '%': 'bin',
}

/**
 * Parse one expression into the §5.3 AST.
 * @param {string} source - the expression text (without `{{ }}`).
 * @returns {object} the AST root.
 * @throws {ExprError} with a 1-based column on the first syntax error.
 */
export function parseExpression(source) {
  const tokens = tokenize(source)
  if (tokens.length === 0) throw new ExprError('empty expression', 0, source)
  let cursor = 0
  const peek = () => tokens[cursor]
  const error = (message, token) => {
    const position = token === undefined ? source.length : token.start
    throw new ExprError(message, position, source)
  }
  const isOp = (value) => {
    const token = peek()
    return token !== undefined && token.type === 'op' && token.value === value
  }
  const eatOp = (value) => {
    if (!isOp(value)) error(`expected "${value}"`, peek())
    cursor += 1
  }

  function parseTernary() {
    const condition = parseOr()
    if (!isOp('?')) return condition
    cursor += 1
    const whenTrue = parseTernary()
    eatOp(':')
    const whenFalse = parseTernary()
    return { t: 'cond', c: condition, a: whenTrue, b: whenFalse }
  }

  function parseOr() {
    let left = parseAnd()
    while (isOp('||')) {
      cursor += 1
      left = { t: 'or', a: left, b: parseAnd() }
    }
    return left
  }

  function parseAnd() {
    let left = parseEquality()
    while (isOp('&&')) {
      cursor += 1
      left = { t: 'and', a: left, b: parseEquality() }
    }
    return left
  }

  function parseEquality() {
    let left = parseRelational()
    while (isOp('==') || isOp('!=')) {
      const op = peek().value
      cursor += 1
      left = { t: 'bin', op, a: left, b: parseRelational() }
    }
    return left
  }

  function parseRelational() {
    let left = parseAdditive()
    while (isOp('<') || isOp('<=') || isOp('>') || isOp('>=')) {
      const op = peek().value
      cursor += 1
      left = { t: 'bin', op, a: left, b: parseAdditive() }
    }
    return left
  }

  function parseAdditive() {
    let left = parseMultiplicative()
    while (isOp('+') || isOp('-')) {
      const op = peek().value
      cursor += 1
      left = { t: 'bin', op, a: left, b: parseMultiplicative() }
    }
    return left
  }

  function parseMultiplicative() {
    let left = parseUnary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = peek().value
      cursor += 1
      left = { t: 'bin', op, a: left, b: parseUnary() }
    }
    return left
  }

  function parseUnary() {
    if (isOp('!') || isOp('-')) {
      const op = peek().value
      cursor += 1
      return { t: 'un', op, a: parseUnary() }
    }
    return parsePrimary()
  }

  function parsePrimary() {
    const token = peek()
    if (token === undefined) error('unexpected end of expression', token)
    if (token.type === 'number' || token.type === 'string' || token.type === 'boolean') {
      cursor += 1
      return { t: 'lit', v: token.value }
    }
    if (token.type === 'name') {
      cursor += 1
      return { t: 'ref', name: token.value }
    }
    if (token.type === 'op' && token.value === '(') {
      cursor += 1
      const inner = parseTernary()
      eatOp(')')
      return inner
    }
    error(`unexpected token "${String(token.value)}"`, token)
  }

  const ast = parseTernary()
  if (cursor < tokens.length) {
    const token = tokens[cursor]
    error(`unexpected trailing token "${String(token.value)}"`, token)
  }
  return ast
}

/**
 * List every variable name an AST references, in first-seen order. Used by the
 * compiler to reject unknown variables before anything reaches the Client.
 * @param {object} ast - one §5.3 expression AST.
 * @returns {string[]} referenced names, de-duplicated.
 */
export function collectRefs(ast) {
  const names = []
  const seen = new Set()
  const visit = (node) => {
    if (node === undefined || node === null || typeof node !== 'object') return
    switch (node.t) {
      case 'ref':
        if (!seen.has(node.name)) {
          seen.add(node.name)
          names.push(node.name)
        }
        return
      case 'un':
        visit(node.a)
        return
      case 'bin':
      case 'and':
      case 'or':
        visit(node.a)
        visit(node.b)
        return
      case 'cond':
        visit(node.c)
        visit(node.a)
        visit(node.b)
        return
      default:
        return
    }
  }
  visit(ast)
  return names
}

/**
 * Parse and validate against the set of identifiers the card defines.
 * @param {string} source - the expression text.
 * @param {Set<string>} allowed - interactive control ids available to the card.
 * @param {{ path?: string }} [options] - caller path prefix for diagnostics.
 * @returns {object} the AST.
 * @throws {ExprError} on a syntax error or an unknown variable.
 */
export function parseExpressionWithRefs(source, allowed, options = {}) {
  const ast = parseExpression(source)
  for (const name of collectRefs(ast)) {
    if (!allowed.has(name)) {
      const prefix = options.path === undefined ? '' : `${options.path}: `
      throw new ExprError(`${prefix}unknown variable "${name}"`, 0, source)
    }
  }
  return ast
}
