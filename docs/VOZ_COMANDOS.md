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

## Limitaciones conocidas

- La auditoría central es best-effort en línea: si el envío falla o no hay
  red, el proof queda solo local y no se encola para reintentar.
- La política de retención está definida (30 días, menos de 3 intentos, plantilla
  única) en `server/utils/vozEventos.ts`; falta programarla o exponerla en UI.
- El comportamiento del STT nativo sin conexión depende del paquete de idioma
  offline del dispositivo y debe probarse en modo avión.
