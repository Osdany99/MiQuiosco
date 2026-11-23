import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  crearPlanOperacion,
  ejecutarPlanOperacion,
  huellaOperacion,
  montoAplicado
} from '../app/utils/voice/ejecucionDuradera.js'
import { crearAlmacenOperacionesVoz } from '../app/utils/voice/operacionesDurables.js'
import { pagoFiadoCoincide } from '../shared/fiadoIdempotencia.js'

function memoria() {
  const datos = new Map()
  return {
    datos,
    async keys() { return { keys: [...datos.keys()] } },
    async get({ key }) { return { value: datos.get(key) ?? null } },
    async set({ key, value }) { datos.set(key, value) },
    async remove({ key }) { datos.delete(key) }
  }
}

function paso(id, monto, cuentaFiadoId = `cuenta-${id}`) {
  return {
    id,
    tipo: 'pago_fiado',
    monto,
    datos: { id, cuentaFiadoId, cuadreId: null, monto, formaPago: 'efectivo' }
  }
}

function plan(pasos = [paso('p1', 100), paso('p2', 50)]) {
  return crearPlanOperacion({
    id: 'command-1',
    tipo: 'cobro_deuda',
    modo: 'online',
    puestoId: 'puesto-1',
    usuarioId: 'usuario-1',
    recuperacion: { clienteId: 'cliente-1', monto: 150 },
    pasos,
    ahora: 1000
  })
}

function base(almacen, planActual, extra = {}) {
  return {
    plan: planActual,
    modoActual: 'online',
    guardar: almacen.guardar,
    eliminar: almacen.eliminar,
    buscar: async () => null,
    coincide: (pasoActual, fila) => pagoFiadoCoincide(fila, pasoActual.datos),
    ...extra
  }
}

describe('ejecutor durable de voz', () => {
  it('guarda antes de escribir y cierra un cobro múltiple una sola vez', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const llamadas = []
    const resultado = await ejecutarPlanOperacion(base(almacen, plan(), {
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        assert.equal((await almacen.listar())[0].pasos.find(p => p.id === pasoActual.id).estado, 'ejecutando')
        return { ok: true }
      }
    }))

    assert.equal(resultado.estado, 'aplicado')
    assert.equal(resultado.aplicado, 150)
    assert.deepEqual(llamadas, ['p1', 'p2'])
    assert.deepEqual(await almacen.listar(), [])
  })

  it('una respuesta perdida se reconcilia por ID y no repite el cobro', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const filas = new Map()
    const llamadas = []
    const resultado = await ejecutarPlanOperacion(base(almacen, plan(), {
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        if (pasoActual.id === 'p1') {
          filas.set(pasoActual.id, pasoActual.datos)
          return { ok: false, error: Object.assign(new Error('respuesta perdida'), { timeout: true }) }
        }
        filas.set(pasoActual.id, pasoActual.datos)
        return { ok: true }
      },
      buscar: async pasoActual => filas.get(pasoActual.id) ?? null
    }))

    assert.equal(resultado.estado, 'aplicado')
    assert.deepEqual(llamadas, ['p1', 'p2'])
    assert.equal(filas.size, 2)
  })

  it('conserva lo incierto y al reanudar no ejecuta un pago que sí existe', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const filas = new Map()
    const llamadas = []
    const ejecutar = async (pasoActual) => {
      llamadas.push(pasoActual.id)
      return { ok: false, error: Object.assign(new Error('timeout'), { timeout: true }) }
    }
    const primero = await ejecutarPlanOperacion(base(almacen, plan(), {
      ejecutar,
      buscar: async () => { throw Object.assign(new Error('sin red'), { red: true }) }
    }))

    assert.equal(primero.estado, 'incierto')
    assert.equal(primero.aplicado, 0)
    assert.deepEqual(llamadas, ['p1'], 'no intenta el siguiente pago')
    assert.equal((await almacen.listar())[0].pasos[0].estado, 'incierto')

    // El proceso murió: se recupera el plan de Preferences y aparece el pago.
    filas.set('p1', paso('p1', 100).datos)
    const segundo = await ejecutarPlanOperacion(base(almacen, (await almacen.listar())[0], {
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        filas.set(pasoActual.id, pasoActual.datos)
        return { ok: true }
      },
      buscar: async pasoActual => filas.get(pasoActual.id) ?? null
    }))

    assert.equal(segundo.estado, 'aplicado')
    assert.equal(segundo.aplicado, 150)
    assert.deepEqual(llamadas, ['p1', 'p2'], 'p1 no se cobró de nuevo')
  })

  it('recupera un paso ejecutando tras muerte del proceso sin repetir su efecto', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const recuperado = plan()
    recuperado.estado = 'ejecutando'
    recuperado.pasos[0].estado = 'ejecutando'
    await almacen.guardar(recuperado)
    const llamadas = []

    const resultado = await ejecutarPlanOperacion(base(almacen, recuperado, {
      buscar: async pasoActual => pasoActual.id === 'p1' ? pasoActual.datos : null,
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        return { ok: true }
      }
    }))

    assert.equal(resultado.estado, 'aplicado')
    assert.deepEqual(llamadas, ['p2'])
  })

  it('un fallo intermedio conserva el progreso y reanuda desde ese pago', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const inicial = plan([paso('p1', 100), paso('p2', 50), paso('p3', 25)])
    const llamadas = []
    const primero = await ejecutarPlanOperacion(base(almacen, inicial, {
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        return pasoActual.id === 'p2'
          ? { ok: false, error: new Error('saldo cambió') }
          : { ok: true }
      }
    }))

    assert.equal(primero.estado, 'rechazado')
    assert.equal(primero.aplicado, 100)
    assert.deepEqual(llamadas, ['p1', 'p2'])
    assert.equal((await almacen.listar())[0].estado, 'parcial')

    const segundo = await ejecutarPlanOperacion(base(almacen, (await almacen.listar())[0], {
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        return { ok: true }
      }
    }))
    assert.equal(segundo.estado, 'aplicado')
    assert.equal(segundo.aplicado, 175)
    assert.deepEqual(llamadas, ['p1', 'p2', 'p2', 'p3'])
  })

  it('ausencia confirmada tras un fallo de red no deja un plan fantasma', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const resultado = await ejecutarPlanOperacion(base(almacen, plan([paso('p1', 100)]), {
      ejecutar: async () => ({ ok: false, error: Object.assign(new Error('timeout'), { timeout: true }) }),
      buscar: async () => null
    }))

    assert.equal(resultado.estado, 'rechazado')
    assert.equal(resultado.confirmadoNoAplicado, true)
    assert.deepEqual(await almacen.listar(), [])
  })

  it('detiene el resto del plan si la conexión cambia de modo a mitad', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    let modo = 'online'
    const llamadas = []
    const resultado = await ejecutarPlanOperacion(base(almacen, plan(), {
      modoActual: () => modo,
      ejecutar: async (pasoActual) => {
        llamadas.push(pasoActual.id)
        modo = 'local'
        return { ok: true }
      }
    }))

    assert.equal(resultado.estado, 'modo_distinto')
    assert.equal(resultado.aplicado, 100)
    assert.deepEqual(llamadas, ['p1'])
    assert.equal((await almacen.listar())[0].pasos[0].estado, 'aplicado')
  })

  it('un ID con otro payload queda para revisión y detiene el plan', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const recuperado = plan()
    recuperado.pasos[0].estado = 'incierto'
    let escrituras = 0
    const resultado = await ejecutarPlanOperacion(base(almacen, recuperado, {
      buscar: async () => ({ ...paso('p1', 100).datos, monto: 999 }),
      ejecutar: async () => {
        escrituras++
        return { ok: true }
      }
    }))

    assert.equal(resultado.estado, 'conflicto')
    assert.equal(escrituras, 0)
    assert.equal((await almacen.listar())[0].estado, 'revision')
  })

  it('no reconcilia online contra local ni viceversa', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    let llamadas = 0
    const resultado = await ejecutarPlanOperacion(base(almacen, plan(), {
      modoActual: 'local',
      ejecutar: async () => {
        llamadas++
        return { ok: true }
      }
    }))

    assert.equal(resultado.estado, 'modo_distinto')
    assert.equal(llamadas, 0)
  })

  it('si falla el journal después del efecto conserva el progreso en el error', async () => {
    const adapter = memoria()
    const almacen = crearAlmacenOperacionesVoz(adapter)
    const guardarOriginal = almacen.guardar
    let error
    try {
      await ejecutarPlanOperacion(base(almacen, plan([paso('p1', 100)]), {
        guardar: async (planActual) => {
          if (planActual.pasos[0].estado === 'aplicado') throw new Error('Preferences lleno')
          return guardarOriginal(planActual)
        },
        ejecutar: async () => ({ ok: true })
      }))
    } catch (caught) {
      error = caught
    }
    assert.match(error.message, /Preferences lleno/)
    assert.equal(error.aplicado, 100)
    assert.equal(error.plan.pasos[0].estado, 'aplicado')
  })
})

describe('almacén y huella de recuperación', () => {
  it('la huella no depende del orden de las claves', () => {
    assert.equal(
      huellaOperacion({ clienteId: 'c1', datos: { monto: 20, forma: 'efectivo' } }),
      huellaOperacion({ datos: { forma: 'efectivo', monto: 20 }, clienteId: 'c1' })
    )
  })

  it('recupera solo el mismo usuario, puesto, tipo y comando', async () => {
    const almacen = crearAlmacenOperacionesVoz(memoria())
    const original = plan()
    await almacen.guardar(original)
    const filtro = {
      tipo: original.tipo,
      puestoId: original.puestoId,
      usuarioId: original.usuarioId,
      recuperacion: original.recuperacion
    }
    assert.equal((await almacen.buscarCoincidente(filtro)).id, original.id)
    assert.equal(await almacen.buscarCoincidente({ ...filtro, usuarioId: 'otro' }), null)
    assert.equal((await almacen.buscarPendienteDeCliente({
      tipo: original.tipo,
      puestoId: original.puestoId,
      usuarioId: original.usuarioId,
      clienteId: 'cliente-1'
    })).id, original.id)
    assert.equal(await almacen.buscarPendienteDeCliente({
      tipo: original.tipo,
      puestoId: original.puestoId,
      usuarioId: original.usuarioId,
      clienteId: 'otro-cliente'
    }), null)
    assert.equal(montoAplicado({ pasos: [{ estado: 'aplicado', monto: 20.25 }, { estado: 'pendiente', monto: 10 }] }), 20.25)
  })
})
