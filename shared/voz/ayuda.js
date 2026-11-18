/**
 * shared/voz/ayuda.js - catálogo de la ayuda hablada.
 *
 * Una sola fuente para las tres bocas que explican los comandos:
 *   1. El comando «ayuda» de la app abierta (`useVentaPorVoz.responderAyuda`).
 *   2. La pantalla «¿Qué puedo decir?».
 *   3. El servicio con la app cerrada: `scripts/copiar-voz.mjs` inyecta
 *      `ayudaParaNativo()` en `assets/voz/dialogo.json`.
 *
 * La ayuda no es una lista: es un menú. Primero dice a grandes rasgos lo que
 * sabe hacer y pregunta de qué se quiere el detalle; solo entonces explica un
 * grupo con dos frases. Una lista de trece comandos no la retiene nadie.
 *
 * Módulo puro: sin Vue, sin repositorio, sin red.
 */
import { COMANDOS_TRABAJADOR } from './trabajador.js'

/**
 * Lo que el servicio nativo sabe hacer con la app cerrada. Si un grupo no tiene
 * ningún comando de esta lista, no se ofrece: prometer «entradas» y contestar
 * «abre la app» es peor que no ofrecerlo.
 */
export const COMANDOS_APP_CERRADA = Object.freeze([
  'venta_directa',
  'venta_fiada',
  'cobro_deuda',
  'consulta_stock',
  'consulta_precio',
  'consulta_deuda',
  'consulta_dia',
  'consulta_ganancia',
  'ayuda',
  'repetir'
])

/**
 * Grupos de la ayuda, en el orden en que se ofrecen. El orden importa: con
 * «ayuda» a secas se pregunta por los cinco primeros.
 *
 * `menu` y `infinitivo` son para hablar; `palabras` es lo que se acepta como
 * respuesta al menú («cobrar», «de cobro», «cómo cobro»). `ejemplo` es el
 * comodín: la app lo sustituye por un producto real del catálogo.
 */
export const GRUPOS_AYUDA = Object.freeze([
  {
    id: 'vender',
    menu: 'vender',
    sustantivo: 'ventas',
    infinitivo: 'vender',
    palabras: ['vender', 'venta', 'ventas', 'vende', 'vendo', 'vendeme'],
    detalle: 'Para vender, di por ejemplo «{ejemplo}». Te leo lo que entendí y espero tu sí.',
    extra: 'Si no hay stock, no anoto nada.',
    ejemplo: 'vende dos panes',
    ejemplos: ['vende dos panes', 'vende tres refrescos en el quiosco', 'vende un pan de regalo'],
    comandos: ['venta_directa']
  },
  {
    id: 'fiar',
    menu: 'fiar',
    sustantivo: 'fiados',
    infinitivo: 'fiar',
    palabras: ['fiar', 'fia', 'fiado', 'fiados', 'fiame', 'fiarle'],
    detalle: 'Para fiar, di por ejemplo «{ejemplo}». Queda como deuda del cliente en el cuadre.',
    extra: 'Si hay dos clientes con nombre parecido, te pregunto cuál.',
    ejemplo: 'fía dos panes a Juan',
    ejemplos: ['fía dos panes a Juan', 'anota fiado un refresco a María'],
    comandos: ['venta_fiada']
  },
  {
    id: 'cobrar',
    menu: 'cobrar',
    sustantivo: 'cobros',
    infinitivo: 'cobrar',
    palabras: ['cobrar', 'cobra', 'cobro', 'cobros', 'cobre', 'abonar', 'abono', 'pagar', 'pago'],
    detalle: 'Para cobrar, di por ejemplo «{ejemplo}». Te digo cuánto le queda debiendo y espero tu sí.',
    extra: 'Si no tiene deuda, no anoto nada.',
    ejemplo: 'cobra 200 a Juan',
    ejemplos: ['cobra 200 a Juan', 'Juan me pagó 100', 'abona 50 a María'],
    comandos: ['cobro_deuda']
  },
  {
    id: 'consultar',
    menu: 'consultar',
    sustantivo: 'consultas',
    infinitivo: 'consultar',
    palabras: ['consultar', 'consulta', 'consultas', 'cuanto', 'cuanta', 'cuantos', 'cuantas', 'stock', 'precio', 'dia', 'caja', 'ganancia', 'deben'],
    detalle: 'Pregunta normal, por ejemplo «{ejemplo}». Te contesto con el dato y no anoto nada.',
    extra: 'También «cuánto me deben», «cuánto gané hoy» y «cómo está la caja».',
    ejemplo: 'cuánto hay de pan',
    ejemplos: ['cuánto hay de pan', 'cuánto cuesta el pan', 'cuánto me deben', 'cómo va el día', 'cuánto gané hoy', 'cómo está la caja'],
    comandos: ['consulta_stock', 'consulta_precio', 'consulta_deuda', 'consulta_dia', 'consulta_ganancia', 'consulta_caja']
  },
  {
    id: 'preparar',
    menu: 'entradas y cambios',
    sustantivo: 'cambios de precio',
    infinitivo: 'dejar listas entradas y cambios',
    palabras: ['entrada', 'entradas', 'entraron', 'precio', 'cambiar', 'cambia', 'cambios', 'traspaso', 'pasa', 'merma', 'ajuste', 'producto', 'cliente', 'mover'],
    detalle: 'Puedo dejar listo un formulario, por ejemplo «{ejemplo}».',
    extra: 'Tú revisas y confirmas en la pantalla. También valen cambios de precio, traspasos, mermas, productos nuevos y clientes.',
    ejemplo: 'entraron 20 panes a 10 pesos',
    ejemplos: ['entraron 20 panes a 10 pesos', 'cambia el precio del pan a 25', 'pasa 5 panes al quiosco', 'se rompieron 3 panes', 'crea un producto pan de leche a 25', 'agrega el cliente Adrián'],
    comandos: ['entrada_inventario', 'cambio_precio', 'traspaso', 'ajuste_inventario', 'producto_alta', 'cliente_alta', 'mover_producto']
  },
  {
    id: 'cuadre',
    menu: 'deudas y transferencias',
    sustantivo: 'deudas',
    infinitivo: 'anotar deudas y transferencias',
    palabras: ['deuda', 'deudas', 'anotar', 'transferencia', 'transfiere', 'cuadre'],
    detalle: 'En el cuadre, di por ejemplo «{ejemplo}». Espero tu sí antes de anotarlo.',
    extra: 'También «abre el cuadre» y «cierra el cuadre».',
    ejemplo: 'anota que Juan debe 500',
    ejemplos: ['anota que Juan debe 500', 'transferencia de 500 a Juan', 'abre el cuadre', 'cierra el cuadre'],
    comandos: ['deuda_dinero', 'transferencia_cuadre', 'cuadre_accion']
  },
  {
    id: 'sistema',
    menu: 'lo básico',
    sustantivo: 'lo básico',
    infinitivo: 'explicarte cómo se usa',
    palabras: ['basico', 'empezar', 'funciona', 'uso', 'usar'],
    detalle: 'Primero di la palabra clave y luego lo que quieres, por ejemplo «{ejemplo}».',
    extra: 'Antes de anotar te leo lo que entendí y espero un sí. «No» cancela y «repite» lo vuelve a decir.',
    ejemplo: 'oye nova, vende dos panes',
    ejemplos: ['oye nova, vende dos panes', 'repite', 'no'],
    comandos: ['ayuda', 'repetir']
  }
])

export const IDS_AYUDA = Object.freeze(GRUPOS_AYUDA.map(g => g.id))

const CONECTORES = new Set(['de', 'del', 'sobre', 'para', 'con', 'el', 'la', 'los', 'las', 'lo', 'un', 'una'])
const COMODINES = new Set(['todo', 'todos', 'todas', 'mas', 'siguiente', 'otro', 'otra', 'voz', 'hacer'])

/** Normaliza sin depender de `gramatica.js` (que a su vez importa este módulo). */
export function normalizarAyuda(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

const RE_TRIGGER = /^(?:ayuda|que puedes hacer|que sabes hacer|comandos|que comandos|como te uso|como funciona|como se usa|para que sirves)\b/

/**
 * ¿La frase pide ayuda? Solo cuenta si lo que viene detrás del disparador es un
 * tema conocido o nada: «ayuda a vender dos panes» es una venta, no una ayuda.
 */
export function esPeticionDeAyuda(texto) {
  const plano = normalizarAyuda(texto)
  if (!RE_TRIGGER.test(plano)) return false
  const resto = plano.replace(RE_TRIGGER, '').trim()
  if (!resto) return true
  const permitidas = new Set([
    ...CONECTORES,
    ...COMODINES,
    ...GRUPOS_AYUDA.flatMap(g => g.palabras)
  ])
  return resto.split(' ').every(token => permitidas.has(token))
}

/**
 * Grupo de ayuda pedido, o `null` si la frase no nombra ninguno.
 * Devuelve además los comodines `todo` y `mas` que maneja el flujo.
 *
 * @param {string} texto
 * @param {Array} grupos Grupos disponibles en este contexto (rol/pantalla).
 */
export function temaDeAyuda(texto, grupos = GRUPOS_AYUDA) {
  const plano = normalizarAyuda(texto)
  if (!plano) return null
  // «cómo te uso» y compañía no son un grupo: son el modelo de uso.
  if (/^(?:como te uso|como funciona|como se usa|para que sirves)\b/.test(plano)) return 'sistema'

  const resto = plano.includes('ayuda')
    ? plano.replace(RE_TRIGGER, '').trim()
    : plano
  if (!resto) return null
  const tokens = resto.split(' ').filter(t => t && !CONECTORES.has(t))
  if (!tokens.length) return null
  if (tokens.includes('todo') || tokens.includes('todos') || tokens.includes('todas')) return 'todo'
  if (tokens.includes('mas') || tokens.includes('siguiente') || tokens.includes('otro') || tokens.includes('otra')) return 'mas'

  // Gana el grupo que más palabras comparte: «cambiar precio» es preparar y no
  // consultar, aunque los dos tengan «precio».
  let mejor = null
  let puntaje = 0
  for (const grupo of grupos) {
    const coinciden = grupo.palabras.filter(p => tokens.includes(p)).length
    if (coinciden > puntaje) {
      mejor = grupo.id
      puntaje = coinciden
    }
  }
  return mejor
}

/** Grupos que tienen sentido para este rol y este estado de la app. */
export function gruposDisponibles({ esTrabajador = false, appCerrada = false } = {}) {
  return GRUPOS_AYUDA.filter((grupo) => {
    if (appCerrada && !grupo.comandos.some(c => COMANDOS_APP_CERRADA.includes(c))) return false
    if (esTrabajador && !grupo.comandos.some(c => COMANDOS_TRABAJADOR.includes(c))) return false
    return true
  })
}

/** Los grupos que se ofrecen en el menú: «lo básico» se pide, no se ofrece. */
export function gruposDelMenu(grupos) {
  return grupos.filter(g => g.id !== 'sistema')
}

/** Une una lista en español: «a», «a y b», «a, b y c». */
export function listarEnEspanol(items) {
  const lista = items.filter(Boolean)
  if (lista.length <= 1) return lista[0] ?? ''
  if (lista.length === 2) return `${lista[0]} y ${lista[1]}`
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`
}

/** Primera frase: el mapa, con un sustantivo por tema. */
export function introDeAyuda(grupos) {
  const hablables = gruposDelMenu(grupos)
  if (!hablables.length) return 'Ahora mismo no puedo hacer nada aquí.'
  return `Te ayudo con ${listarEnEspanol(hablables.map(g => g.sustantivo))}.`
}

/**
 * Segunda frase: la pregunta que convierte el monólogo en menú. No repite la
 * lista: se acaba de decir y repetirla alarga la ayuda sin aportar nada.
 */
export function preguntaDeAyuda(grupos) {
  return gruposDelMenu(grupos).length > 1 ? '¿De qué quieres ejemplos?' : ''
}

/** Detalle de un grupo, con el ejemplo real si se conoce uno del catálogo. */
export function textoDeGrupo(grupo, ejemplo = null) {
  if (!grupo) return ''
  const frase = String(grupo.detalle).replace('{ejemplo}', String(ejemplo || grupo.ejemplo))
  return grupo.extra ? `${frase} ${grupo.extra}` : frase
}

/** Un ejemplo por grupo, para quien pide «ayuda de todo». */
export function todoDeAyuda(grupos) {
  const hablables = gruposDelMenu(grupos).slice(0, 5)
  if (!hablables.length) return 'Ahora mismo no puedo hacer nada aquí.'
  return `Un ejemplo de cada cosa. ${hablables.map(g => `«${g.ejemplo}».`).join(' ')}`
}

/**
 * Cuando no se entiende la frase, una pista concreta vale más que «todavía no
 * sé hacer eso». Devuelve la tarea más probable y una frase de ejemplo, o
 * `null` si no hay ninguna señal.
 */
export function sugerenciaDeAyuda(texto) {
  const tokens = normalizarAyuda(texto).split(' ').filter(Boolean)
  const tiene = lista => lista.some(p => tokens.includes(p))

  if (tiene(['fia', 'fiar', 'fiado', 'fiao', 'fiarle', 'fiale', 'fias', 'fian', 'fiame', 'fiamelo', 'presta', 'prestar', 'prestame'])) {
    return { grupo: 'fiar', frase: 'fía dos panes a Juan', mensaje: 'Si es un fiado, di «fía dos panes a Juan».' }
  }
  if (tiene(['cobra', 'cobrar', 'abona', 'abonar', 'paga', 'pagar', 'pago', 'pague', 'plata'])) {
    return { grupo: 'cobrar', frase: 'cobra 200 a Juan', mensaje: 'Si es un cobro, di «cobra 200 a Juan».' }
  }
  if (tiene(['cuanto', 'cuanta', 'cuantos', 'cuantas', 'precio', 'stock', 'queda', 'quedan', 'debe', 'deben', 'deuda', 'deudas', 'dia', 'caja'])) {
    return { grupo: 'consultar', frase: 'cuánto hay de pan', mensaje: 'Si es una consulta, di «cuánto hay de pan».' }
  }
  if (tiene(['entrada', 'entradas', 'entraron', 'compre', 'llegaron'])) {
    return { grupo: 'preparar', frase: 'entraron 20 panes a 10 pesos', mensaje: 'Si es una entrada, di «entraron 20 panes a 10 pesos».' }
  }
  if (tiene(['vende', 'vender', 'dame', 'saca', 'llevo', 'quiero', 'pon', 'ponme'])) {
    return { grupo: 'vender', frase: 'vende dos panes', mensaje: 'Si es una venta, di «vende dos panes».' }
  }
  return null
}

/**
 * Cuerpo que consume el servicio nativo. Se inyecta en `assets/voz/dialogo.json`
 * al compilar, así que el APK nunca habla una ayuda distinta de la del panel.
 */
export function ayudaParaNativo() {
  const abierta = gruposDisponibles({})
  const cerrada = gruposDisponibles({ appCerrada: true })
  const trabajador = gruposDisponibles({ esTrabajador: true })
  return {
    grupos: GRUPOS_AYUDA.map(g => ({
      id: g.id,
      palabras: g.palabras,
      texto: textoDeGrupo(g),
      ejemplo: g.ejemplo
    })),
    menus: {
      jefe: { intro: introDeAyuda(abierta), pregunta: preguntaDeAyuda(abierta) },
      cerrada: { intro: introDeAyuda(cerrada), pregunta: preguntaDeAyuda(cerrada) },
      trabajador: { intro: introDeAyuda(trabajador), pregunta: preguntaDeAyuda(trabajador) }
    },
    // Qué grupos funcionan en cada contexto: el servicio no debe explicar
    // «entradas» si después va a contestar «abre la app».
    disponibles: {
      jefe: abierta.map(g => g.id),
      cerrada: cerrada.map(g => g.id),
      trabajador: trabajador.map(g => g.id)
    },
    todo: {
      jefe: todoDeAyuda(abierta),
      cerrada: todoDeAyuda(cerrada)
    }
  }
}
