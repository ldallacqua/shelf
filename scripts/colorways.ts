/**
 * pnpm tokens:colorways
 *
 * Writes `src/ui/tokens/colorways.css` from the presets' seeds in
 * `src/domain/colorway/presets.ts`. Run it after changing a seed or the rules
 * that work a colorway out, and look at the presets in Storybook's Colors.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { colorwaysCss } from '@/features/theme/colorways-css'

const file = join(import.meta.dirname, '..', 'src', 'ui', 'tokens', 'colorways.css')
writeFileSync(file, colorwaysCss())
console.log(`Wrote ${file}`)
