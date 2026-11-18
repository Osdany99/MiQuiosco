import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  esCobroDeuda,
  extraerCobroSlots,
  interpretar,
  resolverComando
} from '../shared/voz/gramatica.js'
import { distribuirCobro, saldoTotalDeudas } from '../shared/voz/deudas.js'
import { fraseCobro } from '../app/utils/voice/frasesVoz.js'
import { pendienteResuelto } from '../app/utils/voice/buzon.js'

const CUENTAS = [
  { id: 'c-nueva', creadoEn: 3000, montoTotal: 100, montoPagado: 0, saldoPendiente: 100 },
  { id: 'c-vieja', creadoEn: 1000, montoTotal: 200, montoPagado: 50, saldoPendiente: 150 },
  { id: 'c-media', creadoEn: 2000, montoTotal: 80, montoPagado: 80, saldoPendiente: 0 }
]

describe('voz: cobro — clasificación', () => {
  const casos = [
    ['cobra 200 a yunior', 'cobro_deuda'],
    ['cobra la deuda de maria', 'cobro_deuda'],
    ['cobra todo a juan', 'cobro_deuda'],
    ['abona 50 a juan', 'cobro_deuda'],
    ['juan me pago 100', 'cobro_deuda'],
    ['maria pago 40', 'cobro_deuda'],
    ['cobra 200 pesos a yunior por transferencia', 'cobro_deuda']
  ]

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      assert.equal(resolverComando(texto).comando, esperado)
    })
  }

  it('«cobra 2 panes» sigue siendo una venta', () => {
    assert.equal(esCobroDeuda('cobra 2 panes'), false)
    assert.equal(resolverComando('cobra 2 panes').comando, 'venta_directa')
    assert.equal(resolverComando('cobra 2 panes a juan').comando, 'venta_directa')
  })

  it('«cuánto pagó Juan» no es un cobro ni una consulta de stock', () => {
    assert.equal(esCobroDeuda('cuanto pago juan'), false)
    assert.notEqual(resolverComando('cuanto pago juan').comando, 'cobro_deuda')
    assert.equal(resolverComando('cuanto pago juan').comando, 'desconocido')
  })

  it('no se confunde con deudas, día ni fiado', () => {
    assert.equal(resolverComando('cuanto debe juan').comando, 'consulta_deuda')
    assert.equal(resolverComando('como va el dia').comando, 'consulta_dia')
    assert.equal(resolverComando('fia dos panes a juan').comando, 'venta_fiada')
  })
})

describe('voz: cobro — slots', () => {
  it('lee el importe y el cliente', () => {
    assert.deepEqual(extraerCobroSlots('cobra 200 a yunior'), {
      clienteHint: 'yunior',
      monto: 200,
      formaPago: 'efectivo'
    })
  })

  it('sin importe cobra todo', () => {
    const slots = extraerCobroSlots('cobra la deuda de maria')
    assert.equal(slots.monto, 'todo')
    assert.equal(slots.clienteHint, 'maria')
  })

  it('«cobra todo a juan» es todo', () => {
    assert.equal(extraerCobroSlots('cobra todo a juan').monto, 'todo')
  })

  it('detecta la transferencia', () => {
    const slots = extraerCobroSlots('cobra 200 pesos a yunior por transferencia')
    assert.equal(slots.monto, 200)
    assert.equal(slots.formaPago, 'transferencia')
    assert.equal(slots.clienteHint, 'yunior')
  })

  it('lee al cliente cuando va delante del verbo', () => {
    const slots = extraerCobroSlots('juan me pago 100')
    assert.equal(slots.clienteHint, 'juan')
    assert.equal(slots.monto, 100)
  })

  it('conserva apellidos', () => {
    assert.equal(extraerCobroSlots('cobra 50 a juan perez').clienteHint, 'juan perez')
  })

  it('interpretar() entrega los slots del comando', () => {
    const r = interpretar('cobra 150 a María por transferencia')
    assert.equal(r.comando, 'cobro_deuda')
    assert.equal(r.slots.monto, 150)
    assert.equal(r.slots.formaPago, 'transferencia')
    assert.equal(r.slots.clienteHint, 'maria')
  })
})

describe('voz: cobro — reparto FIFO', () => {
  it('cobra primero la deuda más antigua', () => {
    const r = distribuirCobro(CUENTAS, 100)
    assert.deepEqual(r.pagos, [{ cuentaId: 'c-vieja', monto: 100 }])
    assert.equal(r.aplicado, 100)
    assert.equal(r.sobrante, 0)
  })

  it('pasa a la siguiente deuda cuando la primera no alcanza', () => {
    const r = distribuirCobro(CUENTAS, 200)
    assert.deepEqual(r.pagos, [
      { cuentaId: 'c-vieja', monto: 150 },
      { cuentaId: 'c-nueva', monto: 50 }
    ])
    assert.equal(r.aplicado, 200)
  })

  it('ignora las deudas saldadas', () => {
    const r = distribuirCobro(CUENTAS, 250)
    assert.equal(r.pagos.length, 2)
    assert.ok(r.pagos.every(p => p.cuentaId !== 'c-media'))
  })

  it('detecta que se pidió más de lo que debe', () => {
    const r = distribuirCobro(CUENTAS, 500)
    assert.equal(r.aplicado, 250)
    assert.equal(r.sobrante, 250)
  })

  it('sin cuentas no reparte nada', () => {
    assert.deepEqual(distribuirCobro([], 100), { pagos: [], aplicado: 0, sobrante: 100 })
  })

  it('suma el saldo pendiente real', () => {
    assert.equal(saldoTotalDeudas(CUENTAS), 250)
    assert.equal(saldoTotalDeudas([]), 0)
  })
})

describe('voz: cobro — frase de confirmación', () => {
  it('dice a quién, cuánto y lo que queda', () => {
    assert.equal(
      fraseCobro({ cliente: 'Yunior', monto: 200, restante: 50 }),
      'Cobro 200 pesos a Yunior. Le quedan 50 pesos. Diga sí para confirmar.'
    )
  })

  it('cuando salda la deuda lo dice', () => {
    assert.equal(
      fraseCobro({ cliente: 'María', monto: 30, restante: 0 }),
      'Cobro 30 pesos a María. Queda saldada. Diga sí para confirmar.'
    )
  })

  it('con centavos usa coma', () => {
    assert.match(
      fraseCobro({ cliente: 'Ana', monto: 12.5, restante: 2.5 }),
      /Cobro 12,50 pesos a Ana\. Le quedan 2,50 pesos\./
    )
  })
})

describe('voz: cobro — buzón de la app cerrada', () => {
  const base = {
    resuelto: true,
    tipo: 'cobro',
    texto: 'cobra 200 a yunior',
    cuentaFiadoId: 'cuenta-1',
    monto: 200,
    formaPago: 'efectivo',
    clienteId: 'c1',
    clienteNombre: 'Yunior',
    dictadoEn: 1000
  }

  it('importa el pago con su deuda, monto y forma de pago', () => {
    const p = pendienteResuelto(base)
    assert.equal(p.tipo, 'cobro')
    assert.equal(p.cuentaFiadoId, 'cuenta-1')
    assert.equal(p.clienteId, 'c1')
    assert.equal(p.importe, 200)
    assert.equal(p.cantidad, 1)
    assert.equal(p.formaPago, 'efectivo')
    assert.equal(p.productoId, null)
  })

  it('sin deuda o sin monto no se importa', () => {
    assert.equal(pendienteResuelto({ ...base, cuentaFiadoId: '' }), null)
    assert.equal(pendienteResuelto({ ...base, monto: 0 }), null)
    assert.equal(pendienteResuelto({ ...base, clienteId: '' }), null)
  })

  it('la transferencia se conserva', () => {
    assert.equal(pendienteResuelto({ ...base, formaPago: 'transferencia' }).formaPago, 'transferencia')
  })
})
