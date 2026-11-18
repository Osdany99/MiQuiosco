# Voice Spike — Reporte (Fase 0)

Completar por motor y por locutor. Guardar como `report.md` al finalizar.

## Matriz de resultados

| Engine | Modo (online/offline) | WER | Intent acc | Slot: producto | Slot: cantidad | Slot: ubicacion | Slot: tipo | Latencia p50 (ms) | Latencia p95 (ms) | Edit/cancel (%) | Duplicados | Success offline | Tma (s) | APK delta |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| SpeechRecognizer nativo | online | | | | | | | | | | | | | |
| SpeechRecognizer nativo | offline | | | | | | | | | | | | | |
| Google Speech API (plugin online) | online | | | | | | | | | | | | | |
| Vosk mini (contingencia) | offline | | | | | | | | | | | | | |

## Frases medidas (n = ...)
- 60-80 frases estratificadas por locutor.
- Varios (4-6 locutores) y ruido real del quiosco superpuesto.

## Go/No-Go
- [ ] Offline slot acc >= 60% + p95 < 1.5s
- [ ] Online best-effort >= 90% intent + 85% slot
- [ ] 0 duplicados en prueba de repeticion rapida
- [ ] Permiso denegado no rompe flow (fallback chips)

## Veredicto
- Go: Fase 1 con motor definitivo
- No-go: sprint Vosk mini (3-4 dias) o bajar alcance del MVP

## Notas de campo
(auto)
- Diferencias por sexo/edad:
- Productos que fallan cronomo:
- Frases que deben añadirse a diccionario de sinónimos: