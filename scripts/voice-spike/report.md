# Voice Spike — Reporte (Fase 0)

## Resultados reales (dispositivo Redmi, español)

### Engine nativo (SpeechRecognizer, vía `VoiceRecognitionNativePlugin`)

Muestra (10 frases):

| # | Esperado | Transcript | Confianza | Latencia (ms) |
|---|---|---|---:|---:|
| 1 | anota un pan | anota un pan | 0.9479729533195496 | 3790 |
| 2 | anota cinco panes | anota cinco panes | 0.9432504773139954 | 3480 |
| 3 | vende un pan normal | vende un pan normal | 0.9479728937149048 | 4095 |
| 4 | anota dos panes en quiosco | anota dos panes en kiosco | 0.9479728937149048 | 5481 |
| 5 | vende un jk (jkf) | vende un jk | 0.9479729533195496 | 4375 |
| 6 | anota un edite | anota un edite | 0.9255307316780090 | 4451 |
| 7 | anota un test edit | anota un test edit | 0.8857372403144836 | 4305 |
| 8 | anota un pan a precio de diez | anota un pan a precio de 10 | 0.9479728341102600 | 4532 |
| 9 | anota un pan regalo | anota un pan regalo | 0.9479728937149048 | 3960 |
| 10 | anota un pan a Don Juan | anota un pan a Don Juan | 0.9479728341102600 | 4517 |

Métricas (online):
- Intent accuracy: 10/10 = 100%
- Slot accuracy: 10/10 (producto fuzzy cercano en “jk”/“j kf”)
- WER: ~0.0 (solo variaciones ortográficas y 1 dígito numérico)
- Confianza: 0.885–0.948 (media alta)
- Latencia p50: ~4.3s
- Latencia p95: ~5.5s
- Duplicados: 0
- Errores: sin errores en 10 intentos online

### Offline
- **Offline no funciona**: siempre error (sin red/no match/speech timeout).
- No se rescata al instalar paquetes locales de voz en este dispositivo dentro de la prueba.
- Nota importante: el baseline online es excelente y el principal riesgo era offline.

### Go/No-Go
- Go/No-Go numéricos (online-only): **GO** — online intent 100%, slot 100%, WER ~0.
- Go/No-Go (offline slot acc ≥60% + p95 <1.5s): **NO-GO** — offline falla siempre.

### Veredicto y ajuste de plan
- Usar una estrategia **online best-effort + chips fallback** (sin STT offline pesado).
- Optimizar latencia real antes de productizar (inferir sugerencias + pre-warm SpeechRecognizer, o batching de términos).
- Aplazar Vosk/whisper a backlog hasta conectividad en pruebas; si los usuarios quieren offline real, solo entonces costear Vosk mini.
- Biometría, TTS y prefill de formularios siguen en plan; shorten/save changes in branch.
- Roles, idempotencia UUID y audit log no cambian.

## Notas de campo
- Frases cortas de 4–6 palabras.
- El producto “jkf” (nombre irregular) se distorsiona a “jk” pero still fuzzy-matches ≤2.
- “quiosco” se reconoce como “kiosco”: fuzzy top-3 + selector manual.
- La red encendida fue necesaria para todo.
- Latencia de red dominante; posible estrategia de poseer un buffer/audio dowlink.
