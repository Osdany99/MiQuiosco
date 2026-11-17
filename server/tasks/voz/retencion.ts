import { ejecutarRetencionVoz } from '../../utils/vozRetencion'

/**
 * Retención de los eventos de voz.
 *
 * En un servidor Node con el proceso vivo la dispara Nitro
 * (`nitro.scheduledTasks` en `nuxt.config.ts`). En serverless no hay proceso
 * permanente: el mismo trabajo lo llama el cron externo contra
 * `POST /api/tasks/voz/retencion`. Las dos vías pasan por
 * `ejecutarRetencionVoz`, así que no pueden divergir.
 */
export default defineTask({
  meta: {
    name: 'voz:retencion',
    description: 'Borra eventos de voz antiguos según la retención de flota'
  },
  async run() {
    const { eliminados, dias } = await ejecutarRetencionVoz()
    return { result: { eliminados, dias } }
  }
})
