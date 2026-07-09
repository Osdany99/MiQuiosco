import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './shared/schema-sqlite.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  verbose: true,
  strict: true
})
