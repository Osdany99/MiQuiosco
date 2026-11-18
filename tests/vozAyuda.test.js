import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { interpretar, resolverComando } from '../shared/voz/gramatica.js'
import { voiceCommandId } from '../shared/schemas/voiceCommand.js'
import {
  GRUPOS_AYUDA,
  ayudaParaNativo,
  esPeticionDeAyuda,
  gruposDisponibles,
  introDeAyuda,
  preguntaDeAyuda,
  sugerenciaDeAyuda,
  temaDeAyuda,
  textoDeGrupo,
  todoDeAyuda
} from '../shared/voz/ayuda.js'

const AQUI = dirname(fileURLToPath(import.meta.url))
const ASSET = join(AQUI, '..', 'android', 'app', 'src', 'main', 'assets', 'voz', 'dialogo.json')
const COMANDOS = new Set(voiceCommandId.options)

describe('ayuda en capas: catálogo', () => {
  it('cada ejemplo cae en un comando del propio grupo', () => {
    for (const grupo of GRUPOS_AYUDA) {
      // `sistema` enseña la palabra clave; no es un comando que se ejecute.
      if (grupo.id === 'sistema') continue
      assert.ok(grupo.ejemplos.includes(grupo.ejemplo), `${grupo.id} no lista su ejemplo principal`)
      for (const frase of grupo.ejemplos) {
        const comando = resolverComando(frase).comando
        assert.ok(
          grupo.comandos.includes(comando),
          `«${frase}» resolvió como ${comando}, fuera de ${grupo.id}`
        )
      }
    }
  })

  it('todos los comandos del catálogo existen en el esquema', () => {
    for (const grupo of GRUPOS_AYUDA) {
      for (const comando of grupo.comandos) {
        assert.ok(COMANDOS.has(comando), `${grupo.id} menciona un comando inexistente: ${comando}`)
      }
    }
  })

  it('cada grupo tiene lo mínimo para hablar y para listarse', () => {
    for (const grupo of GRUPOS_AYUDA) {
      assert.ok(grupo.detalle.includes('{ejemplo}'), `${grupo.id} no admite el ejemplo real`)
      assert.ok(grupo.extra && grupo.sustantivo && grupo.menu, `${grupo.id} está incompleto`)
    }
  })

  it('el detalle usa el ejemplo real cuando se conoce uno', () => {
    const vender = GRUPOS_AYUDA.find(g => g.id === 'vender')
    assert.match(textoDeGrupo(vender, 'vende dos Coca-Cola'), /vende dos Coca-Cola/)
    // Sin catálogo se queda con el comodín, no con un hueco.
    assert.match(textoDeGrupo(vender), /vende dos panes/)
  })
})

describe('ayuda en capas: qué se ofrece según el contexto', () => {
  it('el trabajador solo ve fiar, deudas y lo básico', () => {
    const ids = gruposDisponibles({ esTrabajador: true }).map(g => g.id)
    assert.deepEqual(ids, ['fiar', 'cuadre', 'sistema'])
  })

  it('con la app cerrada no se ofrecen formularios', () => {
    const ids = gruposDisponibles({ appCerrada: true }).map(g => g.id)
    assert.deepEqual(ids, ['vender', 'fiar', 'cobrar', 'consultar', 'sistema'])
    assert.doesNotMatch(introDeAyuda(gruposDisponibles({ appCerrada: true })), /cambios/)
  })

  it('la intro es un mapa corto y la pregunta no repite la lista', () => {
    assert.equal(
      introDeAyuda(gruposDisponibles({})),
      'Te ayudo con ventas, fiados, cobros, consultas, cambios de precio y deudas.'
    )
    assert.equal(preguntaDeAyuda(gruposDisponibles({})), '¿De qué quieres ejemplos?')
    // Con un solo grupo no hay nada que preguntar.
    const soloFiar = gruposDisponibles({}).filter(g => g.id === 'fiar')
    assert.equal(preguntaDeAyuda(soloFiar), '')
  })

  it('«de todo» da un ejemplo por grupo, no la lista de detalles', () => {
    const texto = todoDeAyuda(gruposDisponibles({}))
    assert.match(texto, /vende dos panes/)
    assert.match(texto, /cobra 200 a Juan/)
    assert.doesNotMatch(texto, /Te leo lo que entendí/)
  })
})

describe('ayuda en capas: interpretación del tema', () => {
  it('entiende el tema dicho de varias formas', () => {
    assert.equal(temaDeAyuda('ayuda cobro'), 'cobrar')
    assert.equal(temaDeAyuda('ayuda de cobrar'), 'cobrar')
    assert.equal(temaDeAyuda('sobre fiar'), 'fiar')
    assert.equal(temaDeAyuda('deudas'), 'cuadre')
    assert.equal(temaDeAyuda('consulta'), 'consultar')
    // «precio» es consultar, pero «cambiar precio» es preparar.
    assert.equal(temaDeAyuda('precio'), 'consultar')
    assert.equal(temaDeAyuda('cambiar precio'), 'preparar')
  })

  it('reconoce los comodines y el modo de uso', () => {
    assert.equal(temaDeAyuda('ayuda de todo'), 'todo')
    assert.equal(temaDeAyuda('mas'), 'mas')
    assert.equal(temaDeAyuda('como te uso'), 'sistema')
    assert.equal(temaDeAyuda('hola'), null)
  })

  it('solo es ayuda si detrás no viene un comando de verdad', () => {
    assert.equal(esPeticionDeAyuda('ayuda'), true)
    assert.equal(esPeticionDeAyuda('ayuda cobro'), true)
    assert.equal(esPeticionDeAyuda('que puedes hacer'), true)
    assert.equal(esPeticionDeAyuda('ayuda a vender dos panes'), false)
    assert.equal(esPeticionDeAyuda('ayuda dos panes'), false)
  })

  it('el intérprete devuelve el tema en los slots', () => {
    const r = interpretar('ayuda cobro')
    assert.equal(r.comando, 'ayuda')
    assert.equal(r.slots.tema, 'cobrar')
    assert.equal(interpretar('ayuda').slots.tema, null)
    // Y una venta disfrazada de ayuda sigue siendo venta.
    assert.equal(interpretar('ayuda a vender dos panes').comando, 'venta_directa')
  })
})

describe('ayuda en capas: cuando no entiende', () => {
  it('propone la tarea más probable en vez de solo decir que no', () => {
    assert.equal(sugerenciaDeAyuda('quisiera darle plata a juan').grupo, 'cobrar')
    assert.equal(sugerenciaDeAyuda('cuanto era el pan').grupo, 'consultar')
    assert.equal(sugerenciaDeAyuda('fiarle algo a maria').grupo, 'fiar')
    assert.equal(sugerenciaDeAyuda('entraron veinte panes').grupo, 'preparar')
    // Sin ninguna señal no se inventa una tarea: se manda a la ayuda.
    assert.equal(sugerenciaDeAyuda('hola buenas'), null)
  })

  it('la pista lleva una frase que el intérprete sí entiende', () => {
    for (const frase of ['quisiera darle plata a juan', 'cuanto era el pan', 'fiarle algo a maria']) {
      const sugerencia = sugerenciaDeAyuda(frase)
      assert.notEqual(resolverComando(sugerencia.frase).comando, 'desconocido')
    }
  })
})

describe('ayuda en capas: paridad con la app cerrada', () => {
  it('el asset del APK lleva la misma ayuda que la app abierta', () => {
    const asset = JSON.parse(readFileSync(ASSET, 'utf8'))
    // `node scripts/copiar-voz.mjs` lo regenera en cada build: si esto falla,
    // el APK hablaría una ayuda distinta de la del panel.
    assert.deepEqual(asset.ayuda, ayudaParaNativo())
  })

  it('el menú nativo no promete formularios', () => {
    const nativo = ayudaParaNativo()
    assert.doesNotMatch(nativo.menus.cerrada.intro, /cambios/)
    // El detalle de cada grupo se puede decir tal cual, sin placeholders.
    for (const grupo of nativo.grupos) {
      assert.doesNotMatch(grupo.texto, /\{ejemplo\}/)
      assert.ok(grupo.texto.length > 20)
    }
  })
})
