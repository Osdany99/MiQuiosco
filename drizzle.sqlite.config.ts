import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './app/server-offline/db/schema.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  verbose: true,
  strict: true
})
