export default defineNuxtPlugin(async () => {
  const { getApiBaseUrl } = await import('../utils/api')
  await getApiBaseUrl()
})
