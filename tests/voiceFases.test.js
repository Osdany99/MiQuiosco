import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MS_REINTENTO_INTERNET,
  MS_TIMEOUT_SONDA,
  MS_VIGENCIA_INTERNET,
  combinarSondas,
  datoInternetVigente,
  decidirInternet
} from '../app/utils/voice/conectividad.js'
import {
  avanzarFaseStt,
  derivarFaseVoz,
  tituloDeError
} from '../app/utils/voice/faseVoz.js'
import {
  MS_SIN_VOZ,
  MS_TEXTO_ESTABLE,
  decidirVigilancia
} from '../app/utils/voice/vigilancia.js'

describe('voz: sonda de Internet', () => {
  it('sin interfaz de red no hay Internet aunque la sonda no exista', () => {
    assert.equal(decidirInternet({ redConectada: false, sonda: null, onLine: null }), false)
    assert.equal(decidirInternet({ redConectada: false, sonda: true, onLine: true }), false)
  })

  it('una sonda que resuelve es la prueba de que hay Internet (caso APK)', () => {
    assert.equal(decidirInternet({ redConectada: null, sonda: true, onLine: true }), true)
    assert.equal(decidirInternet({ redConectada: true, sonda: true, onLine: false }), true)
  })

  it('una sonda que falla gana sobre la interfaz conectada', () => {
    assert.equal(decidirInternet({ redConectada: true, sonda: false, onLine: true }), false)
  })

  it('sin sonda posible se apoya en la interfaz y en onLine', () => {
    assert.equal(decidirInternet({ redConectada: true, sonda: null, onLine: null }), true)
    assert.equal(decidirInternet({ redConectada: null, sonda: null, onLine: true }), true)
    assert.equal(decidirInternet({ redConectada: null, sonda: null, onLine: false }), false)
    assert.equal(decidirInternet({}), false)
  })

  it('un timeout de la sonda con red conectada NO es «sin Internet» (bug del APK)', () => {
    // Medido en el móvil real: la sonda tarda 1,5–4,2 s por datos móviles + VPN
    // y el timeout era de 2,5 s, así que fallaba la mitad de las veces.
    assert.equal(decidirInternet({ redConectada: true, sonda: null, onLine: true }), true)
    assert.equal(decidirInternet({ redConectada: true, sonda: null, onLine: false }), true)
    assert.equal(decidirInternet({ redConectada: null, sonda: null, onLine: true }), true)
  })

  it('el timeout es holgado porque la sonda ya no bloquea el micrófono', () => {
    assert.ok(MS_TIMEOUT_SONDA >= 5000, 'un timeout corto da falsos «sin red»')
    assert.ok(MS_REINTENTO_INTERNET < MS_VIGENCIA_INTERNET)
  })

  it('combina sondas en paralelo: basta una que responda', () => {
    assert.equal(combinarSondas([false, true]), true)
    assert.equal(combinarSondas([true, null]), true)
    assert.equal(combinarSondas([false, false]), false)
    // Una bloqueada y otra en duda no prueban que falte Internet.
    assert.equal(combinarSondas([false, null]), null)
    assert.equal(combinarSondas([null, null]), null)
    assert.equal(combinarSondas([]), null)
    assert.equal(combinarSondas([false, undefined]), null)
  })

  it('un dato de conectividad caduca a los 30 s', () => {
    const ahora = 1_000_000
    assert.equal(datoInternetVigente(ahora, ahora + 1_000), true)
    assert.equal(datoInternetVigente(ahora, ahora + MS_VIGENCIA_INTERNET - 1), true)
    assert.equal(datoInternetVigente(ahora, ahora + MS_VIGENCIA_INTERNET), false)
    assert.equal(datoInternetVigente(0), false)
    assert.equal(datoInternetVigente(null), false)
  })
})

describe('voz: vigilante de escucha', () => {
  it('pide terminar cuando el texto deja de cambiar', () => {
    assert.equal(decidirVigilancia({ hayTexto: true, desdeTextoMs: MS_TEXTO_ESTABLE }), 'terminar')
    assert.equal(decidirVigilancia({ hayTexto: true, desdeTextoMs: MS_TEXTO_ESTABLE - 1 }), 'esperar')
    assert.equal(decidirVigilancia({ hayTexto: true, desdeTextoMs: null }), 'esperar')
  })

  it('cierra por silencio cuando no se captó ni una palabra', () => {
    assert.equal(decidirVigilancia({ hayTexto: false, desdeReadyMs: MS_SIN_VOZ }), 'sin_voz')
    assert.equal(decidirVigilancia({ hayTexto: false, desdeReadyMs: MS_SIN_VOZ - 1 }), 'esperar')
    assert.equal(decidirVigilancia({ hayTexto: false, desdeReadyMs: null }), 'esperar')
  })

  it('no hace nada mientras ya se está cerrando', () => {
    assert.equal(decidirVigilancia({ hayTexto: true, desdeTextoMs: 99_999, finalizando: true }), 'esperar')
    assert.equal(decidirVigilancia({ hayTexto: false, desdeReadyMs: 99_999, finalizando: true }), 'esperar')
  })

  it('acepta límites para pruebas con reloj simulado', () => {
    assert.equal(
      decidirVigilancia({ hayTexto: true, desdeTextoMs: 500, limites: { textoEstable: 500 } }),
      'terminar'
    )
  })
})

describe('voz: fases del STT', () => {
  it('la fase nunca retrocede con el churn end/beginning', () => {
    let fase = 'preparando'
    fase = avanzarFaseStt(fase, 'capturando')
    assert.equal(fase, 'capturando')
    fase = avanzarFaseStt(fase, 'preparando')
    assert.equal(fase, 'capturando')
    fase = avanzarFaseStt(fase, 'procesando')
    assert.equal(fase, 'procesando')
    fase = avanzarFaseStt(fase, 'capturando')
    assert.equal(fase, 'procesando')
  })

  it('ignora fases desconocidas', () => {
    assert.equal(avanzarFaseStt('capturando', 'idle'), 'capturando')
    assert.equal(avanzarFaseStt('idle', 'capturando'), 'capturando')
  })
})

describe('voz: título de error', () => {
  it('distingue fallo de servicio, producto y micrófono', () => {
    assert.equal(tituloDeError('Sin conexión: el reconocimiento de voz necesita internet.'), 'El servicio de voz falló')
    assert.equal(tituloDeError('No encontré el producto.'), 'No encontré el producto')
    assert.equal(tituloDeError('Falta el permiso de micrófono.'), 'Micrófono no disponible')
    assert.equal(tituloDeError('No te entendí. Prueba otra vez.'), 'No te entendí')
    assert.equal(tituloDeError(''), 'No se pudo completar')
  })
})

describe('voz: fase visible derivada', () => {
  const base = {
    estado: 'idle',
    vozEstado: 'idle',
    faseStt: 'idle'
  }

  it('error gana a todo', () => {
    const fase = derivarFaseVoz({ ...base, estado: 'error', hablando: true, error: 'No te entendí.' })
    assert.equal(fase.clave, 'error')
    assert.equal(fase.titulo, 'No te entendí')
    assert.equal(fase.modoOnda, 'error')
  })

  it('cargar el modelo se anuncia y no dice que escucha', () => {
    const fase = derivarFaseVoz({ ...base, estado: 'preparando', faseStt: 'preparando', cargandoModelo: true })
    assert.equal(fase.clave, 'cargando')
    assert.match(fase.titulo, /Cargando/)
  })

  it('mientras habla el TTS no compite con el micrófono', () => {
    const fase = derivarFaseVoz({ ...base, estado: 'listo', faseStt: 'capturando', hablando: true })
    assert.equal(fase.clave, 'hablando')
    assert.equal(fase.modoOnda, 'hablando')
  })

  it('capturando sin texto pide hablar; con texto reciente dice Te escucho', () => {
    const turno = derivarFaseVoz({ ...base, estado: 'escuchando', faseStt: 'capturando' })
    assert.equal(turno.clave, 'turno')
    assert.equal(turno.titulo, 'Habla ahora')
    assert.equal(turno.esperandoVoz, true)
    assert.equal(turno.puedeCancelar, true)

    const escucha = derivarFaseVoz({
      ...base,
      estado: 'escuchando',
      faseStt: 'capturando',
      textoReciente: true,
      transcript: 'vende un refresco'
    })
    assert.equal(escucha.clave, 'escucho')
    assert.equal(escucha.titulo, 'Te escucho')
    assert.equal(escucha.esperandoVoz, false)
    assert.equal(escucha.subtitulo, 'vende un refresco')
    assert.equal(escucha.transcriptEnSubtitulo, true)
  })

  it('solo el nivel de audio no basta si no hay texto reciente', () => {
    const fase = derivarFaseVoz({
      ...base,
      estado: 'escuchando',
      faseStt: 'capturando',
      vozDetectada: true
    })
    assert.equal(fase.clave, 'escucho')
  })

  it('preparando y procesando tienen textos propios', () => {
    const preparando = derivarFaseVoz({ ...base, estado: 'preparando', faseStt: 'preparando' })
    assert.equal(preparando.clave, 'preparando')
    assert.equal(preparando.titulo, 'Preparando micrófono…')

    const procesando = derivarFaseVoz({ ...base, estado: 'escuchando', faseStt: 'procesando' })
    assert.equal(procesando.clave, 'procesando')
    assert.equal(procesando.titulo, 'Procesando lo que dijiste…')
    assert.equal(procesando.puedeCancelar, false)
  })

  it('la confirmación del Modo PRO pide sí o no', () => {
    const fase = derivarFaseVoz({
      ...base,
      estado: 'listo',
      faseStt: 'capturando',
      confirmando: true
    })
    assert.equal(fase.clave, 'turno')
    assert.match(fase.subtitulo, /sí/)
  })

  it('la ventana de cancela se anuncia como deshacer', () => {
    const fase = derivarFaseVoz({ ...base, estado: 'listo', faseStt: 'capturando', deshaciendo: true })
    assert.equal(fase.clave, 'deshacer')
    assert.match(fase.subtitulo, /cancela/)
  })

  it('ambiguo y listo no se confunden con la escucha', () => {
    assert.equal(derivarFaseVoz({ ...base, estado: 'ambiguo' }).clave, 'ambiguo')
    const listo = derivarFaseVoz({ ...base, estado: 'listo' })
    assert.equal(listo.clave, 'listo')
    assert.equal(listo.titulo, 'Listo para confirmar')
  })
})
