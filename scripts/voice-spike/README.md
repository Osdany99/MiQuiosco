# Voice Spike — MiQuiosco (Fase 0)

Objetivo: medir viabilidad de STT para comandos de voz en ambiente real ANTES de invertir en MVP.
No se toca `app/`. Solo este directorio.

## Catalogo de productos (DB real, 12 filas activas)
El DB actual tiene solo 12 productos activos en quiosco, varios de prueba E2E.
Para benchmark cubrimos todo el catalogo disponible con los nombres reales (evitar inventar).
Fuente: `postgres-mcp` / tabla `productos` (puesto_id único `00000000-0000-0000-0000-000000000002`).
Ver `catalog.json`.

Nota: si al correr el negocio tiene >40 productos en prod, repetir export con el query del plan.

## 3 motores a comparar
1. STT on-device (Android `SpeechRecognizer`: base del plugin capacitor-community).
2. Google Speech API online (plugin con red disponible).
3. Vosk mini / sherpa-onnx (solo si offline < 60% slot acc / p95 > 2s). Almacenar tamaño APK.

## Procedimiento (baseline, 3-4 dias)
1. Grabar ambiente real del quiosco (30 s de ruido, ambiance) para juego de audio superpuesto.
2. Reclutar 4-6 locutores (hombres/mujeres/jovenes), cada uno dice 60-80 frases estratificadas.
3. Ejecutar harness web (`index.html`) sobre los 3 motores si aplica.
4. Registrar por cada engine × modo (online/offline):
   - WER
   - Intent accuracy
   - Slot accuracy (producto/cantidad/precio/ubicacion/tipo/cliente)
   - Latencia p50/p95 (liberar botón → transcript final)
   - Tasa de edición/cancelación en draft simulado
   - Duplicados
   - Éxito offline real
   - Tma (tiempo hasta confirmar)
   - APK delta
5. Reportar en `report.md` (generar manual o editando este README) y tomar go/no-go.

## Go/No-Go numericos
- Offline slot acc >= 60% + p95 < 1.5s → Fase 1 con SpeechRecognizer basico.
- Offline < 60% o p95 > 2s → sprint Vosk mini.
- Online best-effort >= 90% intent + 85% slot → usable como online-best; si no, bajar scope (1 producto + cantidad).
- NUNCA bundle Whisper en Fase 0.

## Web Speech baseline
```
npm install (no dependencies; static files)
# open index.html in Chrome/Edge; allow mic
```
Web Speech API depende del navegador y frecuentemente de red → no asumir paridad con Android.

## Android baseline
- Agregar `@capacitor-community/speech-recognition` en sandbox (no app/), apk rebuild.
- URL de prueba hold-to-talk Android real dispositivo.
- Ver metrics reales offline (modo avion).

## Protocolo de fuerza mayor
- Si plugin falla offline → anotar engine fallado y activar plan B (Vosk mini).
- Si acentos cargan mal → ampliar frases con terminos locales ("maní", "pan").
- Si hombrr/mujer difieren >20% → considerar TTS y voice profile.

## Inputs para Fase 1 (si go)
- catalog.json
- phrases.json (60-80 frases generadas por locutor)
- matriz metricas por engine
- seleccion del motor recomendado