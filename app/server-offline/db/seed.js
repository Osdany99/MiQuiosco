/**
 * server-offline/db/seed.js — Siembra inicial del jefe por defecto.
 *
 * SOLO DESARROLLO. `client.js` lo ejecuta únicamente cuando `import.meta.dev`
 * es true. En producción el APK nace sin usuarios y se aprovisiona con el
 * primer login online (el puesto y los usuarios llegan del servidor). Sembrar
 * un jefe local en un dispositivo real crearía un usuario del puesto equivocado
 * y un PIN conocido.
 *
 * Llamado la primera vez que se abre la DB local en dev, tanto en Android como
 * en el fallback en memoria del navegador.
 *
 * Importante: el jefe sembrado se marca sincronizado=1 para NO empujarlo
 * al servidor en el primer sync (el servidor se siembra aparte con
 * `pnpm db:seed`, usando los mismos IDs fijos; si el admin cambió el PIN
 * en el servidor, un push desde aquí lo resetearía a "1234").
 */
import bcrypt from 'bcryptjs'
import { JEFE_ID_FIJO, PUESTO_PRINCIPAL_ID_FIJO } from '../../../shared/constants'

/**
 * siembra el puesto principal + el usuario jefe con PIN "1234" si la DB está vacía.
 * @param {object} conn — InMemoryDb o conexión SQLite de Capacitor
 */
export async function sembrarJefeLocal(conn) {
  const ahora = Date.now()

  if (conn?.constructor?.name === 'InMemoryDb') {
    const usuarios = conn.all('usuarios')
    if (usuarios.length > 0) return

    const puesto = conn.getById('puestos', PUESTO_PRINCIPAL_ID_FIJO)
    if (!puesto) {
      conn.insert('puestos', {
        id: PUESTO_PRINCIPAL_ID_FIJO,
        nombre: 'Puesto principal',
        activo: 1,
        creado_en: ahora
      })
    }

    conn.insert('usuarios', {
      id: JEFE_ID_FIJO,
      puesto_id: PUESTO_PRINCIPAL_ID_FIJO,
      nombre: 'jefe',
      rol: 'jefe',
      pin_hash: bcrypt.hashSync('1234', 10),
      activo: 1,
      salario: 600,
      creado_en: ahora,
      actualizado_en: ahora,
      sincronizado: 1
    })
    return
  }

  // SQLite nativo (Capacitor)
  const countResult = await conn.query('SELECT COUNT(*) AS cnt FROM usuarios', [])
  const count = countResult.values?.[0]?.cnt ?? 0
  if (count > 0) return

  const puestoResult = await conn.query('SELECT id FROM puestos WHERE id = ? LIMIT 1', [PUESTO_PRINCIPAL_ID_FIJO])
  if (!puestoResult.values?.[0]) {
    await conn.run(
      'INSERT INTO puestos (id, nombre, activo, creado_en) VALUES (?, ?, 1, ?)',
      [PUESTO_PRINCIPAL_ID_FIJO, 'Puesto principal', ahora]
    )
  }

  const pinHash = bcrypt.hashSync('1234', 10)
  await conn.run(
    `INSERT INTO usuarios (id, puesto_id, nombre, rol, pin_hash, activo, salario, creado_en, actualizado_en, sincronizado)
     VALUES (?, ?, ?, ?, ?, 1, 600, ?, ?, 1)`,
    [JEFE_ID_FIJO, PUESTO_PRINCIPAL_ID_FIJO, 'jefe', 'jefe', pinHash, ahora, ahora]
  )
}
