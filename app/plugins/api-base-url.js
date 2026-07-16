import { Capacitor } from '@capacitor/core'
import { setInitialBaseUrl } from '../utils/api'

export default defineNuxtPlugin(() => {
  if (Capacitor.isNativePlatform()) {
    const config = useRuntimeConfig()
    setInitialBaseUrl(config.public.syncServerUrl)
  }
})
