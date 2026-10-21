#!/usr/bin/env node
/**
 * Generate the DSH plugin-market index (format 1) for this package.
 *
 * The index is a single JSON document served from GitHub Raw. DSH discovers
 * bundles listed here; `source.type = "git"` pins the exact commit so an
 * install is reproducible without publishing to npm.
 *
 * Usage:
 *   node scripts/build-market-index.mjs            # uses HEAD
 *   node scripts/build-market-index.mjs <commit>   # explicit 40-hex commit
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const commit = process.argv[2] ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error(`build-market-index: commit must be a lowercase 40-hex SHA, got ${JSON.stringify(commit)}`)
  process.exit(1)
}

const publishedAt = Number(execFileSync('git', ['show', '-s', '--format=%ct', commit], { cwd: root, encoding: 'utf8' }).trim())
const iconSvg = readFileSync(join(root, 'icon.svg'))
const icon = `data:image/svg+xml;base64,${iconSvg.toString('base64')}`
const repoUrl = 'https://github.com/an-an-618/dsh-intelligent-ui'

const index = {
  format: 1,
  title: {
    en: 'Intelligent UI Cards',
    zh: '智能界面卡片',
  },
  description: {
    en: 'Declarative, interactive cards for DeepSeek Harness: the model writes a spec, the Host compiles it, the Client renders it with local state and an explicit submit.',
    zh: '给 DeepSeek Harness 的声明式交互卡片：模型写 spec，Host 编译，Client 用本地状态渲染，提交才回传。',
  },
  metadata: {
    categories: {
      ui: { title: { en: 'Interface', zh: '界面' } },
      productivity: { title: { en: 'Productivity', zh: '效率' } },
    },
    labels: {
      interactive: { title: { en: 'Interactive', zh: '可交互' } },
      cards: { title: { en: 'Cards', zh: '卡片' } },
      'generative-ui': { title: { en: 'Generative UI', zh: '生成式界面' } },
      charts: { title: { en: 'Charts', zh: '图表' } },
    },
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: {
        en: 'Intelligent UI',
        zh: '智能界面',
      },
      description: {
        en: 'Render answers as interactive cards: forms, tables, charts, sliders, lists and choice cards, with local state and explicit submit. Includes a visual output-policy switch.',
        zh: '把回答变成可交互卡片：表单、表格、图表、滑块、列表和选项卡，本地交互、显式提交，带可视化输出策略开关。',
      },
      icon,
      author: 'an-an-618',
      homepage: pkg.homepage,
      repository: { url: repoUrl },
      metadata: {
        category: 'ui',
        keywords: ['intelligent-ui', 'generative-ui', 'cards', 'charts', 'interactive', 'dsh-plugin'],
        labels: ['interactive', 'cards', 'generative-ui', 'charts'],
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: publishedAt,
          source: {
            type: 'git',
            url: repoUrl,
            commit,
          },
          engines: { dsh: pkg.engines.dsh },
        },
      ],
    },
  ],
}

mkdirSync(join(root, 'market'), { recursive: true })
writeFileSync(join(root, 'market/index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`wrote market/index.json for ${pkg.name}@${pkg.version} @ ${commit}`)
