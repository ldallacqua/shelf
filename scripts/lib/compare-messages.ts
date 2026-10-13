/**
 * Compares translation files. English is the source: every other language
 * must have exactly the same keys, a non-empty text for each, and the same
 * placeholders ({count}, <link>) inside each text.
 */

export type Messages = { [key: string]: string | Messages }

export type Problem = {
  locale: string
  key: string
  kind: 'missing' | 'extra' | 'empty' | 'placeholders'
  detail?: string
}

/** Flattens nested messages into "Namespace.key" paths. */
export function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const flat = new Map<string, string>()
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') flat.set(path, value)
    else for (const [childPath, text] of flatten(value, path)) flat.set(childPath, text)
  }
  return flat
}

/**
 * The names a text expects to be given: {name}, {count, plural, …} and <tag>.
 * ICU select and plural branches also contain words in braces ("{Light}")
 * that are not arguments, so only odd nesting depths count.
 */
export function argumentsOf(text: string): string[] {
  const names = new Set<string>()
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '{') {
      depth += 1
      if (depth % 2 === 1) {
        const match = /^\s*([A-Za-z_][\w-]*)\s*[,}]/.exec(text.slice(index + 1))
        if (match) names.add(`{${match[1]}}`)
      }
    } else if (char === '}') {
      depth -= 1
    }
  }
  for (const match of text.matchAll(/<([A-Za-z][\w-]*)>/g)) names.add(`<${match[1]}>`)
  return [...names].sort()
}

export function compareMessages(
  source: Messages,
  others: Record<string, Messages>,
  sourceLocale = 'en',
): Problem[] {
  const problems: Problem[] = []
  const sourceFlat = flatten(source)

  for (const [key, text] of sourceFlat) {
    if (text.trim() === '') problems.push({ locale: sourceLocale, key, kind: 'empty' })
  }

  for (const [locale, messages] of Object.entries(others)) {
    const flat = flatten(messages)

    for (const [key, text] of sourceFlat) {
      const translated = flat.get(key)
      if (translated === undefined) {
        problems.push({ locale, key, kind: 'missing' })
        continue
      }
      if (translated.trim() === '') {
        problems.push({ locale, key, kind: 'empty' })
        continue
      }
      const expected = argumentsOf(text).join(' ')
      const found = argumentsOf(translated).join(' ')
      if (expected !== found) {
        problems.push({
          locale,
          key,
          kind: 'placeholders',
          detail: `${sourceLocale} has [${expected}], ${locale} has [${found}]`,
        })
      }
    }

    for (const key of flat.keys()) {
      if (!sourceFlat.has(key)) problems.push({ locale, key, kind: 'extra' })
    }
  }

  return problems
}
