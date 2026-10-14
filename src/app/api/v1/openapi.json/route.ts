import { openApiDocument } from '@/server/api/openapi'

/** `GET /api/v1/openapi.json`: the API's own description. */
export function GET() {
  return Response.json(openApiDocument(), {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  })
}
