<script setup>
import { Capacitor } from '@capacitor/core'
import { registrarProof, reintentarProofs } from '../utils/voice/proofs'
import { useConfirmacionVoz } from '../composables/useConfirmacionVoz'
import { FRASE_CONFIRMAR } from '../utils/voice/frasesVoz'
import { MS_MARGEN_ANTIECO } from '../utils/voice/eco'

const auth = useAuth()
const perms = usePermisos()
const isCollapsed = ref(true)
const mobileOpen = ref(false)
const vozDialogRef = ref(null)
const zeroTouch = useVoiceZeroTouch()
const voiceRaw = useVoiceCommand()
const ttsRaw = useTts()
const confirmacion = useConfirmacionVoz()
// La confirmación hablada ya no es un modo aparte: es el comportamiento normal
// de una venta por voz (solo jefe). Se retiró el interruptor de Modo PRO.
const ceroToquesActivo = computed(() => auth.esJefe.value)
const { hayRed, cargarEstado, faseSync, progresoSync } = useSync()
const conexion = useModoConexion()
const route = useRoute()
const vozQuiosco = useVentaPorVoz('quiosco')
const vozAlmacen = useVentaPorVoz('almacen')
const dictadoModo = useDictadoModo()
const accionesVoz = useAccionesPendientes()
const vozSnapshot = useVozSnapshot()
const buzon = useBuzonVoz()
const vozConfig = useVozConfig()
const vozServicio = useVozServicio()
const toast = useToast()
const pendientesVoz = computed(() => accionesVoz.pendientes.value.length)

// Un cambio de flota se empuja al servicio en cuanto llega por sync; con el
// servicio detenido se aplicará en el próximo arranque.
watch(() => vozConfig.version.value, () => {
  void vozServicio.configurar()
})

/**
 * Recoge lo dictado con la app cerrada. El servicio en primer plano no
 * registra nada: deja la transcripción en un fichero y aquí se convierte en
 * acción pendiente de revisión.
 */
async function drenarBuzon() {
  if (!auth.esJefe.value) return
  try {
    const r = await buzon.drenar()
    if (!r?.creados) return
    toast.add({
      title: `${r.creados} dictado${r.creados === 1 ? '' : 's'} por revisar`,
      description: 'La voz no registró nada todavía: confirma en "Por revisar (voz)".',
      color: 'warning'
    })
    await vozSnapshot.actualizar().catch(() => {})
  } catch {
    /* el buzón no debe romper el arranque */
  }
}

let soltarResumeBuzon = null

// La sesión puede hidratarse después del montaje: se recarga la cola y el buzón
// cuando ya hay puesto, para que el badge no se quede en cero.
watch(
  () => auth.usuarioActual.value?.puestoId ?? null,
  (pid) => {
    if (!pid || !auth.esJefe.value) return
    accionesVoz.cargar()
      .then(() => drenarBuzon())
      .then(() => vozSnapshot.actualizar())
      .catch(() => {})
  }
)

// Al cerrar sesión el servicio no debe seguir escuchando.
watch(
  () => auth.esJefe.value,
  (esJefe) => {
    if (!esJefe) void vozServicio.detener()
  }
)
// Dentro de inventario manda la ruta. Fuera de inventario el dock sigue
// disponible (venta global), pero usa la ubicación cuyo permiso de voz tenga
// el usuario, en vez de asumir quiosco siempre.
const ubicacionVozActual = computed(() => {
  const ruta = route.path || ''
  if (ruta.startsWith('/almacen') || ruta.startsWith('/inventario')) return 'almacen'
  if (ruta.startsWith('/quiosco')) return 'quiosco'
  if (perms.puedeAccion('quiosco', 'voz')) return 'quiosco'
  if (perms.puedeAccion('almacen', 'voz')) return 'almacen'
  return 'quiosco'
})
const vozActiva = computed(() =>
  ubicacionVozActual.value === 'almacen' ? vozAlmacen : vozQuiosco
)
const vozDialogAbierto = ref(false)
void zeroTouch.cargar()

// El anuncio incluye "Diga sí para confirmar" (una sola locución).
watch(
  ceroToquesActivo,
  (activo) => {
    vozQuiosco.confirmacionHablada.value = activo
    vozAlmacen.confirmacionHablada.value = activo
  },
  { immediate: true }
)

// Conversación de confirmación (anuncio + "di sí"). Mientras dura,
// el panel de voz sigue visible aunque el diálogo de venta esté abierto.
const confirmandoVoz = ref(false)

// El panel acompaña toda la conversación: escucha, anuncios, y la escucha de
// la confirmación (que abre el micrófono por fuera de vozActiva.estado).
const panelVozVisible = computed(() => {
  if (!vozActiva.value.micVisible.value) return false
  const estado = vozActiva.value.estado.value
  return vozActiva.value.ocupado.value
    || estado === 'error'
    || confirmandoVoz.value
    || voiceRaw.estado.value === 'listening'
    || (Boolean(ttsRaw.hablando?.value) && (estado === 'listo' || estado === 'ambiguo'))
})

function cancelarPanelVoz() {
  // Durante la confirmación: dejar de escuchar y volver al toque manual.
  if (confirmandoVoz.value) {
    confirmacion.cancelar()
    void voiceRaw.stopListening()
    return
  }
  void vozActiva.value.cancelarEscucha()
}

watch(() => vozActiva.value.producto.value, async (fila) => {
  if (!fila) return
  // Sin lectura de voz no hay confirmación hablada: el formulario queda abierto
  // para confirmar con el botón. Antes se abría el micrófono y se esperaban 6 s
  // en silencio, porque `tts.speak` no hace nada con la lectura apagada.
  if (!ttsRaw.habilitado.value) {
    vozDialogAbierto.value = true
    toast.add({
      title: 'Voz',
      description: 'Lectura apagada: confirma la venta con el botón.',
      color: 'neutral'
    })
    return
  }
  // Sin permiso de venta por voz solo queda el toque manual en el formulario.
  if (!ceroToquesActivo.value || vozActiva.value.modo.value !== 'venta') {
    vozDialogAbierto.value = true
    return
  }
  // Abre modal para precargar form, avisa, escucha el "sí" y confirma.
  vozDialogAbierto.value = true
  await nextTick()
  // Esperar a la lectura del producto (read-back) para que la confirmación no
  // interrumpa el anuncio de lo que se va a vender.
  const rb = vozActiva.value.readBackPromise?.value
  if (rb && typeof rb.then === 'function') {
    // speak() ya tiene su propio tope de seguridad; este es solo un último recurso.
    await Promise.race([rb, new Promise(resolve => setTimeout(resolve, 12000))])
  }
  let prefill = vozActiva.value.prefill.value
  let resultado = 'timeout'
  let confianza = 0
  let correcciones = 0
  let avisoManual = false
  confirmandoVoz.value = true
  try {
    if (voiceRaw.estado.value === 'listening') return
    // Solo se repite la petición si el anuncio no la incluyó (p. ej. falló la voz).
    if (!vozActiva.value.readBackIncluyeConfirmacion?.value) {
      try {
        await ttsRaw.speak(FRASE_CONFIRMAR)
      } catch {
        /* noop */
      }
    }

    /** Abre el micrófono, espera sí/no/corrección y lo cierra. */
    const escucharRespuesta = async () => {
      // Margen para que el eco final de la voz no entre al micrófono.
      await new Promise(r => setTimeout(r, MS_MARGEN_ANTIECO))
      // Sin reset, `voice.transcript` todavía tiene el comando que abrió el
      // diálogo y la confirmación podría leerlo como respuesta.
      voiceRaw.reset()
      // startListening resuelve al terminar la escucha; no se espera aquí.
      voiceRaw.registrar('stt.ui.dock', { modo: conexion.modo.value, red: voiceRaw.hayInternet.value, origen: 'confirmacion' })
      const escucha = voiceRaw.startListening({
        contexto: { modo: conexion.modo.value, red: voiceRaw.hayInternet.value }
      }).catch(() => {})
      const respuesta = await confirmacion.esperar({
        timeoutMs: zeroTouch.timeoutMs.value,
        // El prompt es TODO lo que se habló: con solo la pregunta corta no se
        // detectaba el eco de la lectura y un «sí» oído del propio TTS confirmaba.
        prompt: vozActiva.value.readBackTexto?.value || FRASE_CONFIRMAR
      })
      confianza = Number(voiceRaw.confidence?.value) || 0
      try {
        voiceRaw.registrar('voz.confirmar', {
          resultado: respuesta.resultado,
          cantidad: respuesta.cantidad,
          texto: String(voiceRaw.transcript?.value || ''),
          confianza,
          producto: fila?.nombre ?? ''
        })
      } catch {
        /* la traza no debe romper la venta */
      }
      try {
        await voiceRaw.stopListening()
      } catch {
        /* noop */
      }
      await escucha
      voiceRaw.reset()
      return respuesta
    }

    // Hasta dos correcciones («no, eran tres») sin cerrar el formulario.
    while (true) {
      const respuesta = await escucharRespuesta()
      resultado = respuesta.resultado
      if (respuesta.resultado !== 'corregir') break

      if (correcciones >= 2) {
        resultado = 'abandonado'
        try {
          await ttsRaw.speak('Confirma con el botón.')
        } catch {
          /* noop */
        }
        break
      }

      correcciones++
      const cambio = await vozActiva.value.cambiarCantidad(respuesta.cantidad)
      if (!cambio?.ok) {
        // `cambiarCantidad` ya explicó el stock; el formulario queda abierto.
        // En una venta de varios productos ya avisó que se corrige a mano.
        resultado = 'abandonado'
        if (cambio?.motivo === 'multiple') avisoManual = true
        break
      }
      prefill = vozActiva.value.prefill.value
      // Esperar la nueva lectura (ya incluye la petición de confirmación).
      const nuevoReadBack = vozActiva.value.readBackPromise?.value
      if (nuevoReadBack && typeof nuevoReadBack.then === 'function') {
        await Promise.race([nuevoReadBack, new Promise(resolve => setTimeout(resolve, 12000))])
      }
    }
  } catch {
    /* degrade: queda el modal abierto para toque manual */
  } finally {
    confirmandoVoz.value = false
  }
  // Proof de audit (local, sin texto crudo).
  try {
    await registrarProof({
      comando: 'venta_directa',
      productoId: fila?.productoId ?? fila?.id ?? null,
      productoNombre: fila?.nombre ?? null,
      cantidad: prefill?.cantidad ?? null,
      ubicacion: prefill?.ubicacion ?? null,
      modo: prefill?.modo ?? null,
      confianza,
      outcome: resultado === 'afirmado'
        ? 'auto-confirmado'
        : (resultado === 'negado' ? 'cancelado' : 'abandonado')
    }, {
      token: auth.jwtSync.value
    })
  } catch { /* noop */ }
  if (resultado === 'negado') {
    try {
      vozDialogAbierto.value = false
    } catch {
      /* noop */
    }
    try {
      await ttsRaw.speak('Cancelado.')
    } catch {
      /* noop */
    }
    vozActiva.value.limpiar()
  } else if (resultado === 'afirmado' && vozDialogRef.value?.confirmar) {
    vozDialogRef.value.confirmar()
  } else {
    if (!avisoManual) {
      try {
        await ttsRaw.speak('Sin respuesta, confirme manualmente.')
      } catch {
        /* noop */
      }
    }
  }
})
watch(vozDialogAbierto, (abierto) => {
  if (!abierto) vozActiva.value.limpiar()
})

/**
 * Un diálogo por comando asistido. Comparten `vozDialogAbierto` (la voz abrió un
 * formulario) pero solo el del modo activo queda abierto: si los tres
 * escucharan el mismo booleano, se abrirían los tres a la vez.
 */
const MODOS_DIALOGO_VENTA = new Set(['venta', 'casa', 'familiar', 'regalo', 'deuda', 'cobro'])
const dialogoVentaAbierto = computed({
  get: () => vozDialogAbierto.value && MODOS_DIALOGO_VENTA.has(vozActiva.value.modo.value),
  set: (valor) => { if (!valor) vozDialogAbierto.value = false }
})
const dialogoEntradaAbierto = computed({
  get: () => vozDialogAbierto.value && vozActiva.value.modo.value === 'entrada',
  set: (valor) => { if (!valor) vozDialogAbierto.value = false }
})
const dialogoPrecioAbierto = computed({
  get: () => vozDialogAbierto.value && vozActiva.value.modo.value === 'precio',
  set: (valor) => { if (!valor) vozDialogAbierto.value = false }
})
const dialogoTraspasoAbierto = computed({
  get: () => vozDialogAbierto.value && vozActiva.value.modo.value === 'traspaso',
  set: (valor) => { if (!valor) vozDialogAbierto.value = false }
})
// Cambiar de quiosco a almacén no debe arrastrar el producto ni dejar el
// micrófono de la ubicación anterior abierto.
watch(ubicacionVozActual, () => {
  vozDialogAbierto.value = false
  void vozQuiosco.cancelar()
  void vozAlmacen.cancelar()
})

const config = useRuntimeConfig()
const etiquetaSync = computed(() => etiquetaFaseSync(faseSync.value, progresoSync.value))
const mostrarBannerSync = computed(() => conexion.transicionando.value || faseSync.value !== 'inactiva')
// Avance real de la fase en curso (subida por lotes, bajada o aplicación).
const porcentajeSync = computed(() => {
  const { actual, total } = progresoSync.value ?? {}
  if (!total) return 0
  return Math.min(100, Math.max(0, Math.round((actual / total) * 100)))
})

// El cambio Online/Local solo existe en Android nativo: en web el modo es
// forzosamente online y el sqlite es in-memory (se pierde al recargar).
const esNativo = computed(() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})

const inactTimeout = Number(config.public.sessionInactivityTimeoutJefeSegundos) || 60
const ACTIVITY_THROTTLE_MS = Math.max(5000, (inactTimeout * 1000) / 2)
let ultimoRegistroActividad = 0
function onUserActivity() {
  const ahora = Date.now()
  if (ahora - ultimoRegistroActividad > ACTIVITY_THROTTLE_MS) {
    ultimoRegistroActividad = ahora
    auth.registrarActividad()
  }
}

onMounted(() => {
  perms.cargarDesdePreferencias().catch(() => {})
  cargarEstado()
  conexion.cargar().catch(() => {})
  // El badge de "Por revisar" y el snapshot que lee el servicio con la app
  // cerrada se actualizan al abrir; la revisión interactiva los refresca sola.
  if (auth.esJefe.value) {
    accionesVoz.cargar()
      .then(() => drenarBuzon())
      .then(() => vozSnapshot.actualizar())
      .catch(() => {})
    // El servicio de escucha arranca apagado/pausado mientras la app está
    // abierta: el micrófono del dock es el que manda. La configuración de flota
    // se lee de la copia local primero para no retrasar el arranque.
    void vozConfig.cargar()
      .then(() => vozServicio.cargarPreferencia())
      .then(() => vozServicio.sincronizarConApp(true))
      .catch(() => {})
    void vozConfig.refrescar().catch(() => {})
    // Al volver de segundo plano puede haber dictados nuevos del servicio.
    void import('@capacitor/app').then(({ App }) => {
      const handle = App.addListener('appStateChange', ({ isActive }) => {
        void vozServicio.sincronizarConApp(isActive)
        if (isActive) {
          void drenarBuzon()
          // Los proofs que no subieron por falta de red se reintentan al volver.
          void reintentarProofs({ token: auth.jwtSync.value }).catch(() => {})
        } else {
          // La foto que leerá el servicio se congela al minimizar: refleja lo
          // vendido hasta este momento.
          void vozSnapshot.actualizar().catch(() => {})
        }
      })
      soltarResumeBuzon = () => handle.then(h => h.remove()).catch(() => {})
    }).catch(() => {})
  }
  document.addEventListener('click', onUserActivity)
  document.addEventListener('keydown', onUserActivity)
  document.addEventListener('touchstart', onUserActivity)
  // Cola de proofs: lo que no subió por falta de red se reintenta al arrancar y
  // cuando vuelve la conexión. Solo el jefe genera proofs (confirmación hablada).
  window.addEventListener('online', reintentarProofsPendientes)
  if (auth.esJefe.value) void reintentarProofsPendientes()
})

/**
 * Reintento de la cola de proofs con el token actual. No lanza: si no hay red o
 * el token aún no está listo, la cola queda para la próxima vez.
 */
function reintentarProofsPendientes() {
  return reintentarProofs({ token: auth.jwtSync.value }).catch(() => {})
}

// En nativo `navigator.onLine` no es fiable: el cambio de red real lo da
// Capacitor, que ya alimenta `hayRed`. Al volver la conexión se reintenta.
watch(hayRed, (conectado) => {
  if (conectado && auth.esJefe.value) void reintentarProofsPendientes()
})

onUnmounted(() => {
  soltarResumeBuzon?.()
  soltarResumeBuzon = null
  window.removeEventListener('online', reintentarProofsPendientes)
  document.removeEventListener('click', onUserActivity)
  document.removeEventListener('keydown', onUserActivity)
  document.removeEventListener('touchstart', onUserActivity)
})

const colorMode = useColorMode()
const isDark = computed({
  get() {
    return colorMode.value === 'dark'
  },
  set(val) {
    colorMode.preference = val ? 'dark' : 'light'
  }
})

const links = computed(() => {
  const items = []

  if (auth.esJefe.value) {
    items.push(
      { label: 'Cuadre del día', icon: 'i-lucide-clipboard-check', to: '/cuadre', vista: 'cuadre' },
      { label: 'Historial de cuadres', icon: 'i-lucide-clock', to: '/cuadres', vista: 'cuadres' },
      { label: 'Historial del quiosco', icon: 'i-lucide-store', to: '/historial-quiosco', vista: 'historial-quiosco' },
      { label: 'Deudas', icon: 'i-lucide-hand-coins', to: '/deudas', vista: 'deudas' },
      { label: 'Venta directa', icon: 'i-lucide-receipt', to: '/venta-directa', vista: 'salidas' },
      {
        label: 'Por revisar (voz)',
        icon: 'i-lucide-mic-vocal',
        to: '/pendientes',
        vista: 'pendientes-voz',
        // Solo el número: el badge es un aviso, no una alarma. Lo dictado con
        // la app cerrada aparece aquí al abrir.
        badge: pendientesVoz.value
          ? { label: String(pendientesVoz.value), color: 'warning', variant: 'solid', size: 'sm' }
          : undefined
      },
      { label: 'Productos', icon: 'i-lucide-package', to: '/productos', vista: 'productos' },
      ...(MOSTRAR_PROVEEDOR
        ? [{ label: 'Proveedores', icon: 'i-lucide-truck', to: '/proveedores', vista: 'proveedores' }]
        : []),
      { label: 'Quiosco', icon: 'i-lucide-store', to: '/quiosco', vista: 'quiosco' },
      { label: 'Almacén', icon: 'i-lucide-warehouse', to: '/almacen', vista: 'almacen' },
      { label: 'Usuarios', icon: 'i-lucide-user-cog', to: '/usuarios', vista: 'usuarios' },
      { label: 'Clientes', icon: 'i-lucide-users', to: '/clientes', vista: 'clientes' },
      { label: 'Ficha cliente', icon: 'i-lucide-user-search', to: '/ficha-cliente', vista: 'ficha-cliente' },
      { label: 'Gráficas', icon: 'i-lucide-bar-chart-2', to: '/graficas', vista: 'graficas' },
      { label: 'Recargas', icon: 'i-lucide-smartphone-charging', to: '/recargas', vista: 'recargas' },
      { label: 'Por confirmar', icon: 'i-lucide-message-square-text', to: '/recargas/sms', vista: 'recargas-sms' }
    )
  } else if (auth.esTrabajador.value) {
    items.push(
      {
        label: 'Cuadre del día',
        icon: 'i-lucide-clipboard-check',
        to: '/cuadre'
      }
    )
  }
  return items.filter(link => !link.vista || perms.puedeVista(link.vista))
})

const userMenuItems = computed(() => {
  const items = [
    [
      {
        label: auth.usuarioActual.value?.nombre || 'Usuario',
        slot: 'profile',
        disabled: true
      }
    ]
  ]

  if (auth.esJefe.value && esNativo.value) {
    const enTransicion = conexion.transicionando.value
    const modoItems = [
      {
        label: enTransicion && etiquetaSync.value
          ? etiquetaSync.value
          : (conexion.modo.value === 'online' ? 'Modo: Online' : 'Modo: Local'),
        icon: enTransicion ? 'i-lucide-loader-circle' : (conexion.modo.value === 'online' ? 'i-lucide-globe' : 'i-lucide-database'),
        onSelect: () => { if (!enTransicion) conexion.toggle() },
        disabled: enTransicion
      }
    ]
    if (enTransicion) {
      modoItems.push({
        label: 'Cancelar sincronización',
        icon: 'i-lucide-x',
        onSelect: () => { cancelarSincronizacion() }
      })
    }
    items.push(modoItems)
  }

  items.push(
    [
      {
        label: isDark.value ? 'Tema Claro' : 'Tema Oscuro',
        icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
        onSelect: () => { isDark.value = !isDark.value }
      }
    ],
    [
      {
        label: 'Configuración',
        icon: 'i-lucide-settings',
        to: '/settings'
      }
    ],
    [
      {
        label: 'Cerrar sesión',
        icon: 'i-lucide-log-out',
        onSelect: () => { auth.logout() }
      }
    ]
  )

  return items
})
</script>

<template>
  <UDashboardGroup unit="rem" class="w-full min-h-screen flex">
    <UDashboardSidebar
      id="default"
      v-model:open="mobileOpen"
      v-model:collapsed="isCollapsed"
      collapsible
      class="bg-elevated/25 border-r border-gray-200 dark:border-gray-800"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-1 select-none cursor-pointer" @click="isCollapsed = !isCollapsed">
          <UIcon name="i-lucide-store" class="size-6 text-primary shrink-0" />
          <span v-if="!collapsed" class="font-semibold truncate">MiQuiosco</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="border-t border-gray-200 dark:border-gray-800 w-full">
          <UDropdownMenu v-if="auth.usuarioActual.value" :items="userMenuItems" :popper="{ placement: collapsed ? 'right-start' : 'top' }">
            <UButton
              color="neutral"
              variant="ghost"
              class="w-full flex items-center gap-2 px-2 py-1.5"
              :class="{ 'justify-center': collapsed }"
            >
              <div class="relative shrink-0">
                <UAvatar
                  :alt="auth.usuarioActual.value?.nombre"
                  size="sm"
                />
                <span
                  v-if="auth.esJefe.value"
                  class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background"
                  :class="hayRed ? 'bg-green-500' : 'bg-red-500'"
                />
              </div>
              <div v-if="!collapsed" class="text-left min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ auth.usuarioActual.value?.nombre }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ auth.rol.value }}
                </p>
              </div>
            </UButton>

            <template #profile="{ item }">
              <div class="text-left px-2 py-1.5">
                <p class="text-xs text-muted">
                  Sesión activa como
                </p>
                <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {{ item.label }}
                </p>
              </div>
            </template>
          </UDropdownMenu>
        </div>
      </template>
    </UDashboardSidebar>

    <div class="flex-1 min-w-0 w-full p-6 overflow-y-auto">
      <VoiceDock
        v-if="vozActiva.micVisible.value"
        :visible="vozActiva.micVisible.value"
        :disponible="vozActiva.disponible.value"
        :ocupado="vozActiva.ocupado.value"
        :estado="vozActiva.estado.value"
        :voz-estado="voiceRaw.estado.value"
        :fase-stt="voiceRaw.faseStt.value"
        :motivo="vozActiva.motivoNoDisponible.value"
        :push-to-talk="dictadoModo.pushToTalk.value"
        :error="vozActiva.ultimoError.value"
        @activar="vozActiva.venderPorVoz()"
        @detener="vozActiva.detenerEscucha()"
        @cancelar="vozActiva.cancelarEscucha()"
      />

      <BaseDialog
        v-model="vozActiva.showCandidatos.value"
        :title="vozActiva.tituloCandidatos.value || 'Elegir producto'"
        description="El reconocimiento no fue suficientemente claro. Confirma cual corresponde."
        hide-confirm
        @cancel="vozActiva.cancelar()"
      >
        <div class="space-y-2">
          <UButton
            v-for="candidate in vozActiva.candidatos.value"
            :key="candidate.product.id"
            block
            variant="ghost"
            color="neutral"
            class="justify-start"
            @click="vozActiva.seleccionarCandidato(candidate)"
          >
            <span class="flex flex-col items-start">
              <span>{{ candidate.row?.nombre ?? candidate.product.name }}</span>
              <span v-if="candidate.row?.descripcion" class="text-xs text-muted">{{ candidate.row.descripcion }}</span>
            </span>
            <span class="ml-auto text-xs text-muted">{{ Math.round(((candidate.scoreEfectivo ?? candidate.score) * 100)) }}%</span>
          </UButton>
        </div>
      </BaseDialog>

      <InventarioDialogoVenta
        ref="vozDialogRef"
        v-model="dialogoVentaAbierto"
        :producto="vozActiva.producto.value"
        :ubicacion="vozActiva.prefill.value?.ubicacion ?? ubicacionVozActual"
        :modo="vozActiva.modo.value"
        :prefill="vozActiva.prefill.value"
        @guardado="void (vozActiva.limpiar(), vozActiva.invalidarCatalogoVoz())"
      />

      <!-- Comandos asistidos (K, L, N): cada uno tiene su diálogo y su propio
           v-model; solo se abre el que corresponde al modo activo. Ninguno se
           confirma por voz. -->
      <InventarioDialogoEntrada
        v-model="dialogoEntradaAbierto"
        :producto-id="vozActiva.modo.value === 'entrada' ? (vozActiva.producto.value?.productoId ?? null) : null"
        :prefill="vozActiva.modo.value === 'entrada' ? vozActiva.prefill.value : null"
        @guardado="void (vozActiva.limpiar(), vozActiva.invalidarCatalogoVoz())"
      />
      <ProductoDialogoPrecio
        v-model="dialogoPrecioAbierto"
        :producto="vozActiva.modo.value === 'precio' ? vozActiva.producto.value : null"
        :prefill="vozActiva.modo.value === 'precio' ? vozActiva.prefill.value : null"
        @guardado="void (vozActiva.limpiar(), vozActiva.invalidarCatalogoVoz())"
      />
      <InventarioDialogoTraspaso
        v-model="dialogoTraspasoAbierto"
        :producto-id="vozActiva.modo.value === 'traspaso' ? (vozActiva.producto.value?.productoId ?? null) : null"
        :prefill="vozActiva.modo.value === 'traspaso' ? vozActiva.prefill.value : null"
        @guardado="void (vozActiva.limpiar(), vozActiva.invalidarCatalogoVoz())"
      />

      <UButton
        v-if="isCollapsed"
        icon="i-lucide-menu"
        variant="ghost"
        size="sm"
        class="lg:hidden mb-4"
        @click="mobileOpen = true"
      />
      <slot />
    </div>

    <VoiceListeningBar
      :visible="panelVozVisible"
      :confirmando="confirmandoVoz"
      :ocupado="vozActiva.ocupado.value"
      :estado="vozActiva.estado.value"
      :fase-stt="voiceRaw.faseStt.value"
      :error="vozActiva.ultimoError.value || ''"
      :transcript="vozActiva.transcriptParcial.value"
      @reintentar="vozActiva.reintentar()"
      @cancelar="cancelarPanelVoz()"
    />

    <!-- Progreso visible del cambio Local/Online: el toggle cierra el menú al
         tocarlo, así que el estado vive aquí para que se vea sin reabrir nada.
         Ancho completo en móvil (el texto no cabe en una píldora) y compacto
         en pantallas grandes. -->
    <div
      v-if="mostrarBannerSync"
      class="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 px-4 py-2.5 shadow-lg"
    >
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-primary" />
        <span class="min-w-0 flex-1 text-sm font-medium break-words">{{ etiquetaSync || 'Sincronizando…' }}</span>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-x"
          aria-label="Cancelar sincronización"
          @click="cancelarSincronizacion()"
        />
      </div>
      <div
        v-if="porcentajeSync > 0"
        class="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      >
        <div
          class="h-full rounded-full bg-primary transition-all duration-300"
          :style="{ width: porcentajeSync + '%' }"
        />
      </div>
    </div>
  </UDashboardGroup>
</template>
