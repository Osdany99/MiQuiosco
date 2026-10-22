import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clientesSimilares,
  etiquetaDeTelefono,
  nombrePareceTelefono,
  normalizarNombre,
  partesIdentidad,
  planificarFusion,
  similitudNombres,
  textoIdentidad
} from '../shared/clientes.js'
import { fusionClienteSchema } from '../shared/schemas/fusionCliente.js'

// --- normalizarNombre ---
describe('normalizarNombre', () => {
  it('iguala acentos, mayúsculas y separadores', () => {
    assert.equal(normalizarNombre('  Adrián   MANÍ '), 'adrian mani')
    assert.equal(normalizarNombre('Adrián-Maní'), 'adrian mani')
  })

  it('quita diacríticos de la ñ a propósito (Peña == Pena)', () => {
    assert.equal(normalizarNombre('Peña'), normalizarNombre('Pena'))
  })

  it('tolera valores vacíos', () => {
    assert.equal(normalizarNombre(null), '')
    assert.equal(normalizarNombre(undefined), '')
  })
})

// --- similitudNombres ---
describe('similitudNombres', () => {
  it('el mismo nombre vale 1', () => {
    assert.equal(similitudNombres('Cheila', 'cheila'), 1)
  })

  it('detecta sufijos de desambiguación de la agenda', () => {
    // Casos reales de la agenda del quiosco.
    assert.ok(similitudNombres('Cheila', 'Cheila 2') >= 0.8)
    assert.ok(similitudNombres('Nora', 'Nora1') >= 0.8)
    assert.ok(similitudNombres('Melvis', 'Melvis 99') >= 0.8)
    assert.ok(similitudNombres('Marido D Así', 'Marido D Asi 2') >= 0.8)
  })

  it('detecta erratas cortas', () => {
    assert.ok(similitudNombres('Javie', 'Javier') >= 0.8)
  })

  it('NO empareja familiares distintos que comparten plantilla', () => {
    // "Hija D X" / "Mujer D X" son personas distintas: el aviso es sugerencia,
    // pero estos casos no deben ni aparecer.
    assert.ok(similitudNombres('Hija D Elianny', 'Hija D Fernando') < 0.8)
    assert.ok(similitudNombres('Mujer D Kico', 'Mujer D Pablo') < 0.8)
    assert.ok(similitudNombres('Cheila', 'Marta') < 0.8)
  })

  it('los sufijos largos pesan menos que los cortos', () => {
    // "adrian" vs "adriana hija d kico" no son el mismo por compartir prefijo.
    assert.ok(similitudNombres('Adrian', 'Adriana Hija D Kico') < 0.8)
  })

  it('vacío no se parece a nada', () => {
    assert.equal(similitudNombres('', 'Cheila'), 0)
    assert.equal(similitudNombres(null, null), 0)
  })
})

// --- clientesSimilares ---
describe('clientesSimilares', () => {
  const clientes = [
    { id: '1', nombre: 'Cheila' },
    { id: '2', nombre: 'Cheila 2' },
    { id: '3', nombre: 'Marta' }
  ]

  it('devuelve los parecidos ordenados y con su puntuación', () => {
    const res = clientesSimilares('Cheila', clientes)
    assert.deepEqual(res.map(r => r.cliente.id), ['1', '2'])
    assert.ok(res[0].similitud >= res[1].similitud)
  })

  it('excluye el propio cliente al editar', () => {
    const res = clientesSimilares('Cheila', clientes, { excluirId: '1' })
    assert.deepEqual(res.map(r => r.cliente.id), ['2'])
  })

  it('respeta el umbral', () => {
    assert.equal(clientesSimilares('Cheila', clientes, { umbral: 1.1 }).length, 0)
  })
})

// --- nombrePareceTelefono ---
describe('nombrePareceTelefono', () => {
  it('reconoce contactos guardados con el número como nombre', () => {
    assert.equal(nombrePareceTelefono('50218368'), true)
    assert.equal(nombrePareceTelefono('+53 5 0081756'), true)
  })

  it('no confunde un nombre con un número', () => {
    assert.equal(nombrePareceTelefono('Cheila 2'), false)
    assert.equal(nombrePareceTelefono('Nora1'), false)
    assert.equal(nombrePareceTelefono(''), false)
  })
})

// --- etiquetaDeTelefono ---
describe('etiquetaDeTelefono', () => {
  it('usa la etiqueta cuando existe', () => {
    assert.equal(etiquetaDeTelefono({ telefono: '5352565410', etiqueta: 'Cheila 2' }), 'Cheila 2')
  })

  it('cae en los últimos 4 dígitos', () => {
    assert.equal(etiquetaDeTelefono({ telefono: '5352565410', etiqueta: '' }), '··5410')
    assert.equal(etiquetaDeTelefono({ telefono: '5352565410' }), '··5410')
  })

  it('sin número ni etiqueta devuelve vacío', () => {
    assert.equal(etiquetaDeTelefono(null), '')
  })
})

// --- identidad en listas ---
describe('partesIdentidad / textoIdentidad', () => {
  it('distingue dos números de un cliente fusionado', () => {
    const fila = { telefono: '5352565410', etiqueta: 'Cheila 2' }
    assert.deepEqual(partesIdentidad('Cheila', fila), { principal: 'Cheila 2', secundario: 'Cheila' })
    assert.equal(textoIdentidad('Cheila', fila), 'Cheila 2 · Cheila')
  })

  it('no repite el nombre cuando la etiqueta es el mismo cliente', () => {
    assert.equal(textoIdentidad('Cheila', { telefono: '5352565410', etiqueta: 'cheila' }), 'cheila')
  })

  it('sin etiqueta usa el nombre del cliente y los últimos 4', () => {
    assert.equal(textoIdentidad('Cheila', { telefono: '5352565410' }), 'Cheila ··5410')
  })

  it('un número sin cliente pero con nombre se identifica por su nombre', () => {
    assert.equal(textoIdentidad(null, { telefono: '5352565410', etiqueta: 'Cheila 2' }), 'Cheila 2')
  })

  it('sin cliente ni etiqueta usa los últimos 4 dígitos', () => {
    assert.equal(textoIdentidad(null, { telefono: '5352565410' }), '··5410')
    assert.equal(textoIdentidad(null, null), 'Sin asignar')
  })
})

// --- planificación de la fusión ---
describe('planificarFusion', () => {
  const clientes = [
    { id: 'a', nombre: 'Cheila', creadoEn: 1000 },
    { id: 'b', nombre: 'Cheila 2', creadoEn: 2000 },
    { id: 'c', nombre: 'Cheila Nueva', creadoEn: 3000 }
  ]

  it('el principal es el cliente que ya tiene el nombre final', () => {
    const plan = planificarFusion({
      clientes,
      telefonos: [],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.equal(plan.principal.id, 'a')
    assert.deepEqual(plan.absorbidos.map(c => c.id), ['b'])
    assert.equal(plan.renombrar, false)
  })

  it('con un nombre nuevo el principal es el más antiguo y hay que renombrarlo', () => {
    const plan = planificarFusion({
      clientes,
      telefonos: [],
      ids: ['b', 'c'],
      nombreFinal: 'Cheila del barrio'
    })
    assert.equal(plan.principal.id, 'b') // el más antiguo de los dos elegidos
    assert.equal(plan.renombrar, true)
    assert.deepEqual(plan.absorbidos.map(c => c.id), ['c'])
  })

  it('los números heredan el nombre del cliente absorbido cuando no tenían alias', () => {
    const plan = planificarFusion({
      clientes,
      telefonos: [
        { id: 't1', clienteId: 'b', telefono: '5352565410', etiqueta: null },
        { id: 't2', clienteId: 'a', telefono: '5352565411', etiqueta: 'la casa' }
      ],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.deepEqual(plan.telefonos, [
      { id: 't1', clienteId: 'a', etiqueta: 'Cheila 2' }
    ])
  })

  it('respeta el alias que el número ya tenía', () => {
    const plan = planificarFusion({
      clientes,
      telefonos: [{ id: 't1', clienteId: 'b', telefono: '5352565410', etiqueta: 'Cheila 2' }],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.equal(plan.telefonos[0].etiqueta, 'Cheila 2')
  })

  it('no inventa alias cuando el absorbido ya se llamaba igual que el final', () => {
    const plan = planificarFusion({
      clientes: [
        { id: 'a', nombre: 'Cheila', creadoEn: 1000 },
        { id: 'b', nombre: 'cheila', creadoEn: 2000 }
      ],
      telefonos: [{ id: 't1', clienteId: 'b', telefono: '5352565410' }],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.equal(plan.telefonos[0].etiqueta, null)
  })

  it('si el principal cambia de nombre, sus números conservan el nombre viejo', () => {
    const plan = planificarFusion({
      clientes: [
        { id: 'a', nombre: 'Cheila 2', creadoEn: 1000 },
        { id: 'b', nombre: 'Nora', creadoEn: 2000 }
      ],
      telefonos: [
        { id: 't1', clienteId: 'a', telefono: '5352565410' },
        { id: 't2', clienteId: 'b', telefono: '5352565411' }
      ],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.equal(plan.principal.id, 'a')
    assert.deepEqual(plan.telefonos, [
      { id: 't1', clienteId: 'a', etiqueta: 'Cheila 2' },
      { id: 't2', clienteId: 'a', etiqueta: 'Nora' }
    ])
  })

  it('si el principal conserva el nombre, sus números no se tocan', () => {
    const plan = planificarFusion({
      clientes,
      telefonos: [{ id: 't1', clienteId: 'a', telefono: '5352565410' }],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.deepEqual(plan.telefonos, [])
  })

  it('ignora números de clientes que no se están fusionando', () => {
    const plan = planificarFusion({
      clientes,
      telefonos: [{ id: 't9', clienteId: 'c', telefono: '5352565419' }],
      ids: ['a', 'b'],
      nombreFinal: 'Cheila'
    })
    assert.deepEqual(plan.telefonos, [])
  })

  it('rechaza ids que no existen (fusión a medias)', () => {
    assert.throws(
      () => planificarFusion({ clientes, telefonos: [], ids: ['a', 'zzz'], nombreFinal: 'Cheila' }),
      /ya no existe/
    )
  })
})

// --- validación de la fusión ---
describe('fusionClienteSchema', () => {
  const id = () => crypto.randomUUID()

  it('exige al menos dos clientes', () => {
    const res = fusionClienteSchema.safeParse({ ids: [id()], nombreFinal: 'Cheila' })
    assert.equal(res.success, false)
  })

  it('exige un nombre final y lo recorta', () => {
    const res = fusionClienteSchema.safeParse({ ids: [id(), id()], nombreFinal: '  Cheila  ' })
    assert.equal(res.success, true)
    assert.equal(res.data.nombreFinal, 'Cheila')
  })

  it('rechaza nombre vacío y demasiado largo', () => {
    assert.equal(fusionClienteSchema.safeParse({ ids: [id(), id()], nombreFinal: '   ' }).success, false)
    assert.equal(fusionClienteSchema.safeParse({ ids: [id(), id()], nombreFinal: 'x'.repeat(101) }).success, false)
  })

  it('rechaza ids que no son uuid', () => {
    assert.equal(fusionClienteSchema.safeParse({ ids: ['1', '2'], nombreFinal: 'Cheila' }).success, false)
  })

  it('rechaza el mismo cliente repetido', () => {
    const repetido = id()
    assert.equal(fusionClienteSchema.safeParse({ ids: [repetido, repetido], nombreFinal: 'Cheila' }).success, false)
  })
})
