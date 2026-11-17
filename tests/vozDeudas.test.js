import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  esConsultaDeuda,
  extraerClienteHint,
  extraerDeudaSlots,
  interpretar,
  resolverComando
} from '../shared/voz/gramatica.js'
import {
  buscarClienteDeuda,
  formatearDeuda,
  montoDeuda,
  resumirDeudas
} from '../shared/voz/deudas.js'
import { construirSnapshot, SNAPSHOT_VERSION } from '../app/utils/voice/snapshot.js'

const CLIENTES = [
  { id: 'c1', nombre: 'Juan Pérez' },
  { id: 'c2', nombre: 'Juanita' },
  { id: 'c3', nombre: 'María' },
  { id: 'c4', nombre: 'Pedro' }
]

const CUENTAS = [
  // Juan: dos deudas, una de ellas pagada.
  { id: 'd1', clienteId: 'c1', montoTotal: 100, montoPagado: 0, creadoEn: 1000 },
  { id: 'd2', clienteId: 'c1', montoTotal: 200, montoPagado: 50, creadoEn: 2000 },
  { id: 'd3', clienteId: 'c1', montoTotal: 300, montoPagado: 300, creadoEn: 3000 },
  // Juanita y María con saldo; Pedro saldado.
  { id: 'd4', clienteId: 'c2', montoTotal: 80, montoPagado: 0, creadoEn: 1500 },
  { id: 'd5', clienteId: 'c3', montoTotal: 40, montoPagado: 10, creadoEn: 1600 },
  { id: 'd6', clienteId: 'c4', montoTotal: 60, montoPagado: 60, creadoEn: 1700 }
]

describe('voz: deudas — clasificación', () => {
  const casos = [
    ['cuanto debe juan', 'consulta_deuda'],
    ['cuanto debe la senora de juan', 'consulta_deuda'],
    ['las deudas', 'consulta_deuda'],
    ['deudas de maria', 'consulta_deuda'],
    ['cuanto me deben', 'consulta_deuda'],
    ['quien me debe mas', 'consulta_deuda'],
    ['cuanto debe juan por favor', 'consulta_deuda']
  ]

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      assert.equal(resolverComando(texto).comando, esperado)
    })
  }

  it('«cuánto debo» no se contesta: puede ser una compra del negocio', () => {
    assert.equal(esConsultaDeuda('cuanto debo'), false)
    assert.notEqual(resolverComando('cuanto debo').comando, 'consulta_deuda')
  })

  it('«abre deudas» sigue siendo navegación', () => {
    assert.equal(resolverComando('abre deudas').comando, 'navegacion')
    assert.equal(resolverComando('ir a deudas').comando, 'navegacion')
  })

  it('«cuánto cuesta el pan» no se confunde con deuda', () => {
    assert.equal(resolverComando('cuanto cuesta el pan').comando, 'consulta_precio')
  })
})

describe('voz: deudas — slots', () => {
  it('extrae el cliente de la frase', () => {
    assert.equal(extraerClienteHint('cuanto debe juan'), 'juan')
    assert.equal(extraerClienteHint('cuanto debe juan perez'), 'juan perez')
    assert.equal(extraerClienteHint('las deudas de la senora de juan'), 'senora de juan')
    assert.equal(extraerClienteHint('cuanto debe juan por favor'), 'juan')
  })

  it('sin nombre devuelve el total', () => {
    const slots = extraerDeudaSlots('cuanto me deben')
    assert.deepEqual(slots, { clienteHint: '', ambito: 'total' })
  })

  it('«quién me debe más» pide el mayor deudor', () => {
    assert.deepEqual(extraerDeudaSlots('quien me debe mas'), { clienteHint: '', ambito: 'mayor' })
  })

  it('con nombre el ámbito es el cliente', () => {
    assert.deepEqual(extraerDeudaSlots('deudas de maria'), { clienteHint: 'maria', ambito: 'cliente' })
  })

  it('interpretar() entrega los slots del comando', () => {
    const r = interpretar('cuánto debe Juan Pérez')
    assert.equal(r.comando, 'consulta_deuda')
    assert.deepEqual(r.slots, { clienteHint: 'juan perez', ambito: 'cliente' })
  })
})

describe('voz: deudas — resumen', () => {
  it('suma saldos pendientes e ignora las deudas pagadas', () => {
    const r = resumirDeudas({ cuentas: CUENTAS, clientes: CLIENTES })
    assert.equal(r.total, 360)
    assert.equal(r.cantidad, 3)
    assert.deepEqual(r.clientes.map(c => c.nombre), ['Juan Pérez', 'Juanita', 'María'])
    assert.equal(r.clientes[0].saldo, 250)
    assert.equal(r.clientes[0].cuentas, 2)
  })

  it('sin cuentas devuelve un resumen vacío', () => {
    assert.deepEqual(resumirDeudas({}), { total: 0, cantidad: 0, clientes: [] })
  })

  it('cada cliente lleva sus deudas ordenadas para el cobro FIFO', () => {
    const r = resumirDeudas({ cuentas: CUENTAS, clientes: CLIENTES })
    const juan = r.clientes.find(c => c.nombre === 'Juan Pérez')
    assert.equal(juan.cuentas, 2)
    assert.deepEqual(juan.deudas.map(d => d.saldo), [100, 150])
    assert.ok(juan.deudas.every(d => typeof d.id === 'string' && d.id))
    // La más antigua primero: el id de cada fila no se inventa.
    assert.ok(juan.deudas[0].creadoEn <= juan.deudas[1].creadoEn)
  })

  it('un cliente sin nombre conocido no rompe el resumen', () => {
    const r = resumirDeudas({ cuentas: [{ clienteId: 'x', montoTotal: 10 }], clientes: [] })
    assert.equal(r.clientes[0].nombre, 'Cliente sin nombre')
  })

  it('respeta el límite de clientes del snapshot', () => {
    const r = resumirDeudas({ cuentas: CUENTAS, clientes: CLIENTES, limite: 2 })
    assert.equal(r.cantidad, 3)
    assert.equal(r.clientes.length, 2)
  })
})

describe('voz: deudas — búsqueda del cliente', () => {
  const resumen = resumirDeudas({ cuentas: CUENTAS, clientes: CLIENTES })

  it('sin nombre se responde el total', () => {
    assert.deepEqual(buscarClienteDeuda('', resumen), { tipo: 'total' })
  })

  it('encuentra el cliente aunque el STT pierda las tildes', () => {
    const r = buscarClienteDeuda('maria', resumen)
    assert.equal(r.tipo, 'cliente')
    assert.equal(r.cliente.id, 'c3')
  })

  it('«juan» es ambiguo entre Juan Pérez y Juanita', () => {
    const r = buscarClienteDeuda('juan', resumen)
    assert.equal(r.tipo, 'ambiguo')
    assert.deepEqual(r.candidatos.map(c => c.nombre).sort(), ['Juan Pérez', 'Juanita'])
  })

  it('no elige a nadie por un nombre que no existe', () => {
    const r = buscarClienteDeuda('ramon', resumen)
    assert.equal(r.tipo, 'inexistente')
    assert.equal(r.nombre, 'ramon')
  })

  it('un cliente saldado no aparece como deudor', () => {
    assert.equal(buscarClienteDeuda('pedro', resumen).tipo, 'inexistente')
  })
})

describe('voz: deudas — respuestas', () => {
  const resumen = resumirDeudas({ cuentas: CUENTAS, clientes: CLIENTES })

  it('lee el saldo de un cliente y cuántas deudas tiene', () => {
    const r = formatearDeuda(resumen, buscarClienteDeuda('juan perez', resumen), 'cliente')
    assert.equal(r.habla, 'Juan Pérez debe 250 pesos en 2 deudas.')
    assert.match(r.titulo, /250 pesos/)
  })

  it('una sola deuda no dice «en 1 deudas»', () => {
    const r = formatearDeuda(resumen, buscarClienteDeuda('maria', resumen), 'cliente')
    assert.equal(r.habla, 'María debe 30 pesos.')
  })

  it('el total dice cuánto y entre cuántos', () => {
    const r = formatearDeuda(resumen, { tipo: 'total' }, 'total')
    assert.match(r.habla, /^En total me deben 360 pesos entre 3 clientes\./)
    assert.match(r.habla, /El que más debe es Juan Pérez, con 250 pesos\./)
  })

  it('«quién debe más» empieza por el mayor deudor', () => {
    const r = formatearDeuda(resumen, { tipo: 'total' }, 'mayor')
    assert.match(r.habla, /^El que más debe es Juan Pérez, con 250 pesos\./)
  })

  it('los parecidos se leen y se pide el nombre completo', () => {
    const encontrado = buscarClienteDeuda('juan', resumen)
    const r = formatearDeuda(resumen, encontrado, 'cliente')
    assert.equal(r.tipo, 'ambiguo')
    assert.match(r.habla, /Tengo 2 clientes parecidos/)
    assert.match(r.habla, /Juan Pérez debe 250 pesos/)
    assert.match(r.habla, /Juanita debe 80 pesos/)
    assert.match(r.habla, /Di el nombre completo/)
  })

  it('un cliente sin deudas se dice tal cual', () => {
    const r = formatearDeuda(resumen, { tipo: 'inexistente', nombre: 'Ramón' }, 'cliente')
    assert.equal(r.habla, 'No tengo deudas pendientes de Ramón.')
  })

  it('sin deudas no se inventa una cifra', () => {
    const vacio = resumirDeudas({})
    assert.equal(formatearDeuda(vacio, { tipo: 'total' }).habla, 'No hay deudas pendientes.')
  })

  it('los importes con centavos se leen con coma', () => {
    assert.equal(montoDeuda(350), '350')
    assert.equal(montoDeuda(350.5), '350,50')
    assert.equal(montoDeuda(null), '0')
  })
})

describe('voz: deudas en el snapshot (app cerrada)', () => {
  it('el snapshot lleva el resumen de deudas y sube de versión', () => {
    const snap = construirSnapshot({
      puestoId: 'p1',
      filas: [],
      acciones: [],
      ventas: [],
      cuentas: CUENTAS,
      clientes: CLIENTES
    })
    assert.equal(snap.version, SNAPSHOT_VERSION)
    assert.equal(SNAPSHOT_VERSION, 4)
    assert.equal(snap.deudas.total, 360)
    assert.equal(snap.deudas.cantidad, 3)
    assert.equal(snap.deudas.clientes[0].nombre, 'Juan Pérez')
  })

  it('sin datos de deudas el snapshot sigue siendo válido', () => {
    const snap = construirSnapshot({ puestoId: 'p1', filas: [] })
    assert.deepEqual(snap.deudas, { total: 0, cantidad: 0, clientes: [] })
  })
})
