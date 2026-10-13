/**
 * `pnpm fixtures:fetch` — the only thing in this repository that talks to the
 * real IGDB. Run by hand; it rewrites `fixtures/`, which is committed. Tests,
 * local seeds and preview deployments all read those files and never the
 * network.
 *
 * It needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in `.env.local`, and
 * prints neither.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import type { Palette } from '@/domain/color/palette'
import type { LineageStep } from '@/domain/igdb/game'
import {
  igdbLineageFields,
  igdbLineageSchema,
  vocabEndpoints,
  type IgdbGame,
  type IgdbLineage,
  type IgdbNamed,
  type IgdbSearchHit,
  type VocabKind,
} from '@/domain/igdb/schema'
import { idsAbove } from '@/domain/library/family'
import { igdbEnv } from '@/server/env'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readCoverArt } from '@/server/igdb/cover-art'

import { picks, versions, type Pick } from './fixtures/titles'

const ROOT = join(process.cwd(), 'fixtures')
const STRESS_EXTRA = 1050

const client = createIgdbClient({
  credentials: igdbEnv,
  tokens: memoryTokenStore(),
  // Well under IGDB's 4 a second: this script is in no hurry.
  perSecond: 3,
})
const api = createIgdbApi(client)

const yearOf = (hit: IgdbSearchHit): number | undefined =>
  hit.first_release_date === undefined
    ? undefined
    : new Date(hit.first_release_date * 1000).getUTCFullYear()

const titleOf = (pick: Pick): string => (typeof pick === 'string' ? pick : pick[0])

/** One line per record: readable diffs without the weight of pretty-printing. */
const writeLines = (path: string, records: readonly unknown[]) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `[\n${records.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`)
}

const writeJson = (path: string, value: unknown) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value)}\n`)
}

/** Stores worth keeping an id for: the ones a future sync could read. */
const STORES = new Set([1, 5, 11, 26, 36])
const BACKDROPS = new Set([1, 2, 3, 4])

/**
 * Drops what Shelf never reads (Amazon listings, YouTube ids, logos) and the
 * empty lists the schema would put back anyway. What is left still passes the
 * same schema as a live answer.
 */
const trim = (record: IgdbGame, lean: boolean): Record<string, unknown> => {
  const trimmed: Record<string, unknown> = {
    ...record,
    external_games: record.external_games.filter(
      (external) => external.uid && STORES.has(external.external_game_source ?? -1),
    ),
    artworks: record.artworks
      .filter((art) => art.artwork_type === undefined || BACKDROPS.has(art.artwork_type))
      .slice(0, 8),
    screenshots: record.screenshots.slice(0, 8),
    involved_companies: record.involved_companies.map((involved) => ({
      company: involved.company,
      ...(involved.developer ? { developer: true } : {}),
      ...(involved.publisher ? { publisher: true } : {}),
      ...(involved.porting ? { porting: true } : {}),
      ...(involved.supporting ? { supporting: true } : {}),
    })),
  }
  if (lean) {
    // The stress set exists for numbers of games, not for reading about them.
    delete trimmed.storyline
    trimmed.screenshots = record.screenshots.slice(0, 2)
    trimmed.artworks = (trimmed.artworks as unknown[]).slice(0, 1)
  }
  for (const [key, value] of Object.entries(trimmed)) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete trimmed[key]
  }
  return trimmed
}

const main = async () => {
  console.log(`Looking up ${picks.length} titles…`)
  const found = await api.findByTitles(picks.map(titleOf))

  const defaultIds: number[] = []
  const misses: string[] = []
  for (const [index, pick] of picks.entries()) {
    const hits = found[index] ?? []
    const wanted = typeof pick === 'string' ? undefined : pick[1]
    const hit = wanted === undefined ? hits[0] : hits.find((item) => yearOf(item) === wanted)
    if (hit) {
      defaultIds.push(hit.id)
    } else {
      const seen = hits.map((item) => `${item.name} (${yearOf(item) ?? '?'})`).join('; ')
      misses.push(`${titleOf(pick)}${wanted ? ` (${wanted})` : ''}${seen ? ` — saw: ${seen}` : ''}`)
    }
  }
  if (misses.length > 0) {
    console.error(`\n${misses.length} titles did not match:\n  ${misses.join('\n  ')}`)
    if (!process.argv.includes('--allow-missing')) {
      console.error('\nFix the titles in scripts/fixtures/titles.ts, or pass --allow-missing.')
      process.exit(1)
    }
  }
  const versionIds = versions.map((version) => version.igdbId)
  const sampleIds = [...new Set([...defaultIds, ...versionIds])]
  console.log(`Matched ${defaultIds.length}; ${versionIds.length} extra versions.`)

  console.log('Choosing the stress set…')
  const stressIds: number[] = []
  const taken = new Set(sampleIds)
  for (let offset = 0; stressIds.length < STRESS_EXTRA && offset < 3000; offset += 500) {
    const page = await client.query(
      'games',
      `fields id; where game_type = 0 & version_parent = null & cover != null & total_rating_count > 40; sort total_rating_count desc; limit 500; offset ${offset};`,
      z.object({ id: z.number().int() }),
    )
    if (page.length === 0) break
    for (const { id } of page) {
      if (!taken.has(id) && stressIds.length < STRESS_EXTRA) {
        taken.add(id)
        stressIds.push(id)
      }
    }
  }

  const allIds = [...sampleIds, ...stressIds]
  console.log(`Fetching ${allIds.length} records…`)
  const records: IgdbGame[] = []
  for (let start = 0; start < allIds.length; start += 100) {
    records.push(...(await api.games(allIds.slice(start, start + 100))))
    process.stdout.write(`\r  ${records.length}/${allIds.length}`)
  }
  process.stdout.write('\n')
  const byId = new Map(records.map((record) => [record.id, record]))
  const missing = allIds.filter((id) => !byId.has(id))
  if (missing.length > 0) console.warn(`  ${missing.length} ids came back without a usable record.`)

  console.log('Fetching time to beat…')
  const times = await api.timeToBeat(allIds)

  console.log('Fetching the records above them (originals of ports and editions)…')
  const ancestors = new Map<number, IgdbLineage>()
  let frontier = [...new Set(records.flatMap(idsAbove))].filter((id) => !byId.has(id))
  for (let depth = 0; depth < 6 && frontier.length > 0; depth += 1) {
    const fetched: IgdbLineage[] = []
    for (let start = 0; start < frontier.length; start += 500) {
      const ids = frontier.slice(start, start + 500)
      fetched.push(
        ...(await client.query(
          'games',
          `fields ${igdbLineageFields.join(',')}; where id = (${ids.join(',')}); limit ${ids.length};`,
          igdbLineageSchema,
        )),
      )
    }
    for (const record of fetched) ancestors.set(record.id, record)
    frontier = [...new Set(fetched.flatMap(idsAbove))].filter(
      (id) => !byId.has(id) && !ancestors.has(id),
    )
  }
  const lineages = await api.lineages(records, ancestors)
  const lineage: Record<number, LineageStep[]> = {}
  for (const [id, steps] of lineages) if (steps.length > 0) lineage[id] = steps

  console.log('Fetching names…')
  const collect = (read: (record: IgdbGame) => readonly number[]) => [
    ...new Set(records.flatMap(read)),
  ]
  const wanted: Record<Exclude<VocabKind, 'company'>, number[]> = {
    genre: collect((record) => record.genres),
    theme: collect((record) => record.themes),
    mode: collect((record) => record.game_modes),
    perspective: collect((record) => record.player_perspectives),
    franchise: collect((record) => [
      ...record.franchises,
      ...(record.franchise === undefined ? [] : [record.franchise]),
    ]),
    series: collect((record) => record.collections),
    keyword: collect((record) => record.keywords),
  }
  const names: Record<string, IgdbNamed[]> = {}
  for (const kind of Object.keys(vocabEndpoints) as Exclude<VocabKind, 'company'>[]) {
    names[kind] = (await api.named(kind, wanted[kind])).sort((a, b) => a.id - b.id)
    console.log(`  ${kind}: ${names[kind]?.length ?? 0}`)
  }

  console.log('Fetching platforms…')
  const platforms = (await api.platforms()).sort((a, b) => a.id - b.id)

  console.log('Reading covers (colors and a blurred preview each)…')
  const coversPath = join(ROOT, 'covers.json')
  const covers: Record<string, { colors: Palette; thumbhash: string }> = existsSync(coversPath)
    ? JSON.parse(readFileSync(coversPath, 'utf8'))
    : {}
  const coverIds = [...new Set(records.flatMap((record) => record.cover?.image_id ?? []))]
  const todo = coverIds.filter((id) => !covers[id])
  let done = 0
  const worker = async () => {
    for (;;) {
      const id = todo.pop()
      if (!id) return
      const art = await readCoverArt(id)
      if (art) covers[id] = art
      done += 1
      if (done % 25 === 0) process.stdout.write(`\r  ${done}/${done + todo.length}`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  process.stdout.write('\n')
  const keptCovers = Object.fromEntries(
    coverIds.flatMap((id) => (covers[id] ? [[id, covers[id]]] : [])).sort(),
  )

  const sample = new Set(sampleIds)
  writeLines(
    join(ROOT, 'igdb', 'games.json'),
    records.filter((record) => sample.has(record.id)).map((record) => trim(record, false)),
  )
  writeLines(
    join(ROOT, 'igdb', 'games-stress.json'),
    records.filter((record) => !sample.has(record.id)).map((record) => trim(record, true)),
  )
  writeLines(join(ROOT, 'igdb', 'time-to-beat.json'), [...times.values()])
  writeLines(
    join(ROOT, 'igdb', 'ancestors.json'),
    [...ancestors.values()].sort((a, b) => a.id - b.id),
  )
  writeJson(join(ROOT, 'igdb', 'lineage.json'), lineage)
  writeJson(join(ROOT, 'igdb', 'names.json'), names)
  writeLines(join(ROOT, 'igdb', 'platforms.json'), platforms)
  writeJson(coversPath, keptCovers)
  writeJson(join(ROOT, 'library', 'sets.json'), {
    fetchedOn: new Date().toISOString().slice(0, 10),
    default: defaultIds.filter((id) => byId.has(id)),
    versions: versionIds.filter((id) => byId.has(id)),
    stress: stressIds.filter((id) => byId.has(id)),
  })

  console.log(
    `\nWrote fixtures: ${sampleIds.length} sample games, ${stressIds.length} more for the stress set, ${Object.keys(keptCovers).length} covers read.`,
  )
}

await main()
