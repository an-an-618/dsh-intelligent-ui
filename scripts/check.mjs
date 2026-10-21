#!/usr/bin/env node
/**
 * Release preflight for `@an-an-618/dsh-intelligent-ui`.
 *
 * Run this before installing the bundle into any profile and before handing the
 * workspace to another reviewer. It re-checks the class of failure that broke
 * v2.0.0: DSH treats system-prompt sections as templates, so any `{{ … }}` in a
 * model-visible string fails every turn with a malformed prompt variable
 * reference. The unit tests mirror that check; this script makes it a one-line
 * gate and also verifies syntax, tests, manifest paths and source hygiene.
 *
 * Usage: node scripts/check.mjs
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function ok(name) {
  console.log(`ok   ${name}`)
}

function fail(name, detail) {
  failures.push(name)
  console.error(`FAIL ${name}${detail === undefined ? '' : `: ${detail}`}`)
}

function run(name, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' })
  if (result.status === 0) {
    ok(name)
    return true
  }
  if (result.stdout.trim() !== '') console.error(result.stdout.trim())
  if (result.stderr.trim() !== '') console.error(result.stderr.trim())
  fail(name, `exit ${result.status ?? result.signal}`)
  return false
}

function jsFiles(dir) {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute)
    .filter((entry) => entry.endsWith('.js') || entry.endsWith('.mjs'))
    .map((entry) => join(dir, entry))
}

/* 1. Syntax ---------------------------------------------------------------- */

const syntaxTargets = [
  'index.js',
  'client.js',
  ...jsFiles('lib'),
  ...jsFiles('scripts'),
  ...jsFiles('test'),
]

for (const file of syntaxTargets) {
  if (file === 'scripts/check.mjs') continue
  run(`node --check ${file}`, ['--check', file])
}

/* 2. Test suites ----------------------------------------------------------- */

run('host tests', ['test/host.test.mjs'])
run('client tests', ['test/client.test.mjs'])

/* 3. Prompt template guard ------------------------------------------------- */

const { buildPromptSection, toolDescriptions } = await import(pathToFileURL(join(root, 'lib/prompt.js')).href)

for (const language of ['zh', 'en']) {
  const section = buildPromptSection({ language })
  if (section.includes('{{')) {
    fail(`prompt section (${language})`, 'contains "{{"; DSH will fail every turn')
  } else {
    ok(`prompt section (${language}) has no "{{"`)
  }
  if (section.length < 900) fail(`prompt section (${language})`, `too short: ${section.length}`)
  for (const [name, description] of Object.entries(toolDescriptions(language))) {
    if (description.includes('{{')) fail(`tool description ${name} (${language})`, 'contains "{{"')
    else ok(`tool description ${name} (${language}) has no "{{"`)
  }
}

/* 4. Manifest -------------------------------------------------------------- */

const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (manifest.name !== '@an-an-618/dsh-intelligent-ui') fail('manifest name', manifest.name)
else ok('manifest name')

const exportEntries = Object.entries(manifest.exports ?? {})
for (const [key, target] of exportEntries) {
  if (target.includes('*')) continue
  if (!existsSync(join(root, target))) fail(`export ${key}`, `${target} does not exist`)
  else ok(`export ${key}`)
}
for (const entry of manifest.files ?? []) {
  if (entry.includes('*')) continue
  if (!existsSync(join(root, entry))) fail(`files entry ${entry}`, 'does not exist')
  else ok(`files entry ${entry}`)
}
const patch = manifest.dsh?.bundle?.patch
if (typeof patch !== 'string' || !existsSync(join(root, patch))) fail('dsh.bundle.patch', String(patch))
else ok('dsh.bundle.patch')
if (manifest.dsh?.client?.platform !== 'web') fail('dsh.client.platform', String(manifest.dsh?.client?.platform))
else ok('dsh.client.platform')

/* 5. Source hygiene -------------------------------------------------------- */

const runtimeSources = ['index.js', 'client.js', ...jsFiles('lib')]
const forbidden = [
  [/\bnew\s+Function\b/, 'new Function'],
  [/\beval\s*\(/, 'eval('],
  [/\bdocument\s*\./, 'document.*'],
  [/\bfetch\s*\(/, 'fetch('],
  [/position\s*:\s*fixed/, 'position: fixed'],
]
for (const file of runtimeSources) {
  if (!existsSync(join(root, file))) continue
  const source = readFileSync(join(root, file), 'utf8')
  for (const [pattern, label] of forbidden) {
    if (pattern.test(source)) fail(`${file} contains ${label}`, 'source hygiene')
  }
}
if (failures.length === 0) ok('source hygiene')

/* 6. Summary --------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\nPREFLIGHT FAILED (${failures.length}): ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nPREFLIGHT OK: syntax, tests, prompt template, manifest and source hygiene.')
