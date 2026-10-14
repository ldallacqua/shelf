import { shelvesAnswer, toApiShelf } from '@/server/api/library'
import { answer } from '@/server/api/respond'
import { getShelves } from '@/server/services/shelves'

/** `GET /api/v1/shelves`: every smart shelf, in order. */
export async function GET() {
  const shelves = await getShelves()
  return answer(shelvesAnswer, { shelves: shelves.map(toApiShelf) })
}
