import { defineConfig } from 'drizzle-kit'

/**
 * Only used to write migration files: `pnpm db:generate` compares the schema
 * with the last migration and writes the difference as SQL into `drizzle/`.
 * It never connects to a database. Applying migrations is `pnpm db:migrate`.
 */
export default defineConfig({
  dialect: 'turso',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
})
