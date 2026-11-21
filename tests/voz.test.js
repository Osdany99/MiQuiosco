import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  UMBRAL_PRODUCTO,
  combinarConfianza,
  decidirProducto,
  elegirAlternativa,
  extraerSlots,
  interpretar,
  normalizar,
  parseNumberSequence,
  parseNumberToken,
  preferirHintConTipo,
  resolverComando,
  resolverUbicacion
} from '../shared/voz/gramatica.js'
import { fonetizar, fuzzyMatchProducts, nombreCompleto } from '../app/utils/voice/fuzzyMatchProducts.js'
import { ubicacionActiva, esRutaInventario, evaluarDisparoVoz } from '../app/utils/voice/disparoVoz.js'
import { calcularMotivoNoDisponible } from '../app/utils/voice/disponibilidad.js'
import { ajustarCantidadVoz } from '../app/utils/voice/prefill.js'
import { mensajeStt } from '../app/utils/voice/stt.js'
import {
  formatearEntrada,
  formatearResumen,
  formatearTraza,
  fusionarTrazas,
  resumirTraza
} from '../app/utils/voice/diagnostico.js'
import { clasificarRespuesta, esAfirmacion, esNegacion } from '../app/utils/voice/confirmacion.js'
import { cabecerasDePrueba } from '../app/utils/voice/auditoria.js'
import { enmascarar } from '../shared/voz/privacidad.js'
import { describirCantidad, fraseVenta, fraseVentaMultiple, fraseStockInsuficiente } from '../app/utils/voice/frasesVoz.js'
import { formatearPrecio } from '../app/utils/voice/respuestasVoz.js'
import { MS_MARGEN_ANTIECO, esEcoDePrompt, ecoPalabraSuelta, respuestaTrasEco } from '../app/utils/voice/eco.js'
import { extraerCorreccion } from '../app/utils/voice/correccion.js'

describe('voz: normalización y números', () => {
  it('normaliza acentos, mayúsculas y puntuación', () => {
    assert.equal(normalizar('  Vende CINCO Panes, por favor. '), 'vende cinco panes por favor')
    assert.equal(normalizar('¿Cuánto hay de maní?'), 'cuanto hay de mani')
  })

  it('parsea dígitos, decimales y palabras', () => {
    assert.equal(parseNumberToken('5'), 5)
    assert.equal(parseNumberToken('1,5'), 1.5)
    assert.equal(parseNumberToken('2.5'), 2.5)
    assert.equal(parseNumberToken('Cinco'), 5)
    assert.equal(parseNumberToken('veinticinco'), 25)
    assert.equal(parseNumberToken('pan'), null)
  })

  it('parsea números compuestos por varios tokens', () => {
    assert.deepEqual(parseNumberSequence(['treinta', 'y', 'cinco', 'panes']), { valor: 35, consumidos: 3 })
    assert.deepEqual(parseNumberSequence(['ciento', 'veinte', 'panes']), { valor: 120, consumidos: 2 })
    assert.deepEqual(parseNumberSequence(['doscientos', 'cincuenta', 'y', 'cinco']), { valor: 255, consumidos: 4 })
    assert.deepEqual(parseNumberSequence(['una', 'pan']), { valor: 1, consumidos: 1 })
    assert.deepEqual(parseNumberSequence(['pan']), null)
  })
})

describe('voz: clasificación (fase A)', () => {
  const casos = [
    ['vende cinco panes', 'venta_directa'],
    ['vendeme 10 mani', 'venta_directa'],
    ['anota un pan', 'venta_directa'],
    ['registra dos refrescos', 'venta_directa'],
    ['cinco panes', 'venta_directa'],
    ['cuanto hay de pan', 'consulta_stock'],
    ['cuanto queda de refresco', 'consulta_stock'],
    ['cuanto cuesta el pan', 'consulta_precio'],
    ['a como esta el refresco', 'consulta_precio'],
    ['cuanto vale una cerveza', 'consulta_precio'],
    ['cuanto debe juan', 'consulta_deuda'],
    ['cuanto vendi hoy', 'consulta_dia'],
    ['repite', 'repetir'],
    ['que puedes hacer', 'ayuda'],
    ['abre cuadre', 'cuadre_accion'],
    ['se cogieron 3 panes para la casa', 'ajuste_inventario'],
    ['se cogieron los panes para la casa', 'ajuste_inventario'],
    ['hola', 'desconocido'],
    ['', 'desconocido']
  ]

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      assert.equal(resolverComando(texto).comando, esperado)
    })
  }

  it('un comando que no existe se interpreta como desconocido con slots vacíos', () => {
    const r = interpretar('hola')
    assert.equal(r.comando, 'desconocido')
    assert.deepEqual(r.slots, {})
  })

  it('una consulta deja slots propios, sin slots de venta', () => {
    const r = interpretar('cuanto hay de pan')
    assert.equal(r.comando, 'consulta_stock')
    assert.deepEqual(r.slots, { productoHint: 'pan', ubicacion: null })
  })

  it('el verbo manda sobre el resto', () => {
    assert.equal(resolverComando('vende el stock de pan').comando, 'venta_directa')
  })
})

describe('voz: precio, repetir y ayuda', () => {
  it('extrae producto y ubicación de una consulta de precio', () => {
    const r = interpretar('cuanto cuesta el pan del almacen')
    assert.equal(r.comando, 'consulta_precio')
    assert.deepEqual(r.slots, { productoHint: 'pan', ubicacion: 'almacen' })
  })

  it('un precio sin producto no inventa nada', () => {
    assert.equal(resolverComando('cuanto cuesta').comando, 'desconocido')
  })

  it('repetir no lleva slots y la ayuda solo lleva el tema', () => {
    assert.deepEqual(interpretar('repite').slots, {})
    assert.deepEqual(interpretar('que puedes hacer').slots, { tema: null })
    assert.deepEqual(interpretar('ayuda cobro').slots, { tema: 'cobrar' })
  })

  it('formatea precio vigente y stock, respetando la ubicación pedida', () => {
    const fila = {
      nombre: 'Pan',
      precioVentaActual: 20,
      quiosco: 12,
      almacen: 3,
      pendienteQuiosco: 0,
      pendienteAlmacen: 0
    }
    assert.equal(
      formatearPrecio(fila).habla,
      'Pan cuesta 20 pesos. En quiosco quedan 12. En almacén quedan 3.'
    )
    assert.equal(
      formatearPrecio(fila, { ubicacionPedida: 'almacen' }).habla,
      'Pan cuesta 20 pesos. En almacén quedan 3.'
    )
    assert.equal(
      formatearPrecio(fila, { ubicacionPedida: 'quiosco' }).descripcion,
      'Pan: 20 pesos · Quiosco: 12'
    )
  })

  it('sin permiso no revela precios ni stock', () => {
    const fila = { nombre: 'Pan', precioVentaActual: 20, quiosco: 12, almacen: 3 }
    assert.deepEqual(formatearPrecio(fila, { verQuiosco: false, verAlmacen: false }), { sinPermiso: true })
  })
})

describe('voz: slots (fase B)', () => {
  it('extrae cantidad, ubicación, precio y cliente', () => {
    const slots = extraerSlots('venta_directa', 'vende cinco panes en almacen a precio de diez a don juan')
    assert.equal(slots.cantidad, 5)
    assert.equal(slots.ubicacion, 'almacen')
    assert.equal(slots.precioUnitario, 10)
    assert.equal(slots.clienteHint, 'juan')
    assert.equal(slots.productoHint, 'panes')
    assert.equal(slots.tipoVenta, 'directa')
  })

  it('entiende singular, plural y artículos', () => {
    const slots = extraerSlots('venta_directa', 'vende un pan')
    assert.equal(slots.cantidad, 1)
    assert.equal(slots.productoHint, 'pan')
  })

  it('detecta el tipo de venta y lo quita del producto', () => {
    assert.equal(extraerSlots('venta_directa', 'vende un pan regalo').tipoVenta, 'regalo')
    assert.equal(extraerSlots('venta_directa', 'vende dos panes de la casa').tipoVenta, 'casa')
    assert.equal(extraerSlots('venta_directa', 'anota tres refrescos familiar').tipoVenta, 'familiar')
  })

  it('"kiosco" es quiosco y no deja basura en el producto', () => {
    const slots = extraerSlots('venta_directa', 'vende dos panes en kiosco')
    assert.equal(slots.ubicacion, 'quiosco')
    assert.equal(slots.productoHint, 'panes')
  })

  it('no confunde "para la casa" con un cliente', () => {
    const slots = extraerSlots('venta_directa', 'vende dos panes para la casa')
    assert.equal(slots.tipoVenta, 'casa')
    assert.equal(slots.clienteHint, null)
    assert.equal(slots.productoHint, 'panes')
  })

  it('detecta la ubicación aunque lleve artículo', () => {
    const enEl = extraerSlots('venta_directa', 'vende cinco panes en el quiosco')
    assert.equal(enEl.ubicacion, 'quiosco')
    assert.equal(enEl.productoHint, 'panes')

    const desdeEl = extraerSlots('venta_directa', 'vende cinco panes desde el almacen')
    assert.equal(desdeEl.ubicacion, 'almacen')
    assert.equal(desdeEl.productoHint, 'panes')
  })

  it('extrae números compuestos sin dejar restos en el producto', () => {
    const treintaYCinco = extraerSlots('venta_directa', 'vende treinta y cinco panes')
    assert.equal(treintaYCinco.cantidad, 35)
    assert.equal(treintaYCinco.productoHint, 'panes')

    const cientoVeinte = extraerSlots('venta_directa', 'vende ciento veinte refrescos')
    assert.equal(cientoVeinte.cantidad, 120)
    assert.equal(cientoVeinte.productoHint, 'refrescos')
  })

  it('reconoce clientes de varias palabras', () => {
    const para = extraerSlots('venta_directa', 'vende un pan para juan perez')
    assert.equal(para.clienteHint, 'juan perez')
    assert.equal(para.productoHint, 'pan')

    const don = extraerSlots('venta_directa', 'vende un pan a don juan perez')
    assert.equal(don.clienteHint, 'juan perez')
    assert.equal(don.productoHint, 'pan')
  })

  it('"para llevar" no se convierte en cliente ni contamina el producto', () => {
    const slots = extraerSlots('venta_directa', 'vende un pan para llevar')
    assert.equal(slots.clienteHint, null)
    assert.equal(slots.productoHint, 'pan')
  })
})

describe('voz: ubicación', () => {
  it('sin ubicación la venta sale del almacén, aunque estés en el quiosco', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: null }), { ubicacion: 'almacen' })
    assert.deepEqual(resolverUbicacion({}), { ubicacion: 'almacen' })
  })

  it('la ubicación dicha se respeta siempre', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: 'almacen' }), { ubicacion: 'almacen' })
    assert.deepEqual(resolverUbicacion({ ubicacion: 'quiosco' }), { ubicacion: 'quiosco' })
  })
})

describe('voz: confianza', () => {
  it('sin confianza del STT usa solo el fuzzy', () => {
    assert.equal(combinarConfianza(0.9, 0), 0.9)
    assert.equal(combinarConfianza(0.9, null), 0.9)
  })

  it('nunca infla el score del fuzzy', () => {
    assert.equal(combinarConfianza(0.9, 1), 0.9)
    assert.ok(combinarConfianza(0.9, 0.5) < 0.9)
  })

  it('un STT muy seguro no rescata un match malo (regresión)', () => {
    // 0.65*stt + 0.35*fuzzy habría dado 0.83 y habría precargado el producto.
    const decision = decidirProducto([{ score: 0.6 }], { sttConfidence: 0.95 })
    assert.equal(decision.elegido, null)
    assert.ok(decision.efectivo < UMBRAL_PRODUCTO)
  })

  it('precarga un match bueno y con margen', () => {
    const decision = decidirProducto([{ score: 0.95 }, { score: 0.4 }], { sttConfidence: 0 })
    assert.ok(decision.elegido)
  })

  it('con dos candidatos empatados pregunta en vez de elegir por orden', () => {
    const decision = decidirProducto([{ score: 0.8 }, { score: 0.8 }], { sttConfidence: 0 })
    assert.equal(decision.elegido, null)
    assert.equal(decision.ambiguo, true)
  })

  it('un match exacto gana aunque venga de un catálogo con parecidos', () => {
    const decision = decidirProducto([{ score: 1 }, { score: 0.9 }], { sttConfidence: 0 })
    assert.ok(decision.elegido)
  })
})

describe('voz: fuzzy de productos', () => {
  const catalogo = [
    { id: '1', name: 'Pan' },
    { id: '2', name: 'Pan de leche' },
    { id: '3', name: 'Refresco' },
    { id: '4', name: 'jkf' }
  ]

  it('el plural encuentra el singular', () => {
    const [mejor] = fuzzyMatchProducts('panes', catalogo)
    assert.equal(mejor.product.id, '1')
    assert.equal(mejor.score, 1)
  })

  it('el plural reconoce un nombre de varias palabras («panes» → «Pan de leche»)', () => {
    const soloCompuesto = [{ id: '9', name: 'Pan de leche' }, { id: '8', name: 'Refresco Cola' }]
    const [mejor] = fuzzyMatchProducts('panes', soloCompuesto)
    assert.equal(mejor.product.id, '9')
    assert.ok(mejor.score >= 0.75, `puntaje ${mejor.score}`)
  })

  it('respeta acentos y mayúsculas', () => {
    const [mejor] = fuzzyMatchProducts('REFRÉSCO', catalogo)
    assert.equal(mejor.product.id, '3')
  })

  it('un acrónimo mal transcrito sigue siendo candidato', () => {
    const [mejor] = fuzzyMatchProducts('jk', catalogo)
    assert.equal(mejor.product.id, '4')
    assert.ok(mejor.score >= 0.75)
  })

  it('"pan" prefiere el producto exacto, no el compuesto', () => {
    const [mejor] = fuzzyMatchProducts('pan', catalogo)
    assert.equal(mejor.product.id, '1')
    assert.equal(mejor.score, 1)
  })

  it('sin hint no hay candidatos', () => {
    assert.deepEqual(fuzzyMatchProducts('', catalogo), [])
    assert.deepEqual(fuzzyMatchProducts('zzzzzz', catalogo), [])
  })
})

describe('voz: fonética y descripción', () => {
  it('fonetizar colapsa variantes típicas', () => {
    assert.equal(fonetizar('Bebida'), fonetizar('Vebida'))
    assert.equal(fonetizar('pollo'), fonetizar('poyo'))
    assert.equal(fonetizar('Zapatos'), fonetizar('sapatos'))
  })

  it('desempata productos con mismo nombre por descripción', () => {
    const catalogo = [
      { id: '1', name: 'Refresco', description: 'Lata' },
      { id: '2', name: 'Refresco', description: 'Botella' }
    ]
    const results = fuzzyMatchProducts('refresco lata', catalogo)
    assert.equal(results[0].product.id, '1')
    assert.equal(results[0].matchField, 'description')
  })

  it('sin descripción sigue funcionando', () => {
    const catalogo = [{ id: '1', name: 'Pan' }]
    const [mejor] = fuzzyMatchProducts('pan', catalogo)
    assert.equal(mejor.product.id, '1')
    assert.equal(mejor.score, 1)
  })
})

describe('voz: auto-disparo y disponibilidad', () => {
  it('ubicacionActiva detecta almacén y solo dispara en inventario', () => {
    assert.equal(ubicacionActiva('/almacen'), 'almacen')
    assert.equal(ubicacionActiva('/quiosco'), 'quiosco')
    assert.equal(ubicacionActiva('/cuadre'), null)
    assert.equal(esRutaInventario('/quiosco'), true)
    assert.equal(esRutaInventario('/almacen/sub'), true)
    assert.equal(esRutaInventario('/deudas'), false)
  })

  it('solo dispara en la ubicación activa', () => {
    const r1 = evaluarDisparoVoz({
      query: '1', configLista: true, ubicacionActual: 'almacen',
      ubicacionInstancia: 'quiosco', consumido: null, disponible: true,
      motivo: null, clave: '/x'
    })
    assert.equal(r1.accion, 'none')

    const r2 = evaluarDisparoVoz({
      query: '1', configLista: true, ubicacionActual: 'almacen',
      ubicacionInstancia: 'almacen', consumido: null, disponible: true,
      motivo: null, clave: '/x'
    })
    assert.equal(r2.accion, 'disparar')
    assert.equal(r2.consumir, true)
  })

  it('no dispara dos veces la misma clave y respeta config no cargada', () => {
    const rWait = evaluarDisparoVoz({
      query: '1', configLista: false, ubicacionActual: 'quiosco',
      ubicacionInstancia: 'quiosco', consumido: null, disponible: false,
      motivo: null, clave: '/x'
    })
    assert.equal(rWait.accion, 'esperar')

    const rDup = evaluarDisparoVoz({
      query: '1', configLista: true, ubicacionActual: 'quiosco',
      ubicacionInstancia: 'quiosco', consumido: '/x', disponible: true,
      motivo: null, clave: '/x'
    })
    assert.equal(rDup.accion, 'none')
  })

  it('no dispara si no está disponible y emite motivo', () => {
    const r = evaluarDisparoVoz({
      query: '1', configLista: true, ubicacionActual: 'quiosco',
      ubicacionInstancia: 'quiosco', consumido: null, disponible: false,
      motivo: 'Sin conexión', clave: '/x'
    })
    assert.equal(r.accion, 'motivo')
    assert.equal(r.mensaje, 'Sin conexión')
  })

  it('calcula motivos de no disponibilidad', () => {
    assert.equal(calcularMotivoNoDisponible({
      configLista: false, tienePermiso: true, esNativo: false,
      webSoportado: true, nativoDisponible: null, permisoMicrofono: null,
      modo: 'online', hayRed: true
    }), 'Cargando…')

    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: false,
      webSoportado: false, nativoDisponible: null, permisoMicrofono: null,
      modo: 'online', hayRed: true
    }), 'La voz web requiere un navegador compatible (Chrome/Edge) en contexto seguro (HTTPS).')

    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: true,
      webSoportado: true, nativoDisponible: false, permisoMicrofono: true,
      modo: 'online', hayRed: true
    }), 'Este dispositivo no tiene reconocimiento de voz.')

    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: true,
      webSoportado: true, nativoDisponible: true, permisoMicrofono: false,
      modo: 'online', hayRed: true
    }), 'Falta el permiso de micrófono.')

    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: false,
      webSoportado: true, nativoDisponible: null, permisoMicrofono: null,
      modo: 'local', hayRed: true
    }), 'Modo local: la voz no está disponible.')

    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: false,
      webSoportado: true, nativoDisponible: null, permisoMicrofono: null,
      modo: 'online', hayRed: false
    }), 'Sin conexión: la voz no está disponible.')

    // Vosk trae su propio modelo/permiso: el check de Google no debe bloquearlo.
    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: true,
      webSoportado: true, nativoDisponible: false, permisoMicrofono: false,
      modo: 'online', hayRed: true, motor: 'vosk'
    }), null)

    assert.equal(calcularMotivoNoDisponible({
      configLista: true, tienePermiso: true, esNativo: true,
      webSoportado: true, nativoDisponible: false, permisoMicrofono: true,
      modo: 'online', hayRed: true, motor: 'google-offline'
    }), 'Este dispositivo no tiene reconocimiento de voz.')
  })
})

describe('voz: stt y prefill', () => {
  it('mapea errores STT', () => {
    assert.equal(mensajeStt('speech_timeout'), 'No se escuchó nada.')
    assert.equal(mensajeStt('timeout'), 'La escucha tardó demasiado.')
    assert.equal(mensajeStt('algo'), 'algo')
  })

  it('mapea errores de idioma y del servidor del reconocedor', () => {
    assert.match(mensajeStt('language_unavailable'), /español/i)
    assert.match(mensajeStt('language_unavailable'), /sin conexión/i)
    assert.match(mensajeStt('language_not_supported'), /español/i)
    assert.match(mensajeStt('too_many_requests'), /espera/i)
    assert.match(mensajeStt('server_disconnected'), /conexión/i)
    assert.match(mensajeStt('server_disconnected'), /offline/i)
  })

  it('ajusta cantidad por voz sin bloquear y avisa si excede', () => {
    assert.deepEqual(ajustarCantidadVoz(5, 10), { cantidad: 5, excede: false, disponible: 10 })
    assert.deepEqual(ajustarCantidadVoz(15, 10), { cantidad: 15, excede: true, disponible: 10 })
    assert.deepEqual(ajustarCantidadVoz(3, null), { cantidad: 3, excede: false, disponible: null })
  })
})

describe('voz: traza de diagnóstico', () => {
  const base = { t: new Date(2026, 0, 2, 12, 3, 41, 220).getTime() }

  it('formatea una entrada con hora, evento y campos', () => {
    const linea = formatearEntrada({ ...base, evento: 'stt.start', intento: 1, texto: 'vende dos refrescos' })
    assert.match(linea, /^\[12:03:41\.220\] stt\.start /)
    assert.match(linea, /intento=1/)
    assert.match(linea, /texto="vende dos refrescos"/)
  })

  it('omite t y evento de los campos y descarta entradas vacías', () => {
    const linea = formatearEntrada({ ...base, evento: 'stt.ready' })
    assert.equal(linea, '[12:03:41.220] stt.ready')
    assert.equal(formatearEntrada(null), '')
  })

  it('une la traza y resume intentos, resultados, errores y rescates', () => {
    const traza = [
      { ...base, evento: 'stt.start', variante: 'offline' },
      { ...base, evento: 'stt.error', code: 11 },
      { ...base, evento: 'stt.rescue', code: 11 },
      { ...base, evento: 'stt.start', variante: 'ondevice' },
      { ...base, evento: 'stt.result' }
    ]
    assert.equal(formatearTraza(traza).split('\n').length, 5)
    const resumen = resumirTraza(traza)
    assert.equal(resumen.intentos, 2)
    assert.equal(resumen.resultados, 1)
    assert.equal(resumen.errores, 1)
    assert.equal(resumen.rescates, 1)
    assert.equal(resumen.porCodigo['11'], 1)
    assert.equal(resumen.porVariante.offline, 1)
    assert.match(formatearResumen(resumen), /Intentos: 2/)
    assert.match(formatearResumen(resumen), /Rescates: 1/)
  })

  it('sin actividad devuelve un resumen neutro', () => {
    assert.equal(formatearResumen(resumirTraza([])), 'Sin actividad de voz registrada.')
  })

  it('fusiona trazas sin duplicar y las ordena por tiempo', () => {
    const js = [
      { t: 300, evento: 'stt.listo', inst: 's1' },
      { t: 100, evento: 'stt.begin', inst: 's1' }
    ]
    const nativo = [
      { t: 100, evento: 'stt.start', inst: 'native' },
      { t: 200, evento: 'stt.ready', inst: 'native' },
      { t: 200, evento: 'stt.ready', inst: 'native' }
    ]
    const unida = fusionarTrazas(js, nativo, 100)
    assert.deepEqual(unida.map(e => e.evento), ['stt.begin', 'stt.start', 'stt.ready', 'stt.listo'])
  })

  it('fusionar respeta el máximo y descarta entradas inválidas', () => {
    const traza = Array.from({ length: 10 }, (_, i) => ({ t: i, evento: 'stt.partial', inst: 'n' }))
    const unida = fusionarTrazas([], [...traza, null, { t: 1 }], 3)
    assert.equal(unida.length, 3)
    assert.deepEqual(unida.map(e => e.t), [7, 8, 9])
  })
})

describe('voz: verbos débiles ("dame", "ponme")', () => {
  it('"dame cinco panes" es una venta con cantidad y producto bien separados', () => {
    assert.equal(resolverComando('dame cinco panes').comando, 'venta_directa')
    const slots = interpretar('dame cinco panes').slots
    assert.equal(slots.cantidad, 5)
    assert.equal(slots.productoHint, 'panes')
  })

  it('"ponme dos refrescos" también', () => {
    const slots = interpretar('ponme dos refrescos').slots
    assert.equal(slots.cantidad, 2)
    assert.equal(slots.productoHint, 'refrescos')
  })

  it('"despacha tres panes" y "vendele un pan" son ventas', () => {
    assert.equal(resolverComando('despacha tres panes').comando, 'venta_directa')
    assert.equal(resolverComando('vendele un pan').comando, 'venta_directa')
  })

  it('"pon" ya no es verbo de venta: cambia la tarifa', () => {
    // Decisión del dueño: no se vende con "pon".
    assert.equal(resolverComando('pon el refresco a 60').comando, 'cambio_precio')
    assert.equal(resolverComando('pon la azúcar a 580').comando, 'cambio_precio')
    assert.equal(resolverComando('ponle el refresco a 60').comando, 'cambio_precio')
  })

  it('"pon" con cantidad suelta sigue cayendo en venta por cantidad y producto', () => {
    assert.equal(resolverComando('pon 2 panes').comando, 'venta_directa')
  })

  it('"pon" no roba otras familias', () => {
    assert.equal(resolverComando('pon el refresco debajo del pan').comando, 'mover_producto')
    assert.equal(resolverComando('pon el agua al principio').comando, 'mover_producto')
    assert.equal(resolverComando('sube 4 manís al quiosco').comando, 'traspaso')
    assert.equal(resolverComando('vende 2 azúcares a 580').comando, 'venta_directa')
  })

  it('un verbo débil no convierte consultas ni navegación en ventas', () => {
    assert.notEqual(resolverComando('dame cuanto hay de pan').comando, 'venta_directa')
    assert.notEqual(resolverComando('dame el inventario').comando, 'venta_directa')
    assert.equal(resolverComando('dame').comando, 'desconocido')
  })
})

describe('voz: precio vs cliente', () => {
  it('"a diez" al final es precio, no cliente', () => {
    const slots = extraerSlots('venta_directa', 'vende cinco panes a diez')
    assert.equal(slots.precioUnitario, 10)
    assert.equal(slots.clienteHint, null)
    assert.equal(slots.productoHint, 'panes')
    assert.equal(slots.cantidad, 5)
  })

  it('"a 10 pesos" es precio y no ensucia el producto', () => {
    const slots = extraerSlots('venta_directa', 'vende cinco panes a 10 pesos')
    assert.equal(slots.precioUnitario, 10)
    assert.equal(slots.productoHint, 'panes')
  })

  it('el precio se entiende aunque el STT se coma «pesos»', () => {
    // «a 200 a Juan»: el cliente cierra la frase y el precio queda antes.
    const slots = extraerSlots('venta_directa', 'vende 1 refresco del quiosco a 200 a adrian')
    assert.equal(slots.precioUnitario, 200)
    assert.equal(slots.clienteHint, 'adrian')
    assert.equal(slots.productoHint, 'refresco')
  })

  it('el precio también se entiende cuando el cliente va antes', () => {
    const slots = extraerSlots('venta_directa', 'vende 2 panes a juan a 15')
    assert.equal(slots.precioUnitario, 15)
    assert.equal(slots.clienteHint, 'juan')
    assert.equal(slots.productoHint, 'panes')
  })

  it('"a diez cada uno" y "a precio de treinta y cinco"', () => {
    const cadaUno = extraerSlots('venta_directa', 'vende dos panes a diez cada uno')
    assert.equal(cadaUno.precioUnitario, 10)
    assert.equal(cadaUno.productoHint, 'panes')

    const compuesto = extraerSlots('venta_directa', 'vende un pan a precio de treinta y cinco')
    assert.equal(compuesto.precioUnitario, 35)
    assert.equal(compuesto.productoHint, 'pan')
  })

  it('precio y cliente a la vez', () => {
    const slots = extraerSlots('venta_directa', 'vende un pan a 10 pesos a don juan')
    assert.equal(slots.precioUnitario, 10)
    assert.equal(slots.clienteHint, 'juan')
    assert.equal(slots.productoHint, 'pan')
  })

  it('un nombre sigue siendo cliente y un número de personas no es precio', () => {
    const cliente = extraerSlots('venta_directa', 'vende un pan a juan')
    assert.equal(cliente.clienteHint, 'juan')
    assert.equal(cliente.precioUnitario, null)

    const personas = extraerSlots('venta_directa', 'vende un pan a 3 amigos')
    assert.equal(personas.precioUnitario, null)

    const articulo = extraerSlots('venta_directa', 'vende un pan a una')
    assert.equal(articulo.precioUnitario, null)
  })

  it('"a precio de oferta" (no es número) no rompe nada', () => {
    const slots = extraerSlots('venta_directa', 'vende un pan a precio de oferta')
    assert.equal(slots.precioUnitario, null)
  })
})

describe('voz: tipo de venta vs nombre del producto', () => {
  it('"refresco familiar" ofrece las dos lecturas', () => {
    const slots = extraerSlots('venta_directa', 'vende un refresco familiar')
    assert.equal(slots.tipoVenta, 'familiar')
    assert.equal(slots.productoHint, 'refresco')
    assert.deepEqual(slots.alternativaTipo, { productoHint: 'refresco familiar', tipoVenta: 'directa' })
  })

  it('con preposición no hay ambigüedad', () => {
    const regalo = extraerSlots('venta_directa', 'vende un pan de regalo')
    assert.equal(regalo.tipoVenta, 'regalo')
    assert.equal(regalo.productoHint, 'pan')
    assert.equal(regalo.alternativaTipo, undefined)

    const casa = extraerSlots('venta_directa', 'vende dos panes de la casa')
    assert.equal(casa.tipoVenta, 'casa')
    assert.equal(casa.alternativaTipo, undefined)
  })

  it('sin palabra de tipo no hay alternativa', () => {
    assert.equal(extraerSlots('venta_directa', 'vende cinco panes').alternativaTipo, undefined)
  })

  it('"normal" se descarta pero se conserva en la alternativa', () => {
    const slots = extraerSlots('venta_directa', 'vende una malta normal')
    assert.equal(slots.productoHint, 'malta')
    assert.equal(slots.alternativaTipo.productoHint, 'malta normal')
  })

  it('solo un match exacto prefiere la lectura con el tipo incluido', () => {
    assert.equal(preferirHintConTipo([{ score: 1 }]), true)
    assert.equal(preferirHintConTipo([{ score: 0.88 }]), false)
    assert.equal(preferirHintConTipo([]), false)
    assert.equal(preferirHintConTipo(undefined), false)
  })

  it('el catálogo decide: existe "Refresco familiar" vs no existe', () => {
    const slots = extraerSlots('venta_directa', 'vende un refresco familiar')

    const conProducto = [{ id: '1', name: 'Refresco' }, { id: '2', name: 'Refresco familiar' }]
    assert.equal(preferirHintConTipo(fuzzyMatchProducts(slots.alternativaTipo.productoHint, conProducto)), true)

    const sinProducto = [{ id: '1', name: 'Refresco' }]
    assert.equal(preferirHintConTipo(fuzzyMatchProducts(slots.alternativaTipo.productoHint, sinProducto)), false)
  })
})

describe('voz: números (veintiún, miles, docenas)', () => {
  it('veintiún / veintiuna', () => {
    assert.equal(extraerSlots('venta_directa', 'vende veintiun panes').cantidad, 21)
    assert.equal(extraerSlots('venta_directa', 'vende veintiuna sodas').cantidad, 21)
  })

  it('miles', () => {
    assert.deepEqual(parseNumberSequence(['mil']), { valor: 1000, consumidos: 1 })
    assert.deepEqual(parseNumberSequence(['dos', 'mil']), { valor: 2000, consumidos: 2 })
    assert.deepEqual(parseNumberSequence(['mil', 'quinientos']), { valor: 1500, consumidos: 2 })
    assert.deepEqual(parseNumberSequence(['dos', 'mil', 'quinientos', 'pesos']), { valor: 2500, consumidos: 3 })
    assert.deepEqual(parseNumberSequence(['3', 'mil']), { valor: 3000, consumidos: 2 })
  })

  it('docenas', () => {
    const una = extraerSlots('venta_directa', 'vende una docena de huevos')
    assert.equal(una.cantidad, 12)
    assert.equal(una.productoHint, 'huevos')

    const dos = extraerSlots('venta_directa', 'vende dos docenas de huevos')
    assert.equal(dos.cantidad, 24)

    const media = extraerSlots('venta_directa', 'vende media docena de huevos')
    assert.equal(media.cantidad, 6)
    assert.equal(media.productoHint, 'huevos')

    const sola = extraerSlots('venta_directa', 'vende docena de huevos')
    assert.equal(sola.cantidad, 12)
  })

  it('palabras como "constructor" no se toman por números', () => {
    assert.equal(parseNumberSequence(['constructor']), null)
    assert.equal(parseNumberToken('constructor'), null)
  })
})

describe('voz: la descripción no supera al nombre', () => {
  it('un producto cuya descripción menciona la palabra no gana a uno que se llama así', () => {
    const catalogo = [
      { id: 'hielo', name: 'Hielo', description: 'bolsa para refresco' },
      { id: 'cola', name: 'Refresco Cola', description: 'lata 355ml' }
    ]
    const resultados = fuzzyMatchProducts('refresco', catalogo)
    assert.equal(resultados[0].product.id, 'cola')
    const hielo = resultados.find(r => r.product.id === 'hielo')
    assert.ok(!hielo || hielo.score < UMBRAL_PRODUCTO)
  })

  it('el desempate por descripción sigue funcionando cuando el nombre coincide', () => {
    const catalogo = [
      { id: '1', name: 'Refresco', description: 'Lata' },
      { id: '2', name: 'Refresco', description: 'Botella' }
    ]
    const [mejor, segundo] = fuzzyMatchProducts('refresco lata', catalogo)
    assert.equal(mejor.product.id, '1')
    assert.ok(mejor.score > segundo.score)
  })

  it('la descripción identifica entre productos del mismo nombre («maní molido»)', () => {
    const catalogo = [
      { id: 'cocido', name: 'Maní', description: 'cocinado' },
      { id: 'molido', name: 'Maní', description: 'molido' },
      { id: 'garapinado', name: 'Maní', description: 'garapiñado' }
    ]
    const resultados = fuzzyMatchProducts('mani molido', catalogo)
    assert.equal(resultados[0].product.id, 'molido')
    assert.ok(resultados[0].score >= UMBRAL_PRODUCTO, `puntaje ${resultados[0].score}`)
    // Los demás conservan el puntaje del nombre a secas; el margen es lo que
    // permite elegir sin preguntar (decidirProducto exige 0.1).
    assert.ok(resultados[0].score - resultados[1].score >= 0.1)
  })
})

describe('voz: la identidad es nombre + descripción', () => {
  // El caso real: tres productos llamados «Maní». Decir solo «maní» no puede
  // elegir uno al azar (antes ganaba el primero del catálogo y, si no tenía
  // stock, la venta fallaba aunque hubiera otros).
  const manies = [
    { id: 'cocido', name: 'Maní', description: 'cocinado' },
    { id: 'molido', name: 'Maní', description: 'molido' },
    { id: 'garapinado', name: 'Maní', description: 'garapiñado' }
  ]

  const decidir = (hint, sttConfidence = 0.8) => decidirProducto(
    fuzzyMatchProducts(hint, manies),
    { umbral: UMBRAL_PRODUCTO, sttConfidence }
  )

  it('nombreCompleto une nombre y descripción sin repetir', () => {
    assert.equal(nombreCompleto('Maní', 'molido'), 'Maní molido')
    assert.equal(nombreCompleto('Pan de leche', 'leche'), 'Pan de leche')
    assert.equal(nombreCompleto('Pan', null), 'Pan')
    assert.equal(nombreCompleto('Pan', '  '), 'Pan')
  })

  it('decir solo el nombre deja los tres empatados', () => {
    const resultados = fuzzyMatchProducts('mani', manies)
    assert.equal(resultados.length, 3)
    assert.ok(resultados.every(r => r.score === resultados[0].score), 'no hay ganador por nombre')
  })

  it('decir solo el nombre pregunta en vez de elegir por orden del catálogo', () => {
    for (const stt of [0, 0.2, 0.8]) {
      const decision = decidir('mani', stt)
      assert.equal(decision.elegido, null, `con stt ${stt} eligió sin preguntar`)
      assert.equal(decision.ambiguo, true)
    }
  })

  it('el plural tampoco elige a ciegas', () => {
    assert.equal(decidir('manis').elegido, null)
    assert.equal(decidir('vende dos manis').elegido, null)
  })

  it('nombrar la descripción elige con margen y sin depender del STT', () => {
    for (const stt of [0.2, 0.8]) {
      assert.equal(decidir('mani molido', stt).elegido?.product.id, 'molido')
      assert.equal(decidir('mani cocinado', stt).elegido?.product.id, 'cocido')
      assert.equal(decidir('mani garapiñado', stt).elegido?.product.id, 'garapinado')
    }
  })

  it('el plural de la descripción también identifica', () => {
    assert.equal(decidir('mani molidos').elegido?.product.id, 'molido')
    assert.equal(decidir('manies cocinados').elegido?.product.id, 'cocido')
  })

  it('con un solo producto de ese nombre resuelve sin preguntar', () => {
    const solo = [{ id: 'unico', name: 'Maní', description: 'molido' }]
    const decision = decidirProducto(
      fuzzyMatchProducts('mani', solo),
      { umbral: UMBRAL_PRODUCTO, sttConfidence: 0.8 }
    )
    assert.equal(decision.elegido?.product.id, 'unico')
  })

  it('dos productos con identidad idéntica siguen empatando', () => {
    // Duplicados reales del catálogo: solo preguntando se puede distinguir.
    const duplicados = [
      { id: 'a', name: 'Maní', description: 'molido' },
      { id: 'b', name: 'Maní', description: 'molido' }
    ]
    const decision = decidirProducto(
      fuzzyMatchProducts('mani molido', duplicados),
      { umbral: UMBRAL_PRODUCTO, sttConfidence: 0.8 }
    )
    assert.equal(decision.elegido, null)
    assert.equal(decision.ambiguo, true)
  })

  it('la descripción de uno no le gana al nombre de otro producto', () => {
    // «Pan» con descripción «leche» no es «Pan de leche»: si la identidad se
    // aplicara a nombres únicos, la descripción podría suplantar al producto
    // que de verdad se llama así.
    const catalogo = [
      { id: 'pan', name: 'Pan', description: 'leche' },
      { id: 'pdl', name: 'Pan de leche' }
    ]
    const [mejor] = fuzzyMatchProducts('pan de leche', catalogo)
    assert.equal(mejor.product.id, 'pdl')
    // Y sin la preposición, el empate se pregunta en vez de adivinar.
    assert.equal(
      decidirProducto(
        fuzzyMatchProducts('pan leche', catalogo),
        { umbral: UMBRAL_PRODUCTO, sttConfidence: 0 }
      ).elegido,
      null
    )
  })

  it('la identidad no rompe cuando el producto no tiene descripción', () => {
    const catalogo = [{ id: '1', name: 'Refresco' }, { id: '2', name: 'Hielo', description: 'bolsa' }]
    const [mejor] = fuzzyMatchProducts('refresco', catalogo)
    assert.equal(mejor.product.id, '1')
  })
})

describe('voz: privacidad / enmascarado', () => {
  it('oculta cantidad, producto y cliente', () => {
    const sets = { palabrasProducto: new Set(['pan', 'panes']), palabrasCliente: new Set(['juan', 'perez']) }
    assert.equal(enmascarar('apunta tres panes a juan perez', sets), 'apunta <n> <producto> a <cliente>')
  })
  it('conserva el vocabulario nuevo', () => {
    assert.equal(enmascarar('llevame a recargas', {}), 'llevame a recargas')
  })
  it('trunca a 120 caracteres', () => {
    const texto = 'uno '.repeat(50)
    const r = enmascarar(texto, {})
    assert.ok(r.length <= 120)
  })
  it('colapsa placeholders consecutivos', () => {
    const sets = { palabrasProducto: new Set(['pan', 'panes']) }
    assert.equal(enmascarar('vende pan panes', sets), 'vende <producto>')
  })
})

describe('voz: N-best (elegirAlternativa)', () => {
  it('base clara gana', () => {
    const items = [
      { indice: 0, comando: 'venta_directa', elegido: true, efectivo: 0.9, encontrados: 1 },
      { indice: 1, comando: 'venta_directa', elegido: true, efectivo: 0.95, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 0)
  })
  it('base desconocido elige alternativa clara', () => {
    const items = [
      { indice: 0, comando: 'desconocido', elegido: false, efectivo: 0, encontrados: 0 },
      { indice: 2, comando: 'consulta_stock', elegido: true, efectivo: 0.9, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 2)
  })
  it('base ambigua + alternativa clara por margen', () => {
    const items = [
      { indice: 0, comando: 'venta_directa', elegido: false, ambiguo: true, efectivo: 0.7, encontrados: 2 },
      { indice: 1, comando: 'venta_directa', elegido: true, efectivo: 0.9, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 1)
  })
  it('sin margen suficiente conserva base', () => {
    const items = [
      { indice: 0, comando: 'venta_directa', elegido: false, efectivo: 0.7, encontrados: 2 },
      { indice: 1, comando: 'venta_directa', elegido: true, efectivo: 0.75, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 0)
  })
  it('base con 0 encontrados elige alternativa clara', () => {
    const items = [
      { indice: 0, comando: 'venta_directa', elegido: false, efectivo: 0, encontrados: 0 },
      { indice: 1, comando: 'venta_directa', elegido: true, efectivo: 0.8, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 1)
  })
  it('comando distinto no supera', () => {
    const items = [
      { indice: 0, comando: 'venta_directa', elegido: false, efectivo: 0.7, encontrados: 2 },
      { indice: 1, comando: 'consulta_stock', elegido: true, efectivo: 0.9, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 0)
  })
  it('base navegacion gana', () => {
    const items = [
      { indice: 0, comando: 'navegacion', elegido: true, efectivo: 0, encontrados: 0 },
      { indice: 1, comando: 'venta_directa', elegido: true, efectivo: 0.9, encontrados: 1 }
    ]
    assert.equal(elegirAlternativa(items), 0)
  })
  it('todas desconocido', () => {
    const items = [
      { indice: 0, comando: 'desconocido', elegido: false, efectivo: 0, encontrados: 0 },
      { indice: 1, comando: 'desconocido', elegido: false, efectivo: 0, encontrados: 0 }
    ]
    assert.equal(elegirAlternativa(items), 0)
  })
})

describe('voz: confirmación hablada', () => {
  it('acepta afirmaciones claras', () => {
    for (const texto of ['sí', 'Sí, por favor', 'claro', 'vale', 'ok', 'dale', 'adelante', 'confirmo', 'si señor', 'sí sí', 'si claro']) {
      assert.equal(esAfirmacion(texto), true, texto)
    }
  })

  it('rechaza afirmaciones ambiguas o incompletas', () => {
    for (const texto of ['sí pero no', 'si tengo', 'sí, mañana', 'sí pero', 'sí luego', '']) {
      assert.equal(esAfirmacion(texto), false, texto)
    }
  })

  it('detecta negaciones claras', () => {
    for (const texto of ['no', 'no, gracias', 'no por favor', 'cancela', 'espera', 'no, espera', 'mejor no', 'para']) {
      assert.equal(esNegacion(texto), true, texto)
    }
  })

  it('no confunde otras frases con una negación', () => {
    for (const texto of ['no sé', 'no hay', 'sí']) {
      assert.equal(esNegacion(texto), false, texto)
    }
  })
})

describe('voz: clasificación de respuesta hablada', () => {
  it('clasifica afirmaciones y negaciones', () => {
    assert.equal(clasificarRespuesta('sí'), 'afirmado')
    assert.equal(clasificarRespuesta('vale'), 'afirmado')
    assert.equal(clasificarRespuesta('no, gracias'), 'negado')
    assert.equal(clasificarRespuesta('cancela'), 'negado')
  })

  it('separa vacío de otras frases', () => {
    assert.equal(clasificarRespuesta(''), 'vacio')
    assert.equal(clasificarRespuesta('   '), 'vacio')
    assert.equal(clasificarRespuesta('sí pero no'), 'otro')
    assert.equal(clasificarRespuesta('mañana'), 'otro')
  })

  it('tolera el relleno habitual del STT', () => {
    assert.equal(clasificarRespuesta('sí señor'), 'afirmado')
    assert.equal(clasificarRespuesta('sí, está bien'), 'afirmado')
    assert.equal(clasificarRespuesta('dale pues'), 'afirmado')
    assert.equal(clasificarRespuesta('por supuesto'), 'afirmado')
    assert.equal(clasificarRespuesta('no señor'), 'negado')
    assert.equal(clasificarRespuesta('no, así no'), 'negado')
    assert.equal(clasificarRespuesta('esperate'), 'negado')
    assert.equal(clasificarRespuesta('no, sí'), 'otro')
  })
})

describe('voz: cabeceras de auditoría', () => {
  it('añade Authorization solo si hay token', () => {
    assert.deepEqual(cabecerasDePrueba('abc'), { Authorization: 'Bearer abc' })
  })

  it('sin token no envía cabecera de autenticación', () => {
    assert.deepEqual(cabecerasDePrueba(null), {})
    assert.deepEqual(cabecerasDePrueba(''), {})
  })
})

describe('voz: frases habladas (concordancia)', () => {
  it('una unidad se dice con artículo, no como "uno pan"', () => {
    assert.equal(fraseVenta({ cantidad: 1, nombre: 'Pan', lugar: 'quiosco' }), 'Voy a vender un Pan del quiosco.')
    assert.equal(fraseVenta({ cantidad: 1, nombre: 'Cerveza', lugar: 'quiosco' }), 'Voy a vender una Cerveza del quiosco.')
    assert.equal(fraseVenta({ cantidad: 1, nombre: 'Leche', lugar: 'almacén' }), 'Voy a vender una Leche del almacén.')
  })

  it('nombra al cliente cuando la venta lo lleva', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Pan', lugar: 'almacén', importe: 20, cliente: 'Juan' }),
      'Voy a vender 2 unidades de Pan del almacén a Juan por 20 pesos.'
    )
  })

  it('varias unidades no dependen de pluralizar el nombre', () => {
    assert.equal(describirCantidad(2, 'Pan'), '2 unidades de Pan')
    assert.equal(describirCantidad(12, 'Cerveza Cristal'), '12 unidades de Cerveza Cristal')
  })

  it('si no se puede decidir el género, usa "una unidad de"', () => {
    assert.equal(describirCantidad(1, 'Galletas María'), 'una unidad de Galletas María')
  })

  it('cantidad inválida cae en la confirmación genérica', () => {
    assert.equal(fraseVenta({ cantidad: 0, nombre: 'Pan', lugar: 'quiosco' }), 'Confirma la venta del quiosco.')
  })

  it('el read-back incluye el importe cuando se conoce', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Pan', lugar: 'quiosco', importe: 20 }),
      'Voy a vender 2 unidades de Pan del quiosco por 20 pesos.'
    )
    assert.equal(
      fraseVenta({ cantidad: 3, nombre: 'Pan', lugar: 'almacén', importe: 37.5 }),
      'Voy a vender 3 unidades de Pan del almacén por 37,50 pesos.'
    )
    // Sin importe se mantiene la frase de siempre.
    assert.equal(fraseVenta({ cantidad: 2, nombre: 'Pan', lugar: 'quiosco' }), 'Voy a vender 2 unidades de Pan del quiosco.')
  })

  it('el read-back dice el tipo cuando no es una venta directa', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Pan', lugar: 'almacén', tipo: 'familiar', importe: 20 }),
      'Voy a vender 2 unidades de Pan del almacén por 20 pesos. Venta familiar.'
    )
    assert.equal(
      fraseVenta({ cantidad: 1, nombre: 'Pan', lugar: 'quiosco', tipo: 'casa', importe: 6 }),
      'Voy a vender un Pan del quiosco por 6 pesos. Venta de casa.'
    )
    assert.equal(
      fraseVenta({ cantidad: 1, nombre: 'Pan', lugar: 'quiosco', tipo: 'regalo' }),
      'Voy a vender un Pan del quiosco. Regalo.'
    )
  })

  it('avisa del stock sin decir "1 de pan"', () => {
    assert.equal(fraseStockInsuficiente({ disponible: 1, nombre: 'Pan', lugar: 'quiosco' }), 'Solo hay una unidad de Pan en el quiosco.')
    assert.equal(fraseStockInsuficiente({ disponible: 3, nombre: 'Pan', lugar: 'quiosco' }), 'Solo hay 3 unidades de Pan en el quiosco.')
    assert.equal(fraseStockInsuficiente({ disponible: 0, nombre: 'Pan', lugar: 'almacén' }), 'No hay Pan en el almacén.')
  })
})

describe('voz: la lectura dice la descripción', () => {
  // Con varios productos del mismo nombre, la lectura es la última red antes de
  // descontar: si no dice cuál, el jefe confirma a ciegas.
  it('la venta nombra la descripción', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Maní', descripcion: 'molido', lugar: 'almacén' }),
      'Voy a vender 2 unidades de Maní molido del almacén.'
    )
  })

  it('sin colisión de nombre también la dice (decisión del negocio)', () => {
    assert.equal(
      fraseVenta({ cantidad: 1, nombre: 'Pan', descripcion: 'de leche', lugar: 'quiosco' }),
      'Voy a vender un Pan de leche del quiosco.'
    )
  })

  it('sin descripción no añade nada', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Pan', lugar: 'almacén' }),
      'Voy a vender 2 unidades de Pan del almacén.'
    )
  })

  it('no repite la descripción si el nombre ya la contiene', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Pan de leche', descripcion: 'leche', lugar: 'almacén' }),
      'Voy a vender 2 unidades de Pan de leche del almacén.'
    )
  })

  it('el stock insuficiente nombra la descripción', () => {
    assert.equal(
      fraseStockInsuficiente({ disponible: 3, nombre: 'Maní', descripcion: 'molido', lugar: 'quiosco' }),
      'Solo hay 3 unidades de Maní molido en el quiosco.'
    )
  })

  it('la venta de varias líneas nombra la descripción de cada una', () => {
    assert.equal(
      fraseVentaMultiple({
        lineas: [
          { cantidad: 2, nombre: 'Maní', descripcion: 'molido' },
          { cantidad: 1, nombre: 'Pan', descripcion: 'de leche' }
        ],
        lugar: 'almacén'
      }),
      'Voy a vender 2 unidades de Maní molido y un Pan de leche del almacén.'
    )
  })

  it('la venta familiar con descripción dice producto y tipo', () => {
    assert.equal(
      fraseVenta({ cantidad: 2, nombre: 'Paleta', descripcion: 'grande', lugar: 'almacén', tipo: 'familiar', importe: 20 }),
      'Voy a vender 2 unidades de Paleta grande del almacén por 20 pesos. Venta familiar.'
    )
  })
})

describe('voz: corrección de cantidad en la confirmación', () => {
  it('entiende las frases de corrección habituales', () => {
    assert.deepEqual(extraerCorreccion('no, eran tres'), { cantidad: 3 })
    assert.deepEqual(extraerCorreccion('eran cinco'), { cantidad: 5 })
    assert.deepEqual(extraerCorreccion('cambia a cuatro'), { cantidad: 4 })
    assert.deepEqual(extraerCorreccion('son seis'), { cantidad: 6 })
    assert.deepEqual(extraerCorreccion('pon una docena'), { cantidad: 12 })
    assert.deepEqual(extraerCorreccion('mejor dos'), { cantidad: 2 })
    assert.deepEqual(extraerCorreccion('no, eran 15'), { cantidad: 15 })
  })

  it('no confunde un sí/no normal con una corrección', () => {
    assert.equal(extraerCorreccion('sí'), null)
    assert.equal(extraerCorreccion('no'), null)
    assert.equal(extraerCorreccion('no gracias'), null)
    assert.equal(extraerCorreccion('sí por favor'), null)
    assert.equal(extraerCorreccion('vende dos panes'), null)
    assert.equal(extraerCorreccion(''), null)
  })

  it('rechaza cantidades imposibles', () => {
    assert.equal(extraerCorreccion('no, eran cero'), null)
    assert.equal(extraerCorreccion('no, eran 10000'), null)
  })
})

describe('voz: antieco del TTS', () => {
  const PROMPT = 'Voy a vender 2 unidades de Pan del quiosco por 20 pesos. Diga sí para confirmar.'

  it('descarta el eco del propio read-back', () => {
    assert.equal(esEcoDePrompt('voy a vender dos unidades de pan del quiosco', PROMPT), true)
    assert.equal(esEcoDePrompt('diga sí para confirmar', PROMPT), true)
  })

  it('no descarta una respuesta real', () => {
    assert.equal(esEcoDePrompt('sí', PROMPT), false)
    assert.equal(esEcoDePrompt('no', PROMPT), false)
    assert.equal(esEcoDePrompt('vende dos refrescos', PROMPT), false)
  })

  it('sin texto no hay eco', () => {
    assert.equal(esEcoDePrompt('', PROMPT), false)
    assert.equal(esEcoDePrompt(null, PROMPT), false)
  })

  it('el margen antieco es de 400 ms', () => {
    assert.equal(MS_MARGEN_ANTIECO, 400)
  })

  it('detecta la palabra suelta que ya estaba en el anuncio', () => {
    // Caso real: el micrófono oye solo el «sí» de «diga sí para confirmar» y
    // se tomaba como confirmación del jefe.
    assert.equal(ecoPalabraSuelta('sí', PROMPT), true)
    assert.equal(ecoPalabraSuelta('confirmar', PROMPT), true)
    assert.equal(ecoPalabraSuelta('sí, confirma', PROMPT), false)
    assert.equal(ecoPalabraSuelta('dale', PROMPT), false)
    assert.equal(ecoPalabraSuelta('', PROMPT), false)
  })

  it('rescata la respuesta dicha pegada al anuncio', () => {
    // El motor devuelve el final del TTS y, a continuación, el «sí» del jefe.
    assert.equal(respuestaTrasEco('diga sí para confirmar sí', PROMPT), 'si')
    assert.equal(respuestaTrasEco('diga sí para confirmar no', PROMPT), 'no')
    // Una respuesta corta no se recorta: es justo lo que se espera.
    assert.equal(respuestaTrasEco('sí', PROMPT), '')
    // Solo eco: no queda nada que leer como respuesta.
    assert.equal(respuestaTrasEco('diga sí para confirmar', PROMPT), '')
  })
})
