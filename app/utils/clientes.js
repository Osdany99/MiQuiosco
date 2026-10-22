/**
 * app/utils/clientes.js — Identidad de clientes: nombres y números.
 *
 * Un cliente tiene un nombre unificado y N números. Cada número puede llevar
 * su propio nombre (`etiqueta`), que es lo que permite distinguir "Cheila" de
 * "Cheila 2" después de fusionarlas en un solo cliente.
 *
 * Todo lo de aquí es puro (sin Vue ni repos) para poder probarlo en node.
 */

/**
 * Forma canónica de un nombre para comparar: sin acentos, minúsculas y con los
 * separadores colapsados. "Adrián  Maní" y "adrian mani" son el mismo nombre.
 *
 * OJO: al quitar los diacríticos la "ñ" se vuelve "n" (Peña == Pena). Es a
 * propósito: en la agenda del teléfono el mismo contacto aparece escrito de
 * las dos formas y lo que buscamos es emparejar, no mostrar.
 */
export function normalizarNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Distancia de edición clásica, sin dependencias. */
function distancia(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const actual = [i]
    for (let j = 1; j <= b.length; j++) {
      actual[j] = Math.min(
        previa[j] + 1,
        actual[j - 1] + 1,
        previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    previa = actual
  }
  return previa[b.length]
}

/**
 * Parecido entre dos nombres, de 0 a 1. Es SOLO para sugerir en la UI: nunca
 * decide por su cuenta que dos clientes son el mismo.
 *
 * Combina tres señales porque en una agenda real cada una falla sola:
 * - tokens compartidos ("dayana d betty" vs "dayana d rene"),
 * - edición ("javie" vs "javier"),
 * - sufijo de desambiguación ("cheila" vs "cheila 2", "melvis" vs "melvis 99").
 */
export function similitudNombres(a, b) {
  const na = normalizarNombre(a)
  const nb = normalizarNombre(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  const comunes = [...ta].filter(t => tb.has(t)).length
  const dice = (2 * comunes) / (ta.size + tb.size)

  const lev = 1 - distancia(na, nb) / Math.max(na.length, nb.length)

  // "cheila" ~ "cheila 2": el sufijo corto es un número de desambiguación del
  // contacto, no un apellido. Los sufijos largos ("adrian" ~ "adriana hija d
  // kico") sí son personas distintas y no deben subir tanto.
  let prefijo = 0
  const [corto, largo] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (largo.startsWith(corto)) {
    const sufijo = largo.slice(corto.length).trim()
    prefijo = sufijo.length <= 3 ? 0.9 : 0.6
  }

  return Math.max(dice, lev, prefijo)
}

/**
 * Clientes parecidos a `nombre`, de mayor a menor parecido.
 * @returns {Array<{ cliente: object, similitud: number }>}
 */
export function clientesSimilares(nombre, clientes, { umbral = 0.8, excluirId = null } = {}) {
  return (clientes ?? [])
    .filter(c => c && c.id !== excluirId)
    .map(cliente => ({ cliente, similitud: similitudNombres(nombre, cliente.nombre) }))
    .filter(x => x.similitud >= umbral)
    .sort((a, b) => b.similitud - a.similitud)
}

/**
 * Un contacto guardado con el número como nombre ("50218368", "+53 5 0081756").
 * No es un nombre útil: al importar hay que pedirlo.
 */
export function nombrePareceTelefono(nombre) {
  const texto = String(nombre ?? '')
  const digitos = (texto.match(/\d/g) ?? []).length
  const letras = (texto.match(/[a-záéíóúüñ]/gi) ?? []).length
  return digitos >= 7 && letras <= 2
}

/** Etiqueta visible de un número, con los últimos 4 dígitos como respaldo. */
export function etiquetaDeTelefono(fila) {
  const etiqueta = String(fila?.etiqueta ?? '').trim()
  if (etiqueta) return etiqueta
  const telefono = String(fila?.telefono ?? '')
  return telefono ? `··${telefono.slice(-4)}` : ''
}

/**
 * Partes visibles de una identidad: el nombre del número manda y el cliente
 * unificado va como contexto. Así dos números del mismo cliente no se
 * confunden entre sí ("Cheila 2 · Cheila").
 */
export function partesIdentidad(clienteNombre, filaTelefono) {
  const cliente = String(clienteNombre ?? '').trim()
  const etiqueta = String(filaTelefono?.etiqueta ?? '').trim()
  const telefono = String(filaTelefono?.telefono ?? '')
  const sufijo = telefono ? `··${telefono.slice(-4)}` : ''

  if (etiqueta && cliente && normalizarNombre(etiqueta) !== normalizarNombre(cliente)) {
    return { principal: etiqueta, secundario: cliente }
  }
  if (etiqueta) return { principal: etiqueta, secundario: '' }
  if (cliente) return { principal: cliente, secundario: sufijo }
  return { principal: sufijo || 'Sin asignar', secundario: '' }
}

/** Identidad en una línea: `"Cheila 2 · Cheila"`, `"Cheila ··5410"`. */
export function textoIdentidad(clienteNombre, filaTelefono) {
  const { principal, secundario } = partesIdentidad(clienteNombre, filaTelefono)
  if (!secundario) return principal
  return secundario.startsWith('··') ? `${principal} ${secundario}` : `${principal} · ${secundario}`
}

function tiempo(valor) {
  if (valor == null) return 0
  if (typeof valor === 'number') return valor
  const ms = new Date(valor).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Reglas puras de una fusión: quién queda como principal, qué clientes se
 * absorben y qué etiqueta recibe cada número.
 *
 * Está separado del acceso a datos para poder probarlo sin SQLite ni Postgres,
 * y para que la fusión offline y la online no se separen en lo que importa:
 * - el principal es el cliente cuyo nombre ya es el final; si no hay, el más
 *   antiguo (conserva su id y todas las referencias),
 * - un número sin etiqueta hereda el nombre del cliente absorbido si difiere
 *   del final, que es lo que hace legible "Cheila 2 · Cheila".
 *
 * @typedef {{ id: string, nombre: string, notas?: string|null, creadoEn?: number|string|Date }} ClienteFusion
 * @typedef {{ id: string, clienteId: string, etiqueta?: string|null }} TelefonoFusion
 * @typedef {{ id: string, clienteId: string, etiqueta: string|null }} TelefonoMovido
 * @param {{
 *   clientes: ClienteFusion[],
 *   telefonos: TelefonoFusion[],
 *   ids: string[],
 *   nombreFinal: string
 * }} datos
 * @returns {{
 *   principal: ClienteFusion,
 *   absorbidos: ClienteFusion[],
 *   telefonos: TelefonoMovido[],
 *   renombrar: boolean
 * }}
 */
export function planificarFusion({ clientes, telefonos, ids, nombreFinal }) {
  const canonico = normalizarNombre(nombreFinal)
  const elegidos = (clientes ?? []).filter(c => ids.includes(c.id))
  if (elegidos.length !== ids.length) {
    throw new Error('Alguno de los clientes ya no existe.')
  }

  const coincide = elegidos.find(c => normalizarNombre(c.nombre) === canonico)
  const principal = coincide ?? [...elegidos].sort((a, b) => tiempo(a.creadoEn) - tiempo(b.creadoEn))[0]
  const absorbidos = elegidos.filter(c => c.id !== principal.id)
  const renombrar = !coincide

  const mover = []
  for (const fila of telefonos ?? []) {
    const origen = elegidos.find(c => c.id === fila.clienteId)
    if (!origen) continue
    const esPrincipal = origen.id === principal.id
    // Los números del principal solo se tocan si cambia de nombre: en ese caso
    // su nombre viejo pasa a ser el alias del número, igual que los absorbidos.
    if (esPrincipal && !renombrar) continue
    const tieneEtiqueta = !!String(fila.etiqueta ?? '').trim()
    const etiqueta = tieneEtiqueta
      ? fila.etiqueta
      : (normalizarNombre(origen.nombre) !== canonico ? origen.nombre : null)
    if (esPrincipal && !etiqueta) continue
    mover.push({ id: fila.id, clienteId: principal.id, etiqueta })
  }

  return { principal, absorbidos, telefonos: mover, renombrar }
}
