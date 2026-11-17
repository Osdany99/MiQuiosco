import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { interpretar } from '../shared/voz/gramatica.js'
import {
  resolverCambioPrecio,
  resolverEntradaInventario,
  resolverTraspaso
} from '../app/utils/voice/resolverAsistido.js'
import {
  fraseCambioPrecio,
  fraseClienteAlta,
  fraseCuadre,
  fraseEntrada,
  fraseTraspaso
} from '../app/utils/voice/frasesVoz.js'

const CATALOGO = [
  { productoId: 'p1', nombre: 'Pan de leche', almacen: 20, quiosco: 5, precioVentaActual: 10 },
  { productoId: 'p2', nombre: 'Refresco Cola', almacen: 3, quiosco: 2, precioVentaActual: 25 }
]

describe('voz asistida: comandos (K, L, M, N)', () => {
  it('reconoce la entrada al almacén y saca producto, cantidad y costo', () => {
    const r = interpretar('entraron 20 panes a 10 pesos')
    assert.equal(r.comando, 'entrada_inventario')
    assert.equal(r.slots.productoHint, 'panes')
    assert.equal(r.slots.cantidad, 20)
    assert.equal(r.slots.precioUnitario, 10)
  })

  it('la entrada sin costo deja el precio en null', () => {
    const r = interpretar('llegaron 5 cajas de leche')
    assert.equal(r.comando, 'entrada_inventario')
    assert.equal(r.slots.precioUnitario, null)
  })

  it('un cambio de precio exige la palabra «precio»', () => {
    const r = interpretar('cambia el precio del pan a 25')
    assert.equal(r.comando, 'cambio_precio')
    assert.equal(r.slots.productoHint, 'pan')
    assert.equal(r.slots.precio, 25)
    // Sin «precio» sigue siendo una venta: «pon el refresco a 60» no cambia la
    // tarifa del catálogo.
    assert.notEqual(interpretar('pon el refresco a 60').comando, 'cambio_precio')
  })

  it('distingue abrir de cerrar el cuadre', () => {
    assert.deepEqual(interpretar('abre el cuadre').slots, { accion: 'abrir' })
    assert.deepEqual(interpretar('cierra el cuadre').slots, { accion: 'cerrar' })
    assert.deepEqual(interpretar('cierra y confirma el cuadre').slots, { accion: 'cerrar' })
  })

  it('el traspaso lleva producto, cantidad y destino', () => {
    const r = interpretar('pasa 5 panes del almacen al quiosco')
    assert.equal(r.comando, 'traspaso')
    assert.equal(r.slots.productoHint, 'panes')
    assert.equal(r.slots.cantidad, 5)
    assert.equal(r.slots.destino, 'quiosco')
  })

  it('«transfiere» también es traspaso', () => {
    const r = interpretar('transfiere 5 panes del almacen al quiosco')
    assert.equal(r.comando, 'traspaso')
    assert.equal(r.slots.productoHint, 'panes')
    assert.equal(r.slots.cantidad, 5)
    assert.equal(r.slots.destino, 'quiosco')
    assert.equal(interpretar('transfiere 2 panes del quiosco al almacen').slots.destino, 'almacen')
  })

  it('no se come las ventas ni las consultas de siempre', () => {
    assert.equal(interpretar('vende 5 panes').comando, 'venta_directa')
    assert.equal(interpretar('cuanto cuesta el pan').comando, 'consulta_precio')
    assert.equal(interpretar('fia 2 panes a juan').comando, 'venta_fiada')
    assert.equal(interpretar('cobra 200 a juan').comando, 'cobro_deuda')
  })
})

describe('voz asistida: entrada al almacén (K)', () => {
  it('resuelve producto, cantidad y costo dictados', () => {
    const r = resolverEntradaInventario({
      slots: { productoHint: 'pan de leche', cantidad: 20, precioUnitario: 12 }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'ok')
    assert.equal(r.fila.productoId, 'p1')
    assert.equal(r.cantidad, 20)
    assert.equal(r.precioUnitario, 12)
  })

  it('sin costo no inventa precio: queda null para usar el último', () => {
    const r = resolverEntradaInventario({
      slots: { productoHint: 'pan de leche', cantidad: 5, precioUnitario: null }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'ok')
    assert.equal(r.precioUnitario, null)
  })

  it('un producto dudoso o inexistente no prellena nada', () => {
    // Dos "pan…" con el mismo puntaje: no se adivina.
    const ambiguo = resolverEntradaInventario(
      { slots: { productoHint: 'pan', cantidad: 5 } },
      [...CATALOGO, { productoId: 'p3', nombre: 'Pan Blanco', almacen: 9, quiosco: 1, precioVentaActual: 12 }],
      { sttConfidence: 0.95 }
    )
    assert.equal(ambiguo.tipo, 'ambiguo')
    assert.equal(resolverEntradaInventario(
      { slots: { productoHint: 'caviar', cantidad: 5 } },
      CATALOGO,
      { sttConfidence: 0.95 }
    ).tipo, 'error')
  })
})

describe('voz asistida: cambio de precio (L)', () => {
  it('trae el precio actual y el nuevo', () => {
    const r = resolverCambioPrecio({
      slots: { productoHint: 'refresco cola', precio: 30 }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'ok')
    assert.equal(r.precioActual, 25)
    assert.equal(r.precio, 30)
  })

  it('sin cifra dictada contesta que falta el precio', () => {
    const r = resolverCambioPrecio({
      slots: { productoHint: 'refresco cola', precio: null }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'error')
    assert.equal(r.motivo, 'precio_no_dicho')
  })
})

describe('voz asistida: traspaso (N)', () => {
  it('prellena origen almacén, destino quiosco y cantidad', () => {
    const r = resolverTraspaso({
      slots: { productoHint: 'pan de leche', cantidad: 5, destino: 'quiosco' }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'ok')
    assert.equal(r.cantidad, 5)
    assert.equal(r.disponible, 20)
  })

  it('no traspasa más de lo que hay en el almacén', () => {
    const r = resolverTraspaso({
      slots: { productoHint: 'refresco cola', cantidad: 9, destino: 'quiosco' }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'aviso')
    assert.equal(r.motivo, 'stock_insuficiente')
  })

  it('el sentido contrario no se invierte en silencio', () => {
    const r = resolverTraspaso({
      slots: { productoHint: 'pan de leche', cantidad: 1, destino: 'almacen' }
    }, CATALOGO, { sttConfidence: 0.95 })
    assert.equal(r.tipo, 'aviso')
    assert.equal(r.motivo, 'traspaso_inverso')
  })
})

describe('voz asistida: alta de cliente', () => {
  it('reconoce el alta y saca el nombre', () => {
    const r = interpretar('agrega el cliente adrian')
    assert.equal(r.comando, 'cliente_alta')
    assert.equal(r.slots.nombre, 'adrian')
    assert.equal(interpretar('nuevo cliente maria de los angeles').slots.nombre, 'maria de los angeles')
  })

  it('no se come una venta con «registra»', () => {
    assert.equal(interpretar('registra 2 panes').comando, 'venta_directa')
  })

  it('la frase dice a quién va a agregar', () => {
    assert.equal(
      fraseClienteAlta({ nombre: 'Adrián' }),
      'Voy a agregar el cliente Adrián. Revisa y confirma.'
    )
  })
})

describe('voz asistida: frases', () => {
  it('la entrada dice cantidad, producto y costo', () => {
    assert.equal(
      fraseEntrada({ cantidad: 20, nombre: 'Pan', precio: 10 }),
      'Entrada de 20 unidades de Pan al almacén a 10 pesos. Revisa y confirma.'
    )
  })

  it('la entrada sin costo avisa de que usa el último', () => {
    assert.equal(
      fraseEntrada({ cantidad: 5, nombre: 'Pan', precio: null }),
      'Entrada de 5 unidades de Pan al almacén. No dijiste el costo: uso el último. Revisa y confirma.'
    )
  })

  it('el cambio de precio lee el actual y el nuevo', () => {
    assert.equal(
      fraseCambioPrecio({ nombre: 'Pan', actual: 10, nuevo: 25 }),
      'Pan cuesta 10 pesos. Lo voy a poner en 25 pesos. Revisa y confirma.'
    )
    assert.equal(
      fraseCambioPrecio({ nombre: 'Pan', actual: 10, nuevo: null }),
      'Pan cuesta 10 pesos. Dime cuánto lo pongo.'
    )
  })

  it('el traspaso nombra el sentido almacén → quiosco', () => {
    assert.equal(
      fraseTraspaso({ cantidad: 5, nombre: 'Pan' }),
      'Traspaso de 5 unidades de Pan del almacén al quiosco. Revisa y confirma.'
    )
  })

  it('el cuadre lee la caja y nunca promete cerrarlo por voz', () => {
    const abrir = fraseCuadre({ accion: 'abrir', hablaCaja: 'Van 200 pesos vendidos.' })
    assert.equal(abrir, 'Te llevo al cuadre. Van 200 pesos vendidos.')
    const cerrar = fraseCuadre({ accion: 'cerrar', hablaCaja: 'Van 200 pesos vendidos.' })
    assert.match(cerrar, /escribe el dinero real en caja/)
    assert.match(cerrar, /La voz no cierra el cuadre/)
    assert.equal(fraseCuadre({ accion: 'cerrar', sinCuadre: true }), 'No hay un cuadre abierto.')
  })
})
