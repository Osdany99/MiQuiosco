<script setup>
/**
 * Asistente de permisos del módulo de Recargas.
 *
 * Tres pasos, y el orden importa: el primero ocurre FUERA de la app porque
 * Android pone un candado a los permisos sensibles de toda app instalada fuera
 * de Google Play. Con el candado puesto, pedir el permiso es un diálogo que no
 * concede nada — se comprobó en el dispositivo real.
 *
 * Solo aparece la primera vez. Si el usuario lo pospone, el aviso vive en
 * Configuración y no se vuelve a interrumpir.
 *
 * Nunca bloquea el resto de la app: es una tarjeta encima, no una pantalla
 * obligatoria. Quien solo usa el quiosco puede seguir trabajando sin dar estos
 * permisos.
 */
const props = defineProps({
  paso: { type: String, required: true }
})

const emit = defineEmits(['saltar', 'listo'])

const toast = useToast()
const sms = usePermisosRecarga()

const trabajando = ref(false)

const PASOS = {
  desbloquear: {
    icono: 'i-lucide-lock',
    titulo: 'Un paso en Ajustes antes de continuar',
    texto: 'Android bloquea los permisos de SMS en las apps que no vienen de Google Play, como esta. Necesitas permitir los "ajustes restringidos" una sola vez. En cuanto lo hagas, el resto es automático.'
  },
  sms: {
    icono: 'i-lucide-message-square-text',
    titulo: 'Permiso para leer los SMS de recarga',
    texto: 'La app necesita leer los SMS de confirmación de Etecsa para apuntar cada recarga automáticamente. Sin esto tendrías que anotarlas a mano.'
  },
  notificaciones: {
    icono: 'i-lucide-bell',
    titulo: 'Avisos cuando entre una recarga',
    texto: 'Con las notificaciones te entero en cuanto se registra una recarga, aunque estés atendiendo a otro cliente.'
  }
}

const actual = computed(() => PASOS[props.paso] ?? PASOS.sms)
const esUltimo = computed(() => props.paso === 'notificaciones')

async function continuar() {
  trabajando.value = true
  try {
    if (props.paso === 'desbloquear') {
      // Se abre Ajustes; el paso avanza solo cuando el usuario vuelve, vía
      // observarRegreso() -> evaluar().
      sms.desbloquear()
      return
    }

    if (props.paso === 'sms') {
      const res = await sms.pedirSms()
      if (!res.permisoRecibir) {
        toast.add({
          title: 'Permiso no concedido',
          description: 'Puedes dejarlo para luego y activarlo en Configuración.',
          color: 'warning'
        })
        return
      }
      await continuar()
      return
    }

    // notificaciones
    const res = await sms.pedirNotificaciones()
    if (!res.notificaciones) {
      toast.add({
        title: 'Avisos desactivados',
        description: 'Las recargas se seguirán anotando, solo que sin aviso. Puedes activarlo en Configuración.',
        color: 'warning'
      })
    }
    await sms.completar()
    emit('listo')
  } finally {
    trabajando.value = false
  }
}

async function saltar() {
  await sms.posponer()
  emit('saltar')
}
</script>

<template>
  <div class="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/60 p-4">
    <UCard class="w-full max-w-sm">
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <UIcon
            :name="actual.icono"
            class="size-8 text-primary shrink-0"
          />
          <div class="min-w-0">
            <h2 class="text-base font-semibold">
              {{ actual.titulo }}
            </h2>
            <p class="text-sm text-muted mt-1">
              {{ actual.texto }}
            </p>
          </div>
        </div>

        <UAlert
          v-if="paso === 'desbloquear'"
          color="info"
          variant="soft"
          icon="i-lucide-info"
          title="Se abrirá Ajustes"
          description="Busca 'Permitir ajustes restringidos' en la pantalla de MiQuiosco y actívalo. Google te pedirá confirmar que confías en el desarrollador: es normal en apps instaladas a mano."
          :ui="{ description: 'text-xs' }"
        />

        <div class="flex flex-wrap gap-2">
          <UButton
            :icon="paso === 'desbloquear' ? 'i-lucide-settings' : 'i-lucide-check'"
            :loading="trabajando"
            @click="continuar"
          >
            {{ paso === 'desbloquear' ? 'Abrir Ajustes' : 'Continuar' }}
          </UButton>
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="trabajando"
            @click="saltar"
          >
            Ahora no
          </UButton>
        </div>

        <p class="text-xs text-muted">
          <template v-if="esUltimo">
            Puedes activarlo después en Configuración.
          </template>
          <template v-else>
            Esto solo se pide una vez. Puedes dejarlo para después en Configuración.
          </template>
        </p>
      </div>
    </UCard>
  </div>
</template>
