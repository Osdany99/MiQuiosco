#!/usr/bin/env node
/**
 * scripts/generar-iconos.mjs — Genera todos los recursos gráficos de MiQuiosco
 * (launcher, splash y favicon) a partir de un único SVG.
 *
 * POR QUÉ UN SCRIPT PROPIO Y NO @capacitor/assets
 * La herramienta oficial pinea sharp@0.32.6 (2023), que no trae binario para
 * Node 24 y termina compilando desde código fuente. Además arrastra una
 * segunda copia de @capacitor/cli@^5 al árbol. Acá solo hace falta sharp.
 *
 * CÓMO SE MIDE EL GLIFO
 * En vez de calcular a mano dónde cae el dibujo dentro del viewBox, se rasteriza
 * el SVG y se le pasa trim() a sharp: eso devuelve el bounding box real de la
 * tinta. A partir de ahí, escalar y centrar es aritmética trivial y no depende
 * de que el path esté bien escrito ni de que el viewBox esté centrado.
 *
 * USO
 *   Editar assets/iconos/glifo.svg y correr `pnpm iconos`.
 *   Después hay que recompilar el APK: `pnpm android:build`.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_GLIFO = join(RAIZ, 'assets/iconos/glifo.svg')
const RES = join(RAIZ, 'android/app/src/main/res')
const FAVICON = join(RAIZ, 'public/favicon.ico')

// Verde de marca: --color-green-500 de app/assets/css/main.css, que es el
// primary de Nuxt UI en toda la app.
const VERDE = '#00C16A'
const BLANCO = '#FFFFFF'

// dp -> px por densidad. El launcher legacy mide 48dp y el foreground del
// ícono adaptativo 108dp (72dp de zona segura + 18dp de margen por lado).
const DENSIDADES = [
  { dir: 'mdpi', f: 1 },
  { dir: 'hdpi', f: 1.5 },
  { dir: 'xhdpi', f: 2 },
  { dir: 'xxhdpi', f: 3 },
  { dir: 'xxxhdpi', f: 4 }
]
const LEGACY_DP = 48
const ADAPTATIVO_DP = 108
const ZONA_SEGURA = 72 / 108 // el glifo no debe salirse de acá

// Proporción del glifo respecto del lienzo, según el icono.
const PROP_LEGACY = 0.58
const PROP_FAVICON = 0.72
const PROP_SPLASH = 0.26

// Lado del ícono del splash de Android 12+ (un solo archivo, ver main()).
// 1536px alcanza hasta Density 640dpi, donde 240dp necesitan 960px reales.
const SPLASH_ICON_PX = 1536

// Tamaños del splash, medidos de los archivos que trae Capacitor. Se declaran
// explícitos para no depender de leer los PNGs existentes (que se sobrescriben).
const SPLASH = [
  ['drawable', 480, 320],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280]
]

const LADO_MEDICION = 1024

/** Contenido interno del SVG fuente, sin el <svg> que lo envuelve. */
function innerDelGlifo() {
  const svg = readFileSync(SRC_GLIFO, 'utf8')
  const m = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)
  if (!m) throw new Error('glifo.svg no parece un SVG válido')
  // currentColor no lo resuelve librsvg: se reemplaza por el color final.
  return m[1].replaceAll('currentColor', BLANCO)
}

/** Reenvuelve el glifo a un lienzo cuadrado de `lado` px. */
function svgDelGlifo(lado) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 24 24">${innerDelGlifo()}</svg>`
  )
}

/** Lado real del dibujo (sin el padding del viewBox), en px de `lado`. */
async function medirGlifo() {
  const { info } = await sharp(svgDelGlifo(LADO_MEDICION))
    .trim()
    .toBuffer({ resolveWithObject: true })
  if (!info.width || !info.height) throw new Error('El glifo.svg está vacío')
  return { ancho: info.width, alto: info.height }
}

/**
 * Escala el glifo para que su lado mayor ocupe `fraccion` del lienzo, y lo
 * centra. Se respeta la proporción real del dibujo.
 */
async function glifoEscalado(medida, lado, fraccion) {
  const escala = (lado * fraccion) / Math.max(medida.ancho, medida.alto)
  const w = Math.max(1, Math.round(medida.ancho * escala))
  const h = Math.max(1, Math.round(medida.alto * escala))
  const glifo = await sharp(svgDelGlifo(lado))
    .resize(w, h, { fit: 'fill' })
    .png()
    .toBuffer()
  return { glifo, w, h, left: Math.round((lado - w) / 2), top: Math.round((lado - h) / 2) }
}

/**
 * SVG de la forma de fondo.
 * @param {'redondeado'|'circulo'|'lleno'} forma
 * `lleno` cubre todo el lienzo; las otras dos son figuras centradas sobre el
 * lado corto (en un lienzo cuadrado —el launcher— eso es el lado entero).
 */
function svgFondo(ancho, alto, { forma, radio = 0.2 }) {
  const lado = Math.min(ancho, alto)
  const cx = ancho / 2
  const cy = alto / 2
  let formaSvg
  if (forma === 'circulo') {
    formaSvg = `<circle cx="${cx}" cy="${cy}" r="${lado / 2}" fill="${VERDE}"/>`
  } else if (forma === 'redondeado') {
    const r = Math.round(lado * radio)
    formaSvg = `<rect x="0" y="0" width="${lado}" height="${lado}" rx="${r}" ry="${r}" fill="${VERDE}"/>`
  } else {
    formaSvg = `<rect x="0" y="0" width="${ancho}" height="${alto}" fill="${VERDE}"/>`
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${formaSvg}</svg>`
  )
}

async function escribir(destino, buffer) {
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, buffer)
}

// ---------------------------------------------------------------- launcher

/**
 * @param {object} medida  resultado de medirGlifo()
 * @param {number} lado    lado del lienzo en px
 * @param {'redondeado'|'circulo'|'transparente'} forma
 */
async function iconoLegacy(medida, lado, forma) {
  const { glifo, left, top } = await glifoEscalado(medida, lado, PROP_LEGACY)
  const fondo = await sharp(svgFondo(lado, lado, { forma })).png().toBuffer()
  return sharp({ create: { width: lado, height: lado, channels: 4, background: '#00000000' } })
    .composite([{ input: fondo, left: 0, top: 0 }, { input: glifo, left, top }])
    .png()
    .toBuffer()
}

/** El fondo del ícono adaptativo lo pone el sistema; el glifo va con alfa. */
async function foregroundAdaptativo(medida, lado) {
  const { glifo, left, top } = await glifoEscalado(medida, lado, ZONA_SEGURA)
  return sharp({ create: { width: lado, height: lado, channels: 4, background: '#00000000' } })
    .composite([{ input: glifo, left, top }])
    .png()
    .toBuffer()
}

// ------------------------------------------------------------------ splash

async function splash(medida, ancho, alto) {
  const lado = Math.min(ancho, alto)
  // El glifo se dimensiona contra el lado corto y se centra en el lienzo
  // completo, así queda igual de equilibrada en vertical que en horizontal.
  const { glifo, w, h } = await glifoEscalado(medida, lado, PROP_SPLASH)
  const fondo = await sharp(svgFondo(ancho, alto, { forma: 'lleno' })).png().toBuffer()
  return sharp(fondo)
    .composite([{ input: glifo, left: Math.round((ancho - w) / 2), top: Math.round((alto - h) / 2) }])
    .png()
    .toBuffer()
}

// ----------------------------------------------------------------- favicon

/**
 * Envuelve PNGs en un contenedor ICO. sharp no escribe .ico, y el formato
 * acepta entradas comprimidas como PNG (Windows Vista en adelante), que es
 * justo lo que hacemos.
 */
function icoDesdePngs(entradas) {
  const dir = Buffer.alloc(16 * entradas.length)
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reservado
  header.writeUInt16LE(1, 2) // 1 = icono
  header.writeUInt16LE(entradas.length, 4)

  let offset = 6 + 16 * entradas.length
  entradas.forEach(({ png, ancho, alto }, i) => {
    const o = i * 16
    dir[o] = ancho & 0xff // 0 significaría 256
    dir[o + 1] = alto & 0xff
    dir[o + 2] = 0 // sin paleta
    dir[o + 3] = 0 // reservado
    dir.writeUInt16LE(1, o + 4) // planos de color
    dir.writeUInt16LE(32, o + 6) // bits por píxel
    dir.writeUInt32LE(png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += png.length
  })
  return Buffer.concat([header, dir, ...entradas.map(e => e.png)])
}

async function favicon(medida) {
  const entradas = []
  for (const lado of [16, 32, 48]) {
    const { glifo, left, top } = await glifoEscalado(medida, lado, PROP_FAVICON)
    const fondo = await sharp(svgFondo(lado, lado, { forma: 'redondeado' })).png().toBuffer()
    const png = await sharp(fondo)
      .composite([{ input: glifo, left, top }])
      .png()
      .toBuffer()
    entradas.push({ png, ancho: lado, alto: lado })
  }
  return icoDesdePngs(entradas)
}

// -------------------------------------------------------------------- main

async function main() {
  const medida = await medirGlifo()
  console.log(
    `glifo medido: ${medida.ancho}x${medida.alto} px dentro de ${LADO_MEDICION} `
    + `(proporción ${(medida.ancho / medida.alto).toFixed(3)})`
  )

  let n = 0
  for (const { dir, f } of DENSIDADES) {
    const base = join(RES, `mipmap-${dir}`)

    await escribir(
      join(base, 'ic_launcher.png'),
      await iconoLegacy(medida, Math.round(LEGACY_DP * f), 'redondeado')
    )
    await escribir(
      join(base, 'ic_launcher_round.png'),
      await iconoLegacy(medida, Math.round(LEGACY_DP * f), 'circulo')
    )
    await escribir(
      join(base, 'ic_launcher_foreground.png'),
      await foregroundAdaptativo(medida, Math.round(ADAPTATIVO_DP * f))
    )
    n += 3
    console.log(`  mipmap-${dir}: ${Math.round(LEGACY_DP * f)}px legacy / ${Math.round(ADAPTATIVO_DP * f)}px adaptativo`)
  }

  for (const [dir, ancho, alto] of SPLASH) {
    await escribir(join(RES, dir, 'splash.png'), await splash(medida, ancho, alto))
    n++
  }
  console.log(`  splash: ${SPLASH.length} archivos`)

  // Ícono del splash de Android 12+.
  //
  // El sistema lo muestra a 240dp de ancho real: en una pantalla de 440dpi
  // eso son ~660px, y el foreground del launcher solo llega a 432px
  // (xxxhdpi). Quedaba visiblemente borroso. Un único archivo en nodpi, bien
  // grande, se muestra sempre nítido: el sistema lo reduce si hace falta.
  await escribir(
    join(RES, 'drawable-nodpi', 'splash_icon.png'),
    await foregroundAdaptativo(medida, SPLASH_ICON_PX)
  )
  console.log(`  splash_icon: ${SPLASH_ICON_PX}px (nodpi)`)

  await escribir(FAVICON, await favicon(medida))
  console.log('  public/favicon.ico: 16/32/48')

  console.log(`\n${n + 2} archivos escritos. Recompilá con \`pnpm android:build\`.`)
}

main().catch((err) => {
  console.error('Error generando los iconos:', err.message)
  process.exit(1)
})
