# Bloqueos / limitaciones de voz

## P3 - Ganancia del día con app cerrada (nativo)

**Estado:** resuelto por el lado seguro; el cálculo nativo completo sigue pendiente.

Con la app abierta, la ganancia del día sale del cuadre cerrado o, si el cuadre
está abierto, de la ganancia fuera de cuadre (ventas directas + deudas directas
+ mermas). La regla vive en `gananciaCuadreDia` (`shared/voz/dia.js`) y la usa
también `app/utils/graficas.js`: la cifra que se oye y la que se ve en la
pantalla son la misma función.

Con la app cerrada, `VozEscuchaService.java` responde desde `snapshot.json`
leyendo `resumen.gananciaHoy`. Ese campo se calcula solo con las ventas directas
del día, sin cuadres. Para no soltar una cifra que no cuadra:

- `useVozSnapshot.construir()` **quita** `resumen.gananciaHoy` cuando hay un
  cuadre cerrado del puesto en el día. El servicio responde entonces «Abre la
  app para ver la ganancia», que es la verdad.
- Sin cuadre cerrado la cifra fuera de cuadre sí es correcta y se conserva.

Pendiente para una APK futura (fuera del bundle OTA): leer
`resumen.gananciaOrigen`/`gananciaHoy` ya calculados por JS y responder con el
texto de `formatearGanancia`. No cambiar el servicio sin prueba en APK.

Decisión 2026-11: no tocar Java en esta fase de fases 1-5.

## P3 - Cuadres cerrados con ganancia == null (legado)

**Estado:** decisión tomada, no implementar fallback de estimación en voz.

La gráfica (`filasGananciaCuadre` en `app/utils/graficas.js`) estima cuadres
viejos sin `ganancia` congelada usando `precioVentaUsado - precioCompraActual`.
`gananciaCuadreDia` (la base compartida) no estima: cuenta esos cuadres en
`sinGanancia` y no suma una cifra inventada. Supuesto: datos reiniciados desde
v2.4.21, no deben existir cuadres legacy. Si reaparecen, revisar esta decisión.

## P1 - Traspaso con verbo débil

**Estado:** resuelto en el bundle.

«dame 4 manis para el kiosco», «quiero 10 azúcar al kiosco» o «sube 4 manis a
depósito» ya se resuelven como `traspaso`: con destino explícito
(`al/para/hacia/pal/a` + ubicación) la debilidad del verbo no convierte el
movimiento de stock en venta. Sin destino sigue siendo venta («llevar 10
azúcar»).

Límite conocido: `vende 5 panes al quiosco` sigue siendo venta (el verbo fuerte
manda). Es lo correcto: no es un movimiento de almacén.

## F0 - Corpus de regresión

**Estado:** ampliado.

`shared/voz/corpus.json` incluye las 29 frases doradas, las 43 frases reales de
producción, coloquiales con muletillas y ~170 frases de charla. Las que hoy
siguen fallando están marcadas `conocido_fallo`; `tests/vozCorpus.test.js`
obliga a quitar la marca cuando empiecen a pasar.
