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
import { fonetizar, fuzzyMatchProducts } from '../app/utils/voice/fuzzyMatchProducts.js'
import { ubicacionActiva, esRutaInventario, evaluarDisparoVoz } from '../app/utils/voice/disparoVoz.js'
import { calcularMotivoNoDisponible } from '../app/utils/voice/disponibilidad.js'
import { ajustarCantidadVoz } from '../app/utils/voice/prefill.js'
import { mensajeStt } from '../app/utils/voice/stt.js'
import { esAfirmacion, esNegacion } from '../app/utils/voice/confirmacion.js'
import { enmascarar } from '../shared/voz/privacidad.js'

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
    ['abre cuadre', 'navegacion'],
    ['ir a deudas', 'navegacion'],
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
  it('sin ubicación usa la de la vista', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: null }, 'quiosco'), { ubicacion: 'quiosco', conflicto: false })
  })

  it('la misma ubicación no es conflicto', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: 'almacen' }, 'almacen'), { ubicacion: 'almacen', conflicto: false })
  })

  it('una ubicación distinta es conflicto (nunca vender en silencio)', () => {
    assert.deepEqual(resolverUbicacion({ ubicacion: 'almacen' }, 'quiosco'), { ubicacion: 'almacen', conflicto: true })
  })

  it('fuera de inventario se respeta la ubicación dicha sin conflicto', () => {
    assert.deepEqual(
      resolverUbicacion({ ubicacion: 'almacen' }, 'quiosco', { permitirConflicto: false }),
      { ubicacion: 'almacen', conflicto: false }
    )
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
  })
})

describe('voz: stt y prefill', () => {
  it('mapea errores STT', () => {
    assert.equal(mensajeStt('speech_timeout'), 'No se escuchó nada.')
    assert.equal(mensajeStt('timeout'), 'La escucha tardó demasiado.')
    assert.equal(mensajeStt('algo'), 'algo')
  })

  it('ajusta cantidad por voz sin bloquear y avisa si excede', () => {
    assert.deepEqual(ajustarCantidadVoz(5, 10), { cantidad: 5, excede: false, disponible: 10 })
    assert.deepEqual(ajustarCantidadVoz(15, 10), { cantidad: 15, excede: true, disponible: 10 })
    assert.deepEqual(ajustarCantidadVoz(3, null), { cantidad: 3, excede: false, disponible: null })
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

describe('voz: confirmación hablada (Modo PRO)', () => {
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
