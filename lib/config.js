/**
 * Plugin configuration schema.
 *
 * Kept out of `index.js` so the core Host sources stay free of DSH package
 * imports (the safety test in `test/host.test.mjs` enforces that). Settings
 * forms can edit the volatile `outputPolicy` field.
 */
import z from '@deepseek-ai/schemastery'

export const Config = z.object({
  prompt: z.boolean().default(true),
  language: z.union(['zh', 'en']).default('zh'),
  outputPolicy: z.union(['cards-first', 'balanced']).default('cards-first').volatile(),
  imageHosts: z.array(z.string()).default([]),
  allowHttpImages: z.boolean().default(false),
})
