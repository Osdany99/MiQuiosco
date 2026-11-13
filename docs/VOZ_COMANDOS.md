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

## Dock global y permisos

El micrófono del layout principal (`app/layouts/default.vue`) está disponible en
todas las rutas con layout `default`; no está limitado a `/quiosco` y `/almacen`.

La ubicación activa se decide así:

1. En `/quiosco` manda **quiosco**.
2. En `/almacen` e `/inventario` manda **almacén**.
3. En cualquier otra ruta se usa la primera ubicación cuyo permiso de voz tenga
   el usuario (`acciones.quiosco.voz`, luego `acciones.almacen.voz`).
4. Si no hay permiso explícito, se usa **quiosco** como último recurso.

Las páginas de `/admin/*` usan otro layout y no muestran el dock.

## Resolución de la ubicación de venta

`resolverUbicacion(slots, ubicacionVista, { permitirConflicto })` decide dónde se
registra una venta:

- **Sin ubicación dicha** → se usa la ubicación de la vista/instancia activa
  (no se asume almacén).
- **Misma ubicación** → sin conflicto.
- **Ubicación distinta dentro de inventario** → `conflicto: true`; la UI rechaza
  y pide abrir la venta desde la ubicación correcta.
- **Fuera de inventario** → se respeta la ubicación dicha sin conflicto; el
  formulario la muestra antes de confirmar.

Ejemplos:

| Ruta | Comando | Resultado |
|---|---|---|
| `/quiosco` | “vende 5 panes” | venta de quiosco |
| `/almacen` | “vende 5 panes” | venta de almacén |
| `/deudas` | “vende 5 panes” | venta de la ubicación activa |
| `/deudas` | “vende 5 panes del almacén” | venta de almacén, sin conflicto |
| `/quiosco` | “vende 5 panes del almacén” | conflicto (abrir desde almacén) |

## Auto-disparo `?voice=1`

El deeplink/widget `?voice=1` solo dispara el micrófono en rutas de inventario
(`/quiosco`, `/almacen`, `/inventario`). Fuera de inventario no hace nada; el
dock manual sigue disponible. Solo consume el disparo la instancia de la
ubicación visible, para no abrir dos reconocedores a la vez.

## Modo PRO (venta sin tocar el dispositivo)

Disponible solo para `jefe` y `super_admin`. Se activa en Ajustes y cambia el
flujo de una venta por voz:

1. El comando abre el formulario de venta precargado.
2. El dispositivo dice **“Diga sí para confirmar.”** y vuelve a escuchar.
3. Si detecta una afirmación, registra la venta sin tocar la pantalla.
4. Si detecta una negación, cierra el formulario y dice **“Cancelado.”**.
5. Si no hay respuesta en el tiempo configurado, deja el formulario abierto y
   dice **“Sin respuesta, confirme manualmente.”**.

### Tiempo de espera

Configurable en Ajustes: **3, 5, 8 o 10 segundos**, por defecto **5 s**. Se
guarda en `Preferences` con la clave `voice.ceroToques.timeoutMs` (acotado entre
3000 y 10000 ms). Controla cuánto tiempo el micrófono espera el “sí” antes de
caer al modo manual.

### Frases aceptadas

La confirmación es estricta (`app/utils/voice/confirmacion.js`): solo se aceptan
frases claras y completas.

- Afirman: `sí`, `sí por favor`, `sí claro`, `si señor`, `claro`, `vale`, `ok`,
  `dale`, `adelante`, `correcto`, `confirmo`, `exacto`, `de acuerdo`,
  `perfecto`, `listo`.
- Niegan: `no`, `no por favor`, `no gracias`, `mejor no`, `cancela`, `cancelar`,
  `espera`, `detente`, `para`, `nada`.
- Se rechazan frases ambiguas como `sí pero no`, `si tengo`, `sí mañana` o
  `sí luego`: ante la duda se cae al modo manual.

## Proof local (auditoría)

Cada intento de auto-confirmación deja un registro en
`app/utils/voice/proofs.js`:

- Se guarda en `Preferences` (`voice.proofs`) con fallback a `localStorage`.
- Se conservan los últimos **50** registros.
- Campos: `ts`, `comando`, `productoId`, `productoNombre`, `cantidad`,
  `ubicacion`, `modo`, `confianza` del STT y `outcome`
  (`auto-confirmado`, `cancelado` o `abandonado`).
- No guarda audio ni texto crudo de voz.

Por defecto es una auditoría local; cuando hay red, cada proof se sube de forma
best-effort a `voz_confirmaciones` (tabla `voz_confirmaciones`, endpoint
`POST /api/voz/confirmaciones`) para poder consultarlo centralmente. La cola
offline (subirlo al volver la red si el primer intento falló) queda pendiente.

## Caché de catálogo

`useVentaPorVoz` cachea el catálogo en memoria durante **2 minutos** para no
llamar a la API en cada comando:

- La clave incluye puesto, modo de conexión, ubicación y si es catálogo de venta
  (`soloVendibles`) o completo.
- La venta en quiosco excluye productos no vendibles; `consulta_stock` usa el
  catálogo completo.
- La caché se limpia al cambiar de modo de conexión y después de guardar una
  venta.

## N-best

El reconocedor puede devolver varias transcripciones alternativas
(`alternativas` en `useVoiceCommand`). Para venta y consulta de stock se evalúa
cada alternativa con el mismo emparejador y se elige la mejor con
`elegirAlternativa` (`shared/voz/gramatica.js`). Navegación se acepta
directamente. Si no hay margen suficiente entre alternativas, se conserva la
transcripción base.

## Léxico remoto (Fase B)

Contadores de motivos sin texto primero; plantillas enmascaradas después. El
panel `/admin/voz` muestra los eventos no reconocidos agrupados por plantilla y
permite marcarlos como resueltos o descartados. El filtro por estado se aplica
en SQL y está indexado por `(estado, ultimo_en)`.

## Voz de respuesta (TTS) vs reconocimiento (STT)

Son dos subsistemas independientes de Android y **no comparten selector**:

| | TTS — *hablar* | STT — *entender* |
|---|---|---|
| API nativa | `TextToSpeech` (`TtsNativePlugin`) | `SpeechRecognizer` (`VoiceRecognitionNativePlugin`) |
| Ajuste en la app | Desplegable **Voz de respuesta (hablar)** | Solo lectura: **Reconocimiento (entender)** |
| Qué lo determina | La voz de síntesis instalada | El motor STT, su paquete offline y la red |
| Afecta a | Cómo la app lee el resultado | Qué tan bien entiende lo que dices |

Elegir una voz en el desplegable **no cambia** el reconocimiento: `startListening()`
siempre pide `language: 'es-ES'` y nunca lee `tts.vozUri`. Que una voz "suene"
con *Probar voz* no dice nada sobre el micrófono.

El paquete de **reconocimiento** sin conexión es una descarga distinta del paquete
de **síntesis** offline: tener una voz offline en la lista no implica tener STT
offline.

## Diagnóstico del reconocimiento

En **Ajustes → Reconocimiento (entender)** se muestra:

- **Motor**: componente del reconocedor por defecto (`Settings.Secure.voice_recognition_service`).
- **En el dispositivo**: si existe reconocimiento on-device (Android 12 / API 31+).
- **Servicios**: cuántos servicios responden a `ACTION_RECOGNIZE_SPEECH`.

Al pulsar **Probar micrófono**, si falla, el aviso incluye el **código nativo**
(`Código 11`, `Código 13`, …) para identificar la causa. Además el plugin escribe
en logcat con la etiqueta `MiQuioscoSTT`:

```bash
adb logcat -s MiQuioscoSTT
```

Cadena de intentos del plugin (`start`):

La app elige el **motor de reconocimiento** según si hay acceso real a
Internet (`hayInternet`, comprobación ligera a `generate_204` con 4 s de
timeout), no solo si hay interfaz WiFi/datos (`hayRed`):

- **Con Internet real** (`hayInternet = true`): motor **Google**
  (`VoiceRecognitionNative`). Plan: idioma + online → idioma + on-device (si
  está disponible) → idioma + offline → sin idioma + online. Si Google falla
  por completo, se hace **fallback a Vosk** antes de reportar error.
- **Sin Internet real** (`hayInternet = false` o desconocido): motor **Vosk**
  empaquetado (`VoskVoice`, modelo `vosk-model-small-es-0.42`, 39 MB,
  Apache 2.0). No requiere que el usuario descargue ningún paquete de voz.

El orden depende de la red porque el modelo offline puede devolver un texto
válido pero malo: si no hay error, el plan no llegaría nunca al motor online.
Solo se reintenta ante errores `12`, `13`, `11`, `2` y `4`, con una pausa de
300 ms y **fuera** del callback `onError` (recrear el reconocedor dentro de su
propio callback provoca errores espurios como `SERVER_DISCONNECTED`). Se reporta
el **primer** error, que es el accionable (p. ej. `13` = falta el paquete offline).

> `hayRed` (de `useSync()`) solo indica que hay interfaz de red conectada, no
> que se pueda alcanzar un servidor. Una WiFi sin internet da `hayRed = true`
> pero `hayInternet = false`, y la app usa Vosk en lugar de Google.

Márgenes de silencio: 4,5 s para `COMPLETE` / `POSSIBLY_COMPLETE` y 800 ms de
mínimo de voz, para que una pausa corta no cierre la frase a mitad (en offline se
observaba «vende un refresco» → «vende un»).

### Tiempos de espera (JS)

- **Por intento**: 20 s sin ninguna señal del motor (`start`, `ready`,
  `partial`…). Se reinicia con cada evento, así que no corta una frase en curso.
- **Tope absoluto**: 45 s para toda la escucha (incluye reintentos del plugin).
- Si vence el reloj, se registra `stt.timeout` y **no** se rescata el parcial:
  en ese punto está truncado y aceptarlo daría un comando incompleto.

`microListo` (la UI de "Habla ahora") solo está en `true` tras `stt.ready`; pasa
a `false` en `stt.start`, `stt.retry`, `stt.error` y `stt.end`. Antes se quedaba
en `true` con el micrófono muerto mientras el plugin reintentaba en silencio.

### Rescate de la voz ya capturada

Si el motor entregó transcripción parcial y **después** falla (11, 2, 4, 13,
incluso 6/7), el plugin resuelve con lo parcial en vez de reintentar y
descartarlo. Solo se exceptúan `RECOGNIZER_BUSY` y `INSUFFICIENT_PERMISSIONS`.
Así, si la interfaz llegó a mostrar lo que dijiste, el comando no se pierde.

### Traza local (Ajustes → Diagnóstico de voz)

La traza **se graba siempre**, sin pulsar nada: un ring buffer de 2000 eventos
con escritura en `localStorage` (`voz.diagnostico.local`) y en `Preferences`
(`voz.diagnostico`). Si Android mata la app o se recarga la página, se recupera
al volver a Ajustes. Además, el plugin nativo guarda sus últimos 200 eventos y
los expone con `VoiceRecognitionNative.diag()`; JS los fusiona al copiar aunque
`notifyListeners` falle. Incluye:

- Eventos nativos: `plan`, `start`, `ready`, `beginning`, `partial`, `end`,
  `result`, `error`, `retry`, `rescue`, `stop`, `finish` (con `t` epoch ms).
- Intento y variante (`offline`, `ondevice`, `online`, `sistema`), código de
  error, texto parcial, alternativas y confianza.
- Eventos TTS (`tts.speak`, `tts.done`, `tts.error`) para distinguir el audio de
  la app del *chime* del reconocedor.
- Interpretación (`voz.interpretar`, `voz.nbest`, `voz.catalogo`,
  `voz.decision`) y modo de conexión (`online`/`local`, `red`).
- Pulsaciones de UI (`stt.ui.probar`, `stt.ui.dock`) para saber si la prueba
  ocurrió dentro de la ventana.

Botones: **Preparar ronda** (limpia y anota modo/red), **Limpiar** y **Copiar**.
Al copiar se vuelca primero el buffer nativo y lo persistido. Es un registro
**local**: nunca se envía al servidor y puede contener texto crudo del dictado.

> `servicios` cuenta los servicios que responden a
> `android.speech.action.RECOGNIZE_SPEECH`; el `<queries>` del manifiesto debe
> declarar esa acción (no `android.speech.RecognitionService`) o sale en 0.

### Motor offline (Vosk)

Cuando no hay acceso a Internet real, la app usa **Vosk** en lugar de Google:

- **Modelo**: `vosk-model-small-es-0.42` (español, 39 MB, Apache 2.0).
- **Empaquetado**: va dentro del APK en `android/app/src/main/assets/vosk/vosk-es.zip`.
  Se descomprime una sola vez a `filesDir/vosk-es/` al primer uso offline.
- **Cero descargas para el usuario**: no necesita instalar paquetes de idioma
  ni configurar nada en Ajustes de Android.
- **Tamaño del APK**: +~50 MB (modelo + librerías nativas arm64).
- **RAM**: ~300 MB mientras el modelo está cargado. Se libera al pasar a
  segundo plano.
- **Calidad**: buena para comandos de venta cortos («vende dos refrescos»,
  «cuánto hay de maní»). Puede confundir nombres propios no comunes
  (p. ej. «Osdany»); para esos casos se recomienda el motor online (Google).

### Frases de prueba

Misma lista en online y en local/offline:

1. «vende dos refrescos»
2. «vende cinco panes del almacén»
3. «cuánto hay de maní»
4. «abre cuadre»
5. «vende un refresco familiar»
6. «hola» (control: no es un comando)

Procedimiento: **Preparar ronda** → probar las frases con el micrófono del dock
(flujo completo) y dos con **Probar micrófono** → **Copiar**.

Para que la ronda offline sea real, apagar **WiFi y datos**, esperar unos
segundos y reabrir la app: con red activa el plan empieza por el motor online y
los resultados no son comparables.


## Privacidad

Nunca sale texto crudo de voz al servidor. Solo plantillas enmascaradas tras
umbral de repetición y sin nombres.

## Verificación manual

1. El dock aparece en `/deudas` y `/settings`.
2. En `/quiosco`, “vende 5 panes” abre la venta de quiosco.
3. En `/deudas`, “vende 5 panes del almacén” abre la venta de almacén.
4. En `/quiosco`, “vende 5 panes del almacén” se rechaza por conflicto.
5. `?voice=1` solo dispara en `/quiosco` y `/almacen`.
6. Modo PRO: “sí” confirma una vez; “no” cancela; el silencio cae al modo
   manual; el timeout elegido persiste tras recargar.
7. El proof queda en `voice.proofs` con producto, cantidad, ubicación y
   resultado.
8. En **Ajustes → Reconocimiento (entender)** se ven motor, on-device y nº de
   servicios.
9. *Probar micrófono* dicta correctamente y, si falla, el aviso muestra el
   código nativo.
10. Cambiar la **Voz de respuesta** no altera el resultado de *Probar micrófono*
    (TTS ≠ STT).

## Limitaciones conocidas

- La auditoría central es best-effort en línea: si el envío falla o no hay
  red, el proof queda solo local y no se encola para reintentar.
- La política de retención está definida (30 días, menos de 3 intentos, plantilla
  única) en `server/utils/vozEventos.ts`; falta programarla o exponerla en UI.
- El comportamiento del STT nativo sin conexión depende del paquete de idioma
  offline del dispositivo y debe probarse en modo avión.
- El selector de **Voz de respuesta** es solo TTS; Android no expone una lista
  de voces de reconocimiento para elegir en la app.
- `ERROR_SERVER_DISCONNECTED` (11) puede ser transitorio: el plugin reintenta la
  cadena completa antes de reportar el primer error.
