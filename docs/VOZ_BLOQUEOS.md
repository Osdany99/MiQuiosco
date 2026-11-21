# Bloqueos / limitaciones de voz

## P3.5 - Ganancia del día con app cerrada (nativo)

**Estado:** documentado, pendiente de implementación nativa.

La ganancia del día ahora sale del cuadre cerrado o, si el cuadre está abierto,
de la ganancia fuera de cuadre (ventas directas + deudas directas + mermas),
alineada con la gráfica. Este cálculo se resuelve en la capa JS al consultar
por voz con la app abierta.

Con la app cerrada, `VozEscuchaService.java` responde desde `voz_snapshot.db`.
El snapshot actual expone `resumen.gananciaHoy`, pero no incluye origen de
cuadre/abierto ni recalcula contra cuadres. Mientras no se implemente el cálculo
nativo:

- La consulta de ganancia con app cerrada puede no reflejar cuadre cerrado/abierto.
- Solución segura: implementar `ConsultaGanancia` nativa o enriquecer snapshot con
  origen/monto ya calculado por JS y hacer que el servicio nativo lo respete.
- No cambiar comportamiento nativo sin prueba en APK; este punto queda fuera del
  bundle OTA.

Decisión 2026-11: dejar documentado, no tocar Java en esta fase.

## P3 - Cuadres cerrados con ganancia == null (legado)

**Estado:** decisión tomada, no implementar fallback de estimación en voz.

La gráfica (`filasGananciaCuadre` en `app/utils/graficas.js`) estima cuadres
viejos sin `ganancia` congelada usando `precioVentaUsado - precioCompraActual`.
La voz no replica esa estimación: omite esos cuadres para no inventar cifras ni
cargar el libro completo. Supuesto: datos reiniciados desde v2.4.21, no deben
existir cuadres legacy. Si reaparecen, revisar esta decisión.
