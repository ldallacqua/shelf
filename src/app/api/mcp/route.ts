import { createMcpHandler } from '@modelcontextprotocol/server'

import { publicMcpServer } from '@/server/mcp/server'

/**
 * `POST /api/mcp`: the library for any assistant, to read (architecture,
 * section 16). Stateless: each request is answered by a server of its own.
 * Assistants on the 2025 revision of MCP are served too, the same way.
 */

const handler = createMcpHandler(() => publicMcpServer())

export const POST = (request: Request) => handler.fetch(request)
