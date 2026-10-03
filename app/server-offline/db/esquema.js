/**
 * server-offline/db/esquema.js — Reconciliación idempotente del esquema SQLite.
 *
 * Lógica pura (sin Capacitor ni import.meta.glob) para que sea testeable en node.
 * Partes:
 * - separarSentencias: divide el journal de Drizzle en sentencias individuales.
 * - crearTablasFaltantes / añadirColumnasFaltantes / crearIndicesFaltantes:
 *   llevan una instalación existente al esquema actual sin tocar sus filas.
 *
 * El "conn" recibido debe exponer: async run(sql, params) y query(sql, params)
 * devolviendo { values: [...] } (contrato de @capacitor-community/sqlite).
 */

export function separarSentencias(sql) {
  return sql
    .split(/--> statement-breakpoint/g)
    .map(s => s.replace(/;?\s*$/, ''))
    .map(s => s.trim())
    .filter(Boolean)
}

export async function tablaExiste(conn, tabla) {
  const result = await conn.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tabla}'`, [])
  return (result.values?.length ?? 0) > 0
}

export async function columnasDeTabla(conn, tabla) {
  const res = await conn.query(`PRAGMA table_info(${tabla})`, [])
  return new Set((res.values ?? []).map(c => c.name))
}

export async function crearTablasFaltantes(conn, sql) {
  for (const sentencia of separarSentencias(sql)) {
    const esCreate = /^CREATE\s+TABLE\s+/.test(sentencia)
    if (!esCreate) continue
    const declaracion = sentencia.replace(/^CREATE\s+TABLE\s+/, 'CREATE TABLE IF NOT EXISTS ')
    try {
      await conn.run(declaracion, [])
    } catch {
      // la tabla ya existe: mejor esfuerzo
    }
  }
}

export function formatearDefault(valor) {
  if (typeof valor === 'boolean') return valor ? '1' : '0'
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'string') return `'${valor.replace(/'/g, '\'\'')}'`
  if (valor === null) return 'NULL'
  return String(valor)
}

/**
 * Añade a cada tabla existente las columnas que le falten según columnDefs
 * (mapa { nombre_tabla: [{ name, sqlType, notNull, default }] }).
 * Nunca borra filas; las columnas nuevas se rellenan con su DEFAULT.
 */
export async function añadirColumnasFaltantes(conn, columnDefs) {
  for (const [tabla, defs] of Object.entries(columnDefs)) {
    if (!(await tablaExiste(conn, tabla))) continue
    const existentes = await columnasDeTabla(conn, tabla)
    for (const def of defs) {
      if (existentes.has(def.name)) continue
      const notNull = def.notNull && def.default !== undefined ? ' NOT NULL' : ''
      const defaultSql = def.default !== undefined ? ` DEFAULT ${formatearDefault(def.default)}` : ''
      try {
        await conn.run(
          `ALTER TABLE ${tabla} ADD COLUMN ${def.name} ${def.sqlType}${notNull}${defaultSql}`,
          []
        )
      } catch {
        // Si falla por NOT NULL sin DEFAULT en SQLite con filas, reintenta nullable.
        if (notNull) {
          try {
            await conn.run(`ALTER TABLE ${tabla} ADD COLUMN ${def.name} ${def.sqlType}`, [])
          } catch {
            // mejor esfuerzo
          }
        }
      }
    }
  }
}

export async function crearIndicesFaltantes(conn, sql) {
  for (const sentencia of separarSentencias(sql)) {
    if (!/^CREATE\s+(UNIQUE\s+)?INDEX\s+/.test(sentencia)) continue
    const declaracion = sentencia
      .replace(/^CREATE\s+UNIQUE\s+INDEX\s+/, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
      .replace(/^CREATE\s+INDEX\s+/, 'CREATE INDEX IF NOT EXISTS ')
    try {
      await conn.run(declaracion, [])
    } catch {
      // el índice ya existe: mejor esfuerzo
    }
  }
}

/** DDL de una tabla a partir de los defs del schema (el mismo que emite Drizzle). */
function ddlDeTabla(tabla, defs) {
  const cols = defs.map((d) => {
    const notNull = d.notNull && d.default !== undefined ? ' NOT NULL' : ''
    const defaultSql = d.default !== undefined ? ` DEFAULT ${formatearDefault(d.default)}` : ''
    return `  ${d.name} ${d.sqlType}${notNull}${defaultSql}`
  })
  return `CREATE TABLE ${tabla} (\n${cols.join(',\n')}\n)`
}

/**
 * Quita columnas que el schema ya no declara (p. ej. `usuario_id` de
 * `clientes_telefonos` tras separar los clientes de `usuarios`).
 *
 * Es el complemento obligatorio de `añadirColumnasFaltantes`: aquel solo añade
 * y nunca quita, así que una columna NOT NULL sin DEFAULT que el código ya no
 * envía deja los inserts imposibles. Y `ALTER TABLE DROP COLUMN` no se puede
 * usar a ciegas porque solo existe desde SQLite 3.35 (Android 11).
 *
 * Se intenta primero el DROP y, si no está soportado, se reconstruye la tabla
 * desde los defs del schema copiando solo las columnas que siguen existiendo.
 */
export async function eliminarColumnasObsoletas(conn, tabla, columnDefs, obsoletas) {
  if (!obsoletas?.length) return false
  if (!await tablaExiste(conn, tabla)) return false

  const existentes = await columnasDeTabla(conn, tabla)
  const sobrantes = obsoletas.filter(c => existentes.has(c))
  if (!sobrantes.length) return false

  try {
    for (const col of sobrantes) {
      await txRun(conn, `ALTER TABLE ${tabla} DROP COLUMN ${col}`)
    }
    return true
  } catch {
    // SQLite antiguo: se reconstruye la tabla.
  }

  const defs = columnDefs[tabla]
  if (!defs) return false

  const temporal = `${tabla}__rebuild`
  try {
    await txRun(conn, `DROP TABLE IF EXISTS ${temporal}`)
    // La tabla nueva se crea con la forma DEL SCHEMA, no con la intersección:
    // si se filtrara por las columnas viejas, `cliente_id` (la que acaba de
    // añadir `añadirColumnasFaltantes`) desaparecería y el insert seguiría
    // fallando, que es justo lo que se viene a arreglar.
    await txRun(conn, ddlDeTabla(temporal, defs))
    // La copia solo arrastra las columnas que existen en ambas.
    const comunes = defs.map(d => d.name).filter(n => existentes.has(n))
    if (comunes.length) {
      await txRun(
        conn,
        `INSERT INTO ${temporal} (${comunes.join(',')}) SELECT ${comunes.join(',')} FROM ${tabla}`
      )
    }
    await txRun(conn, `DROP TABLE ${tabla}`)
    await txRun(conn, `ALTER TABLE ${temporal} RENAME TO ${tabla}`)
    return true
  } catch {
    await txRun(conn, `DROP TABLE IF EXISTS ${temporal}`).catch(() => {})
    // Mejor esfuerzo: si falla, la instalación sigue como estaba.
    return false
  }
}

/**
 * Transacción con SQL crudo, independiente de la versión del plugin.
 * @capacitor-community/sqlite cambió los nombres de begin/commit/rollback
 * entre versiones (v8: commitTransaction/rollbackTransaction) y su
 * bookkeeping nativo de transacciones ha dado estados contradictorios
 * ("already in transaction" + "no current transaction"). Con BEGIN/COMMIT/
 * ROLLBACK como sentencias SQL la única fuente de verdad es SQLite.
 *
 * Detalle crítico del plugin: conn.run(sql) viaja con transaction:true por
 * defecto y el nativo envuelve CADA sentencia en su propia transacción
 * implícita (para BEGIN/COMMIT el commit se omite y el finally revierte lo
 * abierto). Por eso todo lo que participe en NUESTRA transacción manual debe
 * viajar con transaction:false: el control (BEGIN/COMMIT/ROLLBACK) y cada
 * escritura interna. Sin esto, cada sentencia se auto-confirma por separado
 * (persiste pero sin atomicidad) y el COMMIT manual falla con
 * "no current transaction".
 *
 * Auto-reparación: si el BEGIN falla porque la conexión ya tiene una
 * transacción abierta (resto de una versión anterior con bug), se emite un
 * ROLLBACK y se reintenta el BEGIN una sola vez. Nunca toca filas.
 */
const SQL_BEGIN = 'BEGIN IMMEDIATE'
const SQL_COMMIT = 'COMMIT'
const SQL_ROLLBACK = 'ROLLBACK'

function esErrorTransaccionAbierta(err) {
  const msg = String(err?.message ?? err ?? '')
  return /already in transaction|cannot start a transaction within a transaction/i.test(msg)
}

/**
 * Ejecuta una sentencia como parte de nuestra transacción manual:
 * transaction:false para que el plugin no abra/cierre transacciones
 * implícitas alrededor. Ver comentario del bloque de transacciones.
 */
export function txRun(conn, sql, params = []) {
  return conn.run(sql, params, false)
}

export async function ejecutarTransaccionSql(conn, fn, ops) {
  try {
    await txRun(conn, SQL_BEGIN)
  } catch (err) {
    if (!esErrorTransaccionAbierta(err)) throw err
    // La conexión traía una transacción abierta: revertir y reintentar una vez.
    try {
      await txRun(conn, SQL_ROLLBACK)
    } catch {
      // rollback fallido: reintento de todos modos
    }
    await txRun(conn, SQL_BEGIN)
  }
  try {
    const r = await fn(ops)
    await txRun(conn, SQL_COMMIT)
    return r
  } catch (err) {
    try {
      await txRun(conn, SQL_ROLLBACK)
    } catch {
      // rollback fallido: la conexión queda en estado desconocido
    }
    throw err
  }
}

/**
 * Cola serializada de transacciones sobre una misma conexión SQLite.
 * Las llamadas se encadenan: nunca se solapan, pase lo que pase en los
 * llamadores. La cola nunca queda rechazada: un fallo no bloquea las
 * siguientes.
 */
export function crearColaTransacciones() {
  let cola = Promise.resolve()
  async function ejecutar(conn, fn, ops) {
    return new Promise((resolve, reject) => {
      cola = cola.then(async () => {
        try {
          const r = await ejecutarTransaccionSql(conn, fn, ops)
          resolve(r)
        } catch (err) {
          reject(err)
        }
      }).catch((err) => {
        reject(err)
      })
    })
  }
  return { ejecutar }
}
