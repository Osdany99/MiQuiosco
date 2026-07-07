import { eq } from 'drizzle-orm'
import { db, closeDb } from './client'
import { puestos, usuarios } from './schema'
import { hashPin } from '../utils/auth'

/**
 * Script de inicialización: crea el puesto por defecto y el usuario jefe
 * con PIN temporal `1234` y flag `debeCambiarPin = true` para forzar el
 * primer cambio de PIN desde la UI.
 *
 * Uso: pnpm db:seed
 *
 * Es idempotente: si el puesto o el jefe ya existen, los respeta.
 */

const PUESTO_NOMBRE = 'Puesto principal'
const ADMIN_NOMBRE = 'jefe'
const ADMIN_PIN_TEMPORAL = '1234'

async function main() {
  console.log('Iniciando seed de MiQuiosco...')

  // 1. Puesto por defecto
  const existingPuesto = await db
    .select()
    .from(puestos)
    .where(eq(puestos.nombre, PUESTO_NOMBRE))
    .limit(1)

  let puestoId: string

  if (existingPuesto.length > 0) {
    puestoId = existingPuesto[0]!.id
    console.log(`✔ Puesto "${PUESTO_NOMBRE}" ya existe (id=${puestoId})`)
  } else {
    const inserted = await db
      .insert(puestos)
      .values({ nombre: PUESTO_NOMBRE, activo: true })
      .returning({ id: puestos.id })
    puestoId = inserted[0]!.id
    console.log(`✔ Puesto "${PUESTO_NOMBRE}" creado (id=${puestoId})`)
  }

  // 2. Admin con PIN temporal
  const existingAdmin = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.nombre, ADMIN_NOMBRE))
    .limit(1)

  if (existingAdmin.length > 0) {
    console.log(`✔ Usuario "${ADMIN_NOMBRE}" ya existe`)
    console.log(`  Rol: ${existingAdmin[0]!.rol}, debe cambiar PIN: ${existingAdmin[0]!.debeCambiarPin}`)
  } else {
    const pinHash = await hashPin(ADMIN_PIN_TEMPORAL)
    await db.insert(usuarios).values({
      puestoId,
      nombre: ADMIN_NOMBRE,
      rol: 'jefe',
      pinHash,
      activo: true,
      debeCambiarPin: true
    })
    console.log(`✔ Usuario jefe creado`)
    console.log(`  Nombre: ${ADMIN_NOMBRE}`)
    console.log(`  PIN temporal: ${ADMIN_PIN_TEMPORAL} (cámbialo en el primer login)`)
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
