import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  crearPuestoAdminSchema,
  actualizarPuestoAdminSchema,
  actualizarJefeAdminSchema,
  resetPinAdminSchema,
  resolverFalloAdminSchema,
  actualizarDispositivoAdminSchema
} from '../shared/schemas/admin.js'

describe('crearPuestoAdminSchema', () => {
  const valido = {
    nombre: 'Quiosco 2',
    jefe: { nombre: 'ana', pin: '4321' }
  }

  it('acepta un puesto con su jefe y activa por defecto', () => {
    const r = crearPuestoAdminSchema.safeParse(valido)
    assert.equal(r.success, true)
    assert.equal(r.data.activo, true)
  })

  it('exige el jefe: no hay puestos sin usuario', () => {
    assert.equal(crearPuestoAdminSchema.safeParse({ nombre: 'Solo' }).success, false)
  })

  it('rechaza un PIN con letras o fuera de 4-6 dígitos', () => {
    const conLetras = { ...valido, jefe: { nombre: 'ana', pin: '12ab' } }
    const corto = { ...valido, jefe: { nombre: 'ana', pin: '123' } }
    const largo = { ...valido, jefe: { nombre: 'ana', pin: '1234567' } }
    assert.equal(crearPuestoAdminSchema.safeParse(conLetras).success, false)
    assert.equal(crearPuestoAdminSchema.safeParse(corto).success, false)
    assert.equal(crearPuestoAdminSchema.safeParse(largo).success, false)
  })

  it('recorta el nombre y el PIN antes de validar', () => {
    const r = crearPuestoAdminSchema.safeParse({
      nombre: '  Quiosco 2  ',
      jefe: { nombre: ' ana ', pin: ' 4321 ' }
    })
    assert.equal(r.success, true)
    assert.equal(r.data.nombre, 'Quiosco 2')
    assert.equal(r.data.jefe.nombre, 'ana')
    assert.equal(r.data.jefe.pin, '4321')
  })
})

describe('actualizarPuestoAdminSchema', () => {
  it('acepta cambios parciales', () => {
    assert.equal(actualizarPuestoAdminSchema.safeParse({ activo: false }).success, true)
    assert.equal(actualizarPuestoAdminSchema.safeParse({ nombre: 'Nuevo' }).success, true)
  })

  it('rechaza un PATCH vacío', () => {
    assert.equal(actualizarPuestoAdminSchema.safeParse({}).success, false)
  })
})

describe('actualizarJefeAdminSchema', () => {
  it('acepta activar/desactivar y salario nulo', () => {
    assert.equal(actualizarJefeAdminSchema.safeParse({ activo: false }).success, true)
    assert.equal(actualizarJefeAdminSchema.safeParse({ salario: null }).success, true)
  })

  it('rechaza salario negativo y PATCH vacío', () => {
    assert.equal(actualizarJefeAdminSchema.safeParse({ salario: -1 }).success, false)
    assert.equal(actualizarJefeAdminSchema.safeParse({}).success, false)
  })
})

describe('resetPinAdminSchema', () => {
  it('acepta 4-6 dígitos y rechaza lo demás', () => {
    assert.equal(resetPinAdminSchema.safeParse({ pin: '0000' }).success, true)
    assert.equal(resetPinAdminSchema.safeParse({ pin: '123456' }).success, true)
    assert.equal(resetPinAdminSchema.safeParse({ pin: '12' }).success, false)
    assert.equal(resetPinAdminSchema.safeParse({ pin: 'abcd' }).success, false)
  })
})

describe('resolverFalloAdminSchema', () => {
  it('exige el estado y permite nota', () => {
    assert.equal(resolverFalloAdminSchema.safeParse({ resuelto: true }).success, true)
    assert.equal(
      resolverFalloAdminSchema.safeParse({ resuelto: false, nota: 'revisado' }).success,
      true
    )
    assert.equal(resolverFalloAdminSchema.safeParse({ nota: 'sin estado' }).success, false)
  })
})

describe('actualizarDispositivoAdminSchema', () => {
  it('acepta renombrar o revocar', () => {
    assert.equal(actualizarDispositivoAdminSchema.safeParse({ nombre: 'Caja 1' }).success, true)
    assert.equal(actualizarDispositivoAdminSchema.safeParse({ revocado: true }).success, true)
  })

  it('rechaza un PATCH vacío', () => {
    assert.equal(actualizarDispositivoAdminSchema.safeParse({}).success, false)
  })
})
