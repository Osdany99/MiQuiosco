# Íconos de la app

`glifo.svg` es la **única fuente** de todos los gráficos de MiQuiosco: el ícono
del launcher, el splash y el favicon web se derivan de ese archivo.

## Cambiar el ícono

1. Editar `glifo.svg` (viewBox 24×24, el mismo trazo de los íconos de lucide que
   usa la app).
2. `pnpm iconos`
3. `pnpm android:build`

El paso 3 no es opcional: los PNGs se escriben directo en
`android/app/src/main/res/`, así que Gradle no se entera solo.

## Detalles que conviene saber

- **El script no mide el dibujo a ojo.** Rasteriza el SVG y le pasa `trim()` a
  sharp para obtener el bounding box real de la tinta, y de ahí escala y centra.
  Por eso no importa si el path queda descentrado en el viewBox.
- **Los colores no están en el SVG.** El glifo usa `currentColor` y
  `scripts/generar-iconos.mjs` lo reemplaza por blanco; el fondo verde de marca
  (`VERDE` en el script) también sale de ahí. Para cambiar el color, tocar el
  script y no el SVG.
- **Android 12+ ignora los PNGs del splash** y usa
  `windowSplashScreenBackground` + `windowSplashScreenAnimatedIcon`
  (`res/values-v31/styles.xml`). Por eso el ícono del splash se genera aparte,
  en `drawable-nodpi/splash_icon.png` a 1536px: el sistema lo muestra a 240dp y
  con un PNG más chico quedaba borroso.
