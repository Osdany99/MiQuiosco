# Comandos de voz — MiQuiosco

## Contrato de dos fases
1. `resolverComando(transcript, lexico)` → `{ comando, confianza, reasons }`.
2. `extraerSlots(comando, transcript, lexico)` → slots propios del comando.

Soportados: `venta_directa`, `consulta_stock`, `navegacion`, `desconocido`.

## Cómo añadir un comando
1. Clasificarlo en `resolverComando` con su razón y confianza.
2. Crear un extractor propio en `extraerSlots`; no reutilizar el de venta.
3. Actualizar el schema discriminado `shared/schemas/voiceCommand.js`.
4. Implementar el handler en `useVentaPorVoz`.
5. Añadir frases de referencia y tests en `tests/voz.test.js`.

## Flujo del léxico remoto (Fase B)
Contadores de motivos sin texto primero; plantillas enmascaradas después.

## Privacidad
Nunca sale texto crudo de voz al servidor. Solo plantillas enmascaradas tras umbral de repetición y sin nombres.
