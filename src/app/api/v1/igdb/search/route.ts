import { paramsOf } from '@/server/api/respond'
import { apiSearchAnswer, ownerRead, toApiSearch } from '@/server/api/writes'
import { searchToAdd } from '@/server/services/adding'

/** `GET /api/v1/igdb/search?q=`: IGDB's games, as the Add sheet shows them. The owner only. */
export async function GET(request: Request) {
  const result = await searchToAdd(paramsOf(request).q)
  return ownerRead(
    apiSearchAnswer,
    result.ok ? { ok: true, value: toApiSearch(result.value) } : result,
  )
}
