// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  ignores: [
    'android/**',
    '**/native-bridge.js',
    'app/server-offline/**',
    'drizzle/**'
  ],
  rules: {
    'vue/no-multiple-template-root': 'off',
    'vue/max-attributes-per-line': ['error', { singleline: 3 }],
    'no-empty': ['error', { allowEmptyCatch: true }]
  }
})
