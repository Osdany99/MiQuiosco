// Sin buscador en los desplegables: ningún USelectMenu de la app lo usa.
// USelectMenu trae `searchInput: true` por defecto; aquí se cambia el default
// a false de forma global para no repetir `:search-input="false"` en cada uso.
// Los `:search-input="false"` explícitos que ya existen quedan como
// redundancia inofensiva.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:created', () => {
    const comp = nuxtApp.vueApp.component('USelectMenu')
    const searchInput = comp?.props?.searchInput
    if (searchInput && 'default' in searchInput) searchInput.default = false
  })
})
