#!/usr/bin/env node
/**
 * scripts/copiar-voz.mjs - copia el diálogo compartido a los assets de Android.
 *
 * `shared/voz/dialogo.json` es la ÚNICA fuente de verbos, números en palabras,
 * confirmaciones/negaciones, tiempos y textos que habla la voz. Lo leen los dos
 * lados: el servicio nativo (desde `assets/voz/dialogo.json`) y el JS (por
 * import). Copiarlo en cada build evita que un APK viejo hable distinto.
 *
 * Además inyecta la ayuda en capas de `shared/voz/ayuda.js`: así el APK explica
 * los comandos con el mismo menú que la app abierta, sin copiar textos a mano.
 *
 * Se ejecuta desde `scripts/gradle.mjs` (todo build de APK pasa por ahí) y desde
 * el hook `precap:sync`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ayudaParaNativo } from '../shared/voz/ayuda.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = join(RAIZ, 'shared/voz/dialogo.json')
const DESTINO_DIR = join(RAIZ, 'android/app/src/main/assets/voz')
const DESTINO = join(DESTINO_DIR, 'dialogo.json')

if (!existsSync(ORIGEN)) {
  console.error(`Falta ${ORIGEN}. El servicio hablaría con los textos por defecto.`)
  process.exit(1)
}

const dialogo = JSON.parse(readFileSync(ORIGEN, 'utf8'))
dialogo.ayuda = ayudaParaNativo()

mkdirSync(DESTINO_DIR, { recursive: true })
writeFileSync(DESTINO, `${JSON.stringify(dialogo, null, 2)}\n`)
console.log(`Voz: dialogo.json copiado a ${DESTINO}`)
