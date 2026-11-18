#!/usr/bin/env node
/**
 * scripts/baseline-migraciones.mjs — alinea `drizzle.__drizzle_migrations` con
 * el historial del repo.
 *
 * POR QUÉ EXISTE
 * La base de producción se creó con `db:push`, así que el esquema existe pero
 * solo unas pocas migraciones quedaron registradas. `drizzle-kit migrate` lee
 * la ÚLTIMA fila registrada y reaplica todo lo que venga después: en esta base
 * falla con «already exists» y no hay forma de avanzar.
 *
 * Este script marca como aplicadas las migraciones que ya están en la base,
 * SIN ejecutar su SQL. Es lo que drizzle llama *baseline*.
 *
 * USO
 *   node scripts/baseline-migraciones.mjs            # solo muestra qué haría
 *   node scripts/baseline-migraciones.mjs --aplicar  # escribe las filas
 *
 * ANTES DE APLICAR, en una base que ya tiene datos:
 *   1. `pnpm db:push` (converge el esquema real con `schema.ts`, idempotente).
 *   2. Revisar el plan que imprime este script sin `--aplicar`.
 *   3. Copia de seguridad de la base (Neon: rama o dump).
 *   4. `--aplicar` y después `pnpm db:migrate` debe terminar sin hacer nada.
 *
 * Nunca borra filas: solo inserta las que faltan.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const CARPETA = join(RAIZ, 'drizzle')
const APLICAR = process.argv.includes('--aplicar')

// Igual que `db:push`/`db:migrate`: si no hay variable en el entorno, se usa el
// `.env` del proyecto (Node 22+ lo carga sin depender de dotenv).
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(RAIZ, '.env'))
  } catch {
    /* sin .env: se avisa abajo */
  }
}

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL (usa el .env del proyecto o exporta la variable).')
  process.exit(1)
}

const journal = JSON.parse(readFileSync(join(CARPETA, 'meta', '_journal.json'), 'utf8'))
const migraciones = journal.entries.map((entrada) => {
  const sql = readFileSync(join(CARPETA, `${entrada.tag}.sql`), 'utf8')
  return {
    tag: entrada.tag,
    when: entrada.when,
    hash: createHash('sha256').update(sql).digest('hex')
  }
})

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL })
await cliente.connect()

try {
  // La tabla vive en el esquema `drizzle` y la crea drizzle-orm al migrar. Si
  // no existe, el dry-run solo lo dice: crear cosas no es parte de un "plan".
  const { rowCount } = await cliente.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
  `)
  const filas = rowCount
    ? (await cliente.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations')).rows
    : []
  const registradas = new Set(filas.map(fila => fila.hash))
  const faltan = migraciones.filter(m => !registradas.has(m.hash))

  if (!rowCount) console.log('La tabla drizzle.__drizzle_migrations no existe todavía.')
  console.log(`Migraciones en el repo: ${migraciones.length}`)
  console.log(`Registradas en la base: ${registradas.size}`)
  console.log(`Faltan por registrar: ${faltan.length}`)

  // Filas cuyo hash no corresponde a ninguna migración actual: o la migración
  // se editó después de aplicarse, o viene de un historial anterior. No rompe
  // el baseline, pero conviene saberlo antes de tocar nada.
  const porFecha = new Map(migraciones.map(m => [m.when, m.tag]))
  const huerfanas = filas.filter(fila => !migraciones.some(m => m.hash === fila.hash))
  if (huerfanas.length) {
    console.log('\nFilas registradas que no coinciden con el repo:')
    for (const fila of huerfanas) {
      const tag = porFecha.get(Number(fila.created_at))
      console.log(tag
        ? `  · ${tag}: la migración se editó después de aplicarse`
        : `  · hash ${String(fila.hash).slice(0, 12)}… sin migración equivalente`)
    }
  }

  if (faltan.length) {
    console.log('\nSe marcarán como aplicadas (sin ejecutar su SQL):')
    for (const m of faltan) console.log(`  · ${m.tag}`)
  }

  if (!faltan.length) {
    console.log('\nNada que hacer: el historial ya está completo.')
  } else if (!APLICAR) {
    console.log('\nPlan sin cambios. Repite con --aplicar para escribir las filas.')
  } else {
    await cliente.query('BEGIN')
    await cliente.query('CREATE SCHEMA IF NOT EXISTS drizzle')
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)
    for (const m of faltan) {
      await cliente.query(
        'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
        [m.hash, m.when]
      )
    }
    await cliente.query('COMMIT')
    console.log(`\nListo: ${faltan.length} migraciones registradas.`)
  }
} catch (error) {
  await cliente.query('ROLLBACK').catch(() => {})
  console.error('Falló el baseline:', error?.message || error)
  process.exitCode = 1
} finally {
  await cliente.end().catch(() => {})
}
