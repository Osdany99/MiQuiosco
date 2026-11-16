#!/usr/bin/env node
/**
 * scripts/copiar-voz.mjs — copia el diálogo compartido a los assets de Android.
 *
 * `shared/voz/dialogo.json` es la ÚNICA fuente de verbos, números en palabras,
 * confirmaciones/negaciones, tiempos y textos que habla la voz. Lo leen los dos
 * lados: el servicio nativo (desde `assets/voz/dialogo.json`) y el JS (por
 * import). Copiarlo en cada build evita que un APK viejo hable distinto.
 *
 * Se ejecuta desde `scripts/gradle.mjs` (todo build de APK pasa por ahí) y desde
 * el hook `precap:sync`.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = join(RAIZ, 'shared/voz/dialogo.json')
const DESTINO_DIR = join(RAIZ, 'android/app/src/main/assets/voz')
const DESTINO = join(DESTINO_DIR, 'dialogo.json')

if (!existsSync(ORIGEN)) {
  console.error(`Falta ${ORIGEN}. El servicio hablaría con los textos por defecto.`)
  process.exit(1)
}

mkdirSync(DESTINO_DIR, { recursive: true })
copyFileSync(ORIGEN, DESTINO)
console.log(`Voz: dialogo.json copiado a ${DESTINO}`)
