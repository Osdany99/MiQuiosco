/**
 * Catálogo de motores de voz (STT).
 *
 * Archivo puro (sin Capacitor) para poder testearlo con `node --test`.
 * El selector de Ajustes y el resolver se generan a partir de aquí.
 *
 * Para añadir un motor nuevo:
 *   1. Agrégalo a MOTORES_CATALOGO (id, label, opciones, eventoGlobal).
 *   2. Mapea su plugin en engines/index.js.
 *   3. Listo: aparece en el selector y el resolver lo usa.
 */

export const MOTORES_CATALOGO = [
  {
    id: 'google',
    label: 'Google',
    enabled: true,
    auto: true,
    // Google emite sttEvent global; se escucha una vez al crear el composable.
    eventoGlobal: true,
    opciones: [
      { id: 'google', label: 'Google (solo online)', offline: false },
      { id: 'google-offline', label: 'Google (solo offline)', offline: true }
    ]
  },
  {
    id: 'vosk',
    label: 'Vosk',
    enabled: true,
    auto: false,
    // Vosk necesita cargar el modelo antes de start. Google no.
    preparar: true,
    // Vosk solo emite sttEvent durante su propia escucha; se registra por
    // escucha, no global. Si no se selecciona, no se llama a ningún método.
    eventoGlobal: false,
    opciones: [
      { id: 'vosk', label: 'Vosk (solo offline, experimental)', offline: true }
    ]
  }
]

export const OPCIONES_MOTOR = [
  { id: 'automatico', label: 'Automático (online si hay red; offline si no)', auto: true },
  ...MOTORES_CATALOGO
    .filter(motor => motor.enabled)
    .flatMap(motor => motor.opciones)
]

/**
 * Resuelve la preferencia guardada a un motor + modo.
 * - `automatico`: motor `auto` (Google), offline solo si no hay Internet.
 * - Cualquier otra: la opción declarada por el motor.
 * - Desconocida: cae a `automatico`.
 */
export function resolverPreferencia(preferencia, hayInternet, motores = MOTORES_CATALOGO) {
  if (!preferencia || preferencia === 'automatico') {
    const motor = motores.find(m => m.enabled && m.auto) || motores.find(m => m.enabled)
    if (!motor) return null
    return {
      id: motor.id,
      label: motor.label,
      offline: hayInternet === false,
      opcion: null,
      eventoGlobal: motor.eventoGlobal,
      requierePreparacion: motor.preparar === true,
      plugin: motor.plugin
    }
  }

  for (const motor of motores) {
    if (!motor.enabled) continue
    const opcion = (motor.opciones || []).find(o => o.id === preferencia)
    if (opcion) {
      return {
        id: motor.id,
        label: motor.label,
        offline: opcion.offline,
        opcion,
        eventoGlobal: motor.eventoGlobal,
        requierePreparacion: motor.preparar === true,
        plugin: motor.plugin
      }
    }
  }

  return resolverPreferencia('automatico', hayInternet, motores)
}
