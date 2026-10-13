/**
 * pnpm i18n:check
 * Fails if any language is missing a text, has one English lacks, has an empty
 * one, or disagrees with English about a text's placeholders.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { compareMessages, type Messages } from './lib/compare-messages.ts'

const SOURCE = 'en'
const directory = join(import.meta.dirname, '..', 'messages')

function read(locale: string): Messages {
  return JSON.parse(readFileSync(join(directory, `${locale}.json`), 'utf8')) as Messages
}

const locales = readdirSync(directory)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))

const others = Object.fromEntries(
  locales.filter((locale) => locale !== SOURCE).map((locale) => [locale, read(locale)]),
)

const problems = compareMessages(read(SOURCE), others, SOURCE)

if (problems.length === 0) {
  console.log(`Translations agree across ${locales.join(', ')}.`)
} else {
  for (const problem of problems) {
    const detail = problem.detail ? ` (${problem.detail})` : ''
    console.error(`${problem.locale}: ${problem.kind} "${problem.key}"${detail}`)
  }
  console.error(`\n${problems.length} translation problem(s).`)
  process.exit(1)
}
