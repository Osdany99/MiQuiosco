import { eq } from 'drizzle-orm'
import { db, closeDb } from './client'
import { puestos, usuarios } from './schema'
import { hashPin } from '../utils/auth'
import { JEFE_ID_FIJO, PUESTO_PRINCIPAL_ID_FIJO } from '#shared/constants'

/**
 * Script de inicialización: crea el puesto por defecto y el usuario jefe
 * con PIN temporal `1234`.
 *
 * Usa IDs fijos (JEFE_ID_FIJO / PUESTO_PRINCIPAL_ID_FIJO) para que el
 * seed local del cliente (useLocalDb.js) pueda insertar los mismos IDs
 * en SQLite y coincidan con el servidor en el primer sync.
 *
 * Uso: pnpm db:seed
 *
 * Es idempotente: si el puesto o el jefe ya existen (por ID fijo), los respeta.
 */

const PUESTO_NOMBRE = 'Puesto principal'
const ADMIN_NOMBRE = 'jefe'
const ADMIN_PIN_TEMPORAL = '1234'

async function main() {
  console.log('Iniciando seed de MiQuiosco...')

  // 1. Puesto por defecto (ID fijo)
  const existingPuesto = await db
    .select()
    .from(puestos)
    .where(eq(puestos.id, PUESTO_PRINCIPAL_ID_FIJO))
    .limit(1)

  if (existingPuesto.length > 0) {
    console.log(`✔ Puesto "${PUESTO_NOMBRE}" ya existe (id=${PUESTO_PRINCIPAL_ID_FIJO})`)
  } else {
    await db.insert(puestos).values({
      id: PUESTO_PRINCIPAL_ID_FIJO,
      nombre: PUESTO_NOMBRE,
      activo: true
    })
    console.log(`✔ Puesto "${PUESTO_NOMBRE}" creado (id=${PUESTO_PRINCIPAL_ID_FIJO})`)
  }

  // 2. Jefe con PIN temporal (ID fijo)
  const existingAdmin = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, JEFE_ID_FIJO))
    .limit(1)

  if (existingAdmin.length > 0) {
    console.log(`✔ Usuario "${ADMIN_NOMBRE}" ya existe (id=${JEFE_ID_FIJO})`)
  } else {
    const pinHash = await hashPin(ADMIN_PIN_TEMPORAL)
    await db.insert(usuarios).values({
      id: JEFE_ID_FIJO,
      puestoId: PUESTO_PRINCIPAL_ID_FIJO,
      nombre: ADMIN_NOMBRE,
      rol: 'jefe',
      pinHash,
      activo: true
    })
    console.log(`✔ Usuario jefe creado (id=${JEFE_ID_FIJO})`)
    console.log(`  Nombre: ${ADMIN_NOMBRE}`)
    console.log(`  PIN temporal: ${ADMIN_PIN_TEMPORAL}`)
  }

  console.log('\nSeed completado.')
}

main()
  .catch((err) => {
    console.error('Error durante el seed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await closeDb()
  })
