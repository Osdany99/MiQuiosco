# Comandos de voz — MiQuiosco

## Contrato de dos fases
1. `resolverComando(transcript, lexico)` → `{ comando, confianza, reasons }`.
2. `extraerSlots(comando, transcript, lexico)` → slots propios del comando.

Soportados: `venta_directa`, `venta_fiada`, `cobro_deuda`, `consulta_stock`,
`consulta_precio`, `consulta_deuda`, `consulta_dia`, `consulta_ganancia`,
`consulta_caja`, `entrada_inventario`, `cambio_precio`, `cuadre_accion`,
`traspaso`, `repetir`, `ayuda`, `desconocido`.

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

`resolverUbicacion(slots)` decide dónde se registra una venta:

- **Sin ubicación dicha** → **almacén**, siempre. También dentro de `/quiosco`:
  lo que se dicta compromete stock del almacén salvo que se pida el quiosco.
- **Ubicación dicha** («del quiosco», «del kiosco», «del almacén») → manda la
  dicha, sin importar en qué pantalla estés.
- Ya **no hay conflicto de ubicación**: la pantalla no decide el destino. El
  formulario muestra la ubicación antes de confirmar, así que el jefe ve de dónde
  sale la mercancía.

Ejemplos:

| Ruta | Comando | Resultado |
|---|---|---|
| `/quiosco` | “vende 5 panes” | venta de **almacén** |
| `/almacen` | “vende 5 panes” | venta de almacén |
| `/deudas` | “vende 5 panes” | venta de almacén |
| `/quiosco` | “vende 5 panes del quiosco” | venta de quiosco |
| `/almacen` | “vende 5 panes del quiosco” | venta de quiosco |

Fiar por voz usa la misma regla (sin ubicación → almacén).

## Auto-disparo `?voice=1`

El deeplink/widget `?voice=1` solo dispara el micrófono en rutas de inventario
(`/quiosco`, `/almacen`, `/inventario`). Fuera de inventario no hace nada; el
dock manual sigue disponible. Solo consume el disparo la instancia de la
ubicación visible, para no abrir dos reconocedores a la vez.

## Venta con confirmación hablada (comportamiento único)

Disponible solo para `jefe` y `super_admin`. Ya **no hay interruptor**: toda
venta por voz funciona igual.

1. El comando abre el formulario de venta precargado.
2. El dispositivo lee la venta **con la ubicación y el importe** («Voy a vender
   2 unidades de Pan de leche del almacén por 20 pesos») y pide **“Diga sí para
   confirmar.”**.
3. Si detecta una afirmación, registra la venta sin tocar la pantalla y cierra.
4. Si detecta una negación, cierra el formulario y dice **“Cancelado.”**.
5. Si no hay respuesta en el tiempo configurado, deja el formulario abierto y
   dice **“Sin respuesta, confirme manualmente.”**.

La ventana de 5 s para decir “cancela” ya **no existe**: una frase abierta al
ambiente del mostrador podía anular una venta real. Un error se corrige desde el
historial, no por voz.

### Anti-eco de la confirmación

El micrófono se abre justo cuando el TTS termina, así que puede oír su propio
anuncio. Tres defensas, en este orden:

1. Se espera el **margen anti-eco** (400 ms) antes de abrir el micrófono.
2. Se pasa como `prompt` **todo lo que se habló** (no solo la pregunta) y se
   descartan las transcripciones que lo repiten.
3. Durante los primeros **700 ms** de escucha, una palabra suelta que ya estaba
   en el anuncio («sí», «confirmar») se trata como eco y se sigue esperando.

Sin la tercera, oír solo el «sí» de «diga sí para confirmar» registraba la venta
sin que el jefe hablara. El resultado (`afirmado/negado/timeout`) queda en la
traza de voz de Ajustes.

### Tiempo de espera

Fijo: **6 segundos**. No se configura en Ajustes (antes había un selector de
3/5/8/10 s que solo añadía dudas, y el servicio nativo ya esperaba 6 s). El
mismo valor vive en `useVoiceZeroTouch.js` (`TIMEOUT_CONFIRMACION_MS`) y en
`shared/voz/dialogo.json` (`tiempos.confirmacion`). Controla cuánto tiempo el
micrófono espera el “sí” antes de caer al modo manual.

Si **Leer en voz alta** está apagado no hay confirmación hablada: la venta abre
el formulario y se confirma con el botón, sin esperar en silencio.

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

### Varias líneas en una frase (solo app abierta)

«Vende 3 panes y 2 refrescos» abre **un solo formulario** con una fila por
producto:

- La frase se parte por comas, «y» y «con». La ubicación y el tipo de venta
  valen para toda la venta; si dos trozos dicen ubicaciones distintas, no se
  adivina.
- **Cada producto debe resolverse sin dudas**. Si uno no aparece, hay varios
  parecidos o no alcanza el stock, la frase vuelve al flujo de una línea: se
  pregunta en vez de inventar una fila.
- «2 panes y 3 panes» es **un renglón de 5**; si los dos precios dictados no
  coinciden, no se mezclan.
- La lectura nombra cada producto y el total: «Voy a vender 3 unidades de Pan y
  2 unidades de Refresco del almacén por 70 pesos. Diga sí para confirmar.»
- El registro es **una sola venta** con varias líneas (FIFO por producto).
- La corrección hablada de cantidad **no aplica** aquí: se corrige en el
  formulario, porque la voz no sabe a qué línea se refiere.
- Con la **app cerrada** el servicio sigue diciendo «De uno en uno, por favor»:
  el buzón no reparte una frase entre varias acciones.

### Comandos asistidos: entrada, precio, cuadre y traspaso

Estos cuatro comandos **nunca escriben**: como mucho prellenan un formulario o
llevan a una pantalla. El jefe confirma con el botón. Ninguno funciona con la
app cerrada (el buzón los ignora: necesitan el formulario delante).

- **Entrada de lote** (solo jefe con `/almacen`): «entraron 20 panes a 10 pesos»,
  «llegaron 5 cajas de leche». Abre **Entrada al almacén** con producto, cantidad
  y costo. Si no se dijo el costo, se usa el **último pagado** y el diálogo lo
  muestra; no se inventa ninguna cifra. Un producto dudoso abre el menú de
  candidatos.
- **Cambio de precio** (solo jefe con `/productos`): «cambia el precio del pan a
  25». Abre el diálogo con el precio actual y el nuevo. El
  `historial_precios` se escribe **al guardar**, no al dictar. Exige la palabra
  «precio»: «pon el refresco a 60» sigue siendo una venta a ese precio.
- **Cuadre** (con permiso de `/cuadre`): «abre el cuadre» / «cierra el cuadre» /
  «cierra y confirma el cuadre». Lleva a `/cuadre` y lee lo que hay en la caja
  (la misma lectura que «cómo va la caja», sin crear nada). Para cerrar hay que
  **escribir el dinero real en caja y pulsar Cerrar cuadre**: la voz no cierra
  el cuadre ni con «cierra y confirma».
- **Traspaso** (solo jefe con almacén y quiosco): «pasa 5 panes del almacén al
  quiosco», «mueve 3 refrescos al quiosco», «transfiere 10 panes al quiosco».
  Abre el traspaso con producto, cantidad y lotes sugeridos (FIFO).
  Si no alcanza el stock del almacén no se abre: lo dice con la cantidad que
  hay. El sentido contrario («del quiosco al almacén») se rechaza con un aviso;
  no se invierte en silencio.

En los cuatro, un producto ambiguo o inexistente se pregunta con el menú de
candidatos y, al elegirlo a mano, se aprende el alias como en una venta.

### Consultas de precio, deudas, «repite» y ayuda (app abierta)

Con la app abierta el intérprete reconoce además:

- **Precio**: «cuánto cuesta el pan», «a cómo está el refresco», «cuánto vale
  una cerveza» → `formatearPrecio`: «Pan cuesta 20 pesos. En quiosco quedan 12.
  En almacén quedan 3.» No deja nada para revisar.
- **Deudas**: «cuánto debe Juan», «las deudas de María», «cuánto me deben»,
  «quién me debe más» → lee el saldo pendiente del puesto (ver más abajo).
- **Resumen del día**: «cómo va el día», «cuánto vendí hoy», «ventas de hoy»,
  «cierre del día» → «Hoy: 12 ventas por 845 pesos. 2 dictados por revisar.»
  Solo el jefe; un trabajador oye que no tiene permiso.
- **Repite**: «repite», «repítelo», «otra vez», «qué dijiste» → vuelve a decir
  la última respuesta de stock, precio o deuda. Nunca repite una venta.
- **Ayuda**: «qué puedes hacer», «ayuda», «qué sabes hacer» → lee qué sabe hacer
  y da un ejemplo.

Los cinco funcionan también **con la app cerrada**, desde el snapshot: el
servicio responde stock, precio, deudas y resumen del día, recuerda la última
respuesta hablada para «repite» y lee la ayuda de `dialogo.json`. Lo que el
servicio no hace es abrir pantallas ni cambiar de ubicación por voz.

## Resumen del día por voz

El cálculo es único y vive en `shared/voz/dia.js`: lo usan la app abierta
(`useVentaPorVoz`) y el snapshot que lee el servicio nativo, así que las dos
respuestas coinciden.

- Cuenta las ventas directas **no anuladas** de hoy (día local) y su importe.
- Los **dictados por revisar** se informan aparte: todavía no se han aplicado,
  así que no suman al importe vendido. Con la app cerrada se suman los del buzón
  nativo (`files/voz/inbox`) que aún no recogió la app.
- Sin ventas dice «Todavía no hay ventas hoy»; nunca «0 ventas por 0 pesos».
- **Solo el jefe**: el resumen es información del cuadre. Un trabajador con
  permiso de voz recibe un aviso, no cifras.
- «cuánto vendí» **sin decir el día** no se contesta (puede ser otro día).
  «Ganancia» y «caja» tienen su propio cálculo (siguiente sección): nunca se
  responde con el importe vendido como si fuera ganancia.

## Ganancia del día y caja por voz

**Ganancia** («cuánto gané hoy», «ganancia del día», «cuánto ganamos hoy»):

- Suma `ventas_directas.ganancia` de las ventas **no anuladas** de hoy: el costo
  FIFO ya congelado en cada venta, no el precio de compra actual.
- La lectura junta las dos cifras: «Hoy ganaste 320 pesos de 845 vendidos.» Si la
  ganancia sale negativa, dice «perdiste». Sin ventas, «Todavía no hay ventas
  hoy, así que no hay ganancia».
- Solo jefe. Con la app cerrada se lee `resumen.gananciaHoy` del snapshot; un
  snapshot viejo sin ese campo pide abrir la app en vez de decir cero.

**Caja** («cómo va la caja», «cuánto hay en caja»):

- Solo con la app abierta: necesita el cuadre, que no viaja en el snapshot.
- Usa el **cuadre abierto** del puesto (si quedó abierto el de ayer, se usa ese)
  y sus líneas, con la misma cuenta que la pantalla: esperado = ventas − regalo
  − descuento; efectivo esperado = esperado − fiado − transferencias.
- **Nunca crea un cuadre ni guarda nada**: solo lee. Si no hay cuadre abierto
  dice «No hay un cuadre abierto».
- Si el fiado o las transferencias superan lo apuntado, el cuadre está
  incompleto: lo dice en vez de leer un efectivo negativo.
- Solo jefe.

## Cobrar deudas por voz (app abierta y cerrada)

Cierra el ciclo del fiado: **consulta**, **fiar** y ahora **cobrar**.

- Frases: «cobra 200 a Yunior», «cobra la deuda de María», «cobra todo a Juan»,
  «abona 50 a Juan», «Yunior me pagó 100».
- El importe puede ser **total** («cobra la deuda de…») o **parcial**. Si se pide
  más de lo que debe, no se cobra: «Yunior debe 2210 pesos; no puedo cobrar
  5000».
- Con **varias deudas** del mismo cliente se cobra **la más antigua primero**
  (FIFO) y la lectura lo dice: «Cobro 200 pesos a Yunior. Le quedan 2110 pesos.
  Diga sí para confirmar.»
- **Forma de pago**: efectivo por defecto; «por transferencia» si se dice.
- Se permiten **2 correcciones** de importe («no, eran 150») antes de confirmar.
- Solo **jefe** y con permiso de `/deudas`. Sin lectura de voz no se cobra nada.
- Cobrar no toca el cuadre (igual que el botón de `/deudas`): baja el saldo y
  deja el pago registrado.
- **«Cobra 2 panes» sigue siendo una venta**: sin deuda ni importe, el verbo se
  interpreta como venta directa.
- «cuánto pagó Juan» no se contesta (es una consulta que aún no existe): mejor
  silencio que una cifra inventada.
- Con la **app cerrada** (`IntencionCobro`) el diálogo es el mismo y, al «sí»,
  deja **un pago por deuda** en `files/voz/inbox`. En **Por revisar** cada pago
  aparece como **Cobro** con su cliente, monto y forma de pago; **Registrar**
  aplica el cobro y **Editar** no existe (se corrige en `/deudas`).
- El reparto FIFO se hace antes de escribir: la app no recalcula saldos con una
  foto vieja.

## Fiar por voz (app abierta y cerrada)

Crea una **deuda directa** (fuera de cuadre), igual que el formulario de
`/deudas`: descuenta inventario y congela el costo FIFO en la propia cuenta.

- Frases: «fía dos panes a Juan», «anota fiado 2 refrescos a Yunior», «vende
  fiado un pan a Ana».
- **El precio es siempre el del catálogo**: no se dicta precio en un fiado (en
  una deuda un precio mal oído es demasiado caro de corregir).
- **Cliente**: si el nombre coincide con uno solo, se usa. Si hay varios
  parecidos —o solo se dijo el nombre de pila— se leen hasta 3 y se pide el
  nombre completo; por un nombre de pila nunca se elige.
- **Producto**: si hay varios parecidos se ofrece el menú de hasta 3 opciones
  («la uno»/«la dos») y el fiado continúa con el elegido.
- La confirmación es hablada: «Voy a fiar 2 unidades de Pan a Yunior por 40
  pesos. Diga sí para confirmar.» Solo con un «sí» se registra. «No, eran tres»
  corrige la cantidad (máx. 2) y relee.
- Con la **lectura de voz apagada** no se fía nada: un aviso lo dice y la deuda
  se hace desde `/deudas`.
- Con la **app cerrada** (`VozEscuchaService` + `IntencionFiado`) el diálogo es
  el mismo y, al «sí», deja la deuda en `files/voz/inbox`. Al abrir la app entra
  en **Por revisar** como **Fiado**, con **Registrar** y **Descartar** (sin
  Editar: el formulario de deuda vive en `/deudas`).
- Lo dictado **no cobra**: un fiado por voz crea la deuda, no recibe pagos.

## Deudas por voz
Se consultan, se pueden **fiar** y **cobrar** por voz (secciones anteriores). La
lógica de la consulta es pura y vive en `shared/voz/deudas.js`; el servicio
nativo la replica en `ConsultaDeuda.java` sobre el resumen que la app deja en el
snapshot.

| Frase | Qué responde |
|---|---|
| «cuánto me deben» | Total pendiente, cuántos clientes y quién es el que más debe. |
| «quién me debe más» | Empieza por el mayor deudor y luego el total. |
| «cuánto debe Juan» | El saldo de Juan y en cuántas deudas. |
| «cuánto debe Ramón» (sin deuda) | «No tengo deudas pendientes de Ramón.» |

- Suma `montoTotal - montoPagado` por cliente e ignora las deudas saldadas.
- «Juan» con «Juanita» y «Juan Pérez» en la lista es **ambiguo**: lee los
  parecidos y pide el nombre completo. Por un solo nombre de pila nunca elige.
- «cuánto debo» **no** se contesta: puede ser una compra del negocio a un
  proveedor y una cifra inventada sería peor que el silencio.
- Requiere permiso de `/deudas`; sin él avisa y no lee cifras.
- Con la app cerrada, el resumen viene de `snapshot.json` (`deudas`), que se
  reescribe al abrir la app y tras cada revisión. Si nunca se ha escrito, responde
  «Abre la app para ver las deudas».

### Corregir la cantidad al confirmar

Si la lectura salió con una cantidad equivocada, el jefe puede corregirla sin
repetir el comando:

- «no, eran tres» · «cambia a cinco» · «son seis» · «pon una docena».

El sistema revalida el stock de la ubicación, actualiza la cantidad, recalcula el
importe y **vuelve a leer la venta** con la nueva cifra. Se permiten **2
correcciones** por venta; a la tercera hay que confirmar a mano. Si la cantidad
nueva no hay stock, se explica el motivo y el formulario queda abierto.

Funciona igual con la app abierta y con la app cerrada (`VozEscuchaService`
revalida contra el snapshot). Solo cambia la **cantidad**: para otro producto o
ubicación se cancela y se dicta de nuevo.

La **caja** («cómo va la caja») es solo con la app abierta: necesita el cuadre y
sus líneas. Con la app cerrada se consultan ventas, ganancia, stock, precios y
deudas; ante una frase de caja el servicio no inventa una cifra.

## Revisión de lo dictado (nada se registra solo)

Las ventas por voz **no escriben la base directamente**: quedan en una cola
local (`acciones_pendientes_voz`) que el jefe confirma en **Por revisar (voz)**
(`/pendientes`). La cola es local al teléfono y no se sincroniza; lo que se
sincroniza es la venta directa que nace al aplicarla.

- Se agrupa por puesto y cada fila dice **quién la dictó** («dictada por X»).
- Se guarda el texto dictado y la confianza del STT para auditar una mala
  interpretación.
- La **fecha de la venta es la del dictado**, no la de confirmación: si el jefe
  revisa al final del día, la venta sigue en el día en que se dijo.
- No caduca por tiempo. Se muestra la antigüedad («hace 5 min», «ayer») y hay un
  **tope de seguridad de 7 días**: pasado ese plazo la acción se archiva sola y
  ya no se puede aplicar.
- Cada fila se puede **Registrar**, **Editar** (abre el diálogo de venta con la
  fecha y el precio dictados) o **Descartar** (queda archivada para auditar).
- Si el STT no entendió el nombre, la fila queda como **«Falta el producto»** y
  ofrece **Asignar producto**: se elige del catálogo de la ubicación destino y se
  conservan la cantidad y el precio dictados. Un dictado no se pierde por un
  nombre mal oído.
- No hay “Confirmar todo”: confirmar una venta es leerla y decidir.
- El stock de la voz descuenta lo pendiente, así que dos dictados seguidos no
  venden las mismas unidades.
- Las acciones cerradas (aplicadas o descartadas) se borran solas pasados
  **30 días**; la tabla local no crece sin límite.

## Escucha con la app cerrada (Android)

En `/pendientes` hay un interruptor **«Escuchar con la app cerrada»** (solo
jefe). El servicio en primer plano **conversa igual que la voz con la app
abierta**, pero el resultado va a la cola de revisión, nunca a la base:

1. «Oye nova» → **«¿Qué puedo hacer por ti?»**.
2. **Consulta** («cuántos panes quedan», «cuánto cuesta el refresco», «cuánto
   debe Juan», «cómo va el día») → responde al momento y no deja nada para
   revisar.
3. **Venta** («vende dos panes») → busca el producto, comprueba stock y **lee la
   venta con la ubicación y el importe**: «2 de Pan de leche del almacén, 20
   pesos. ¿Confirmo?». Solo con un «sí» se anota.
4. **Fiado** («fía dos panes a Juan») → busca cliente y producto, lee «Voy a
   fiar 2 unidades de Pan a Juan por 40 pesos. ¿Confirmo?» y, al «sí», lo deja
   como **Fiado** en la revisión. No crea la deuda por su cuenta.
5. **«Repite»** («repítelo», «otra vez», «qué dijiste») → vuelve a decir la
   última frase que habló el servicio; si aún no ha dicho nada, «No tengo nada
   que repetir todavía». **«Ayuda»** lee qué sabe hacer con la app cerrada.
6. Todo lo demás (charla del mostrador, frases sin verbo de venta) se ignora en
   silencio.

**Ubicación:** una venta dictada sale del **almacén** salvo que se diga «del
quiosco» o «del kiosco». La pantalla no cambia el destino (no hay conflicto de
ubicación).

### Diálogo (mismas reglas que la app abierta)

| Situación | Qué dice | ¿Anota? |
|---|---|---|
| Hay stock libre | «2 de Pan de leche del almacén, 20 pesos. ¿Confirmo?» | Sí, tras «sí» |
| «no» / caduca a los 6 s | «Cancelado» / «No la anoté» | No |
| Hay, pero apartado por ventas por revisar | «Sólo quedan 1 libres de pan: 2 están apartadas por ventas por revisar. No la anoté.» | No |
| No hay de verdad | «No hay stock de pan: 0 en quiosco y 4 en almacén. No la anoté.» | No |
| Falta aquí pero hay en la otra ubicación | «En quiosco no hay; en almacén quedan 4. No la anoté.» | No |
| Varios parecidos o sin nombre | «¿Pan de leche, pan de agua o pan dulce?» | Espera elección |
| Producto no vendible | «Ese producto no se vende suelto.» | No |
| Dos productos en una frase (app cerrada) | «De uno en uno, por favor.» | No |

Tiempos: 8 s para el comando y para la elección, 6 s para la confirmación. Si
se acaba el tiempo, no se anota. Volver a decir «oye nova» reinicia el
diálogo.

La elección se puede decir por **número** («la dos») o por **nombre** («el de
agua»). Los números en palabras («dos», «docena») salen de
`shared/voz/dialogo.json`.

Al abrir la app, `useBuzonVoz` drena el buzón y crea las acciones pendientes.
Los ficheros nuevos vienen **ya resueltos** (`resuelto: true` con producto,
cantidad, precio y ubicación), así que no se reinterpretan: la app solo valida y
guarda. El camino antiguo (transcripción cruda + `resolver()`) queda para
ficheros viejos. El nombre del fichero es el `origenId`, así que reimportar no
duplica.

### Aviso en pantalla mientras dictás

Con la app cerrada hay dos formas de ver que el teléfono te está oyendo:

1. **Notificación viva** (siempre): mientras escucha, la notificación del
   servicio dice «Te escucho: vende dos pan…» con un **vúmetro** que sigue el
   nivel del micrófono. Sirve en el bloqueo y no enciende la pantalla.
2. **Onda sobre el bloqueo** (opcional): **Ajustes → Mostrar la onda al dictar
   con la app cerrada**. Al decir «oye nova» aparece la misma onda del
   dock (tres senos que se mueven con tu voz) con el texto parcial y la
   pregunta del diálogo. Se cierra sola al terminar o al tocarla.

La onda se abre con un **full-screen intent**: Android no permite lanzar
ventanas desde segundo plano por otra vía. Consecuencias reales:

- **Enciende la pantalla** en cada dictado (gasta batería y se ve lo que dictás).
- En **Android 14+** el sistema puede negarlo hasta que se conceda
  «notificaciones a pantalla completa»; el aviso de Ajustes lleva al sitio.
- Si el fabricante la bloquea, no se rompe nada: queda la notificación viva.

El servicio publica nivel y parcial en `VozOnda` (proceso propio, sin WebView),
tanto con Vosk (`getPartialResult()` + RMS del PCM) como con el motor del
sistema (`onRmsChanged` + `onPartialResults`).

### Reservas de la sesión

El snapshot se congela al minimizar, así que dos dictados seguidos verían el
mismo stock. Cada anotación deja una reserva en `files/voz/reservas.json`; las
reservas anteriores al `generadoEn` del snapshot se ignoran (la app ya las
cuenta como pendientes) y `useBuzonVoz` borra el fichero al terminar el drenaje.

### Fuente única de reglas

Verbos, números en palabras, afirmaciones/negaciones, tiempos y textos viven en
`shared/voz/dialogo.json`. `scripts/copiar-voz.mjs` lo copia a
`android/app/src/main/assets/voz/dialogo.json` en cada build (lo llama
`scripts/gradle.mjs`), y el JS lo importa. Si el asset falta, el servicio usa
textos y listas por defecto.

Detalles de diseño:

- **El servicio no interpreta la base ni escribe en ella**: escucha, lee la foto
  del catálogo, decide y habla. Lo único que escribe es el buzón y sus reservas.
- **Se pausa mientras la app está abierta**: el micrófono del dock es el dueño
  del reconocedor; dos sesiones a la vez se pisan (`recognizer_busy`). El
  servicio se arranca en pausa con la app visible (Android 14 no permite iniciar
  un FGS de micrófono desde segundo plano) y abre el micrófono al minimizar.
- La foto (`snapshot.json`) se reescribe al abrir la app, al minimizarla y
  después de cada revisión. Lleva stock **proyectado, real y apartado**; las
  **deudas por cliente con sus cuentas** (id, fecha y saldo), para poder cobrar
  con la app cerrada; y los **clientes** con su id, para fiar.
- La notificación es obligatoria en un servicio en primer plano: muestra el
  estado, abre `/pendientes` y permite detener la escucha.
- **El stock no se promete con el buzón lleno**: mientras haya dictados en
  `voz/inbox` sin recoger, una consulta de stock responde «Hay N dictados sin
  revisar, abre la app» en vez de un número que podría estar prometiendo dos
  veces las mismas unidades. Las consultas de precio sí se contestan siempre.
- **Límite del intérprete nativo**: sólo ventas directas simples. Fiado, cliente
  y precio dictado se resuelven con la app abierta; aquí el precio es el del
  catálogo.

### Motor de reconocimiento (con y sin internet)

El motor lo fija la **configuración de flota** (`/admin/voz-configuracion`), no
un selector por equipo. Los valores y su significado son únicos:

| Motor de flota | App abierta | App cerrada |
|---|---|---|
| `auto` (por defecto) | Google si hay red; Vosk si no | Vosk empaquetado |
| `vosk` | Vosk | Vosk |
| `google` | Google | `SpeechRecognizer` (puede pitar en cada frase) |

El motivo de que `auto` use Vosk con la app cerrada es físico: el
`SpeechRecognizer` del sistema pita cada vez que abre el micrófono y el servicio
abre una sesión por frase, así que en el bolsillo sonaba un pitido cada pocos
segundos. Vosk escucha de forma continua y en silencio.

Vosk reutiliza `files/vosk-es`, la MISMA carpeta que el dock (`VoskModelo`), y
solo extrae el ZIP la primera vez (la notificación dice «Preparando la escucha
offline»). Si el modelo no carga, el servicio cae al motor del sistema y no
vuelve a intentar Vosk hasta el próximo arranque.

Con el motor offline escucha de forma continua: el micrófono se silencia
mientras el TTS habla (`ttsHablando`) para no transcribir su propia voz, y si el
comando no llega tras «Dime» se vuelve a exigir la frase de activación a los
7 segundos.

### Permisos y batería

- **Micrófono** (`RECORD_AUDIO`): obligatorio. Se pide al activar el interruptor.
- **Notificaciones** (Android 13+): se piden junto al micrófono. Sin ellas el
  servicio sigue funcionando, pero no se ve el aviso ni sus botones.
- **Exención de batería**: `/pendientes` avisa con un enlace
  «Permitir en segundo plano» cuando la app sigue optimizada. HyperOS/EMUI matan
  el servicio en minutos si no se concede; el diálogo lo muestra el sistema.
- **Reinicio del teléfono**: `VozBootReceiver` rearma la escucha en **pausa**
  (Android 14 no permite abrir el micrófono desde el arranque). El micrófono se
  activa al minimizar la app por primera vez; hasta entonces la notificación
  recuerda que hay que abrirla.

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
`POST /api/voz/confirmaciones`) para poder consultarlo centralmente.

**Si la subida falla** (sin red, sesión vencida, servidor caído) el proof **no se
pierde**: entra en una cola local (`voice.proofs.cola`, lógica pura en
`app/utils/voice/colaProofs.js`) y se reintenta:

- al abrir la app y cuando **vuelve la red** (`online`) o la app vuelve a primer
  plano;
- de uno en uno, guardando la cola tras cada intento: si la app muere, no se
  repite lo ya subido;
- con un tope de **100** proofs en cola, **20** intentos por proof y **14 días**;
  lo que se pasa se descarta (la copia local sigue en `voice.proofs`);
- sin red no gasta peticiones: la cola espera intacta;
- una **sesión vencida** (401/403) o una APK obsoleta (426) no gastan intentos:
  la cola espera a que el jefe vuelva a entrar;
- una sola pasada a la vez, aunque coincidan el arranque y el evento `online`.

## Caché de catálogo

`useVentaPorVoz` cachea el catálogo en memoria durante **2 minutos** para no
llamar a la API en cada comando:

- La clave incluye puesto, modo de conexión, ubicación y si es catálogo de venta
  (`soloVendibles`) o completo.
- La venta en quiosco excluye productos no vendibles; `consulta_stock` usa el
  catálogo completo.
- La caché se limpia al cambiar de modo de conexión y después de guardar una
  venta.
- Además guarda `versionSaldos` (marca global que sube con cada
  `cargarSaldos()`): si otra pantalla vendió o entró mercancía, la voz no sigue
  ofreciendo stock viejo aunque no hayan pasado los 2 minutos.
- **Stock proyectado**: antes de responder se descuenta lo dictado y aún sin
  revisar (`acciones_pendientes_voz`). La voz dice, por ejemplo, «3, con 2
  pendientes de revisar», así que nunca vende dos veces las mismas unidades.

## Decisión, no efecto: `resolver()` / `ejecutar()`

`useVentaPorVoz` separa lo que decide de lo que escribe:

- `resolver(texto, { sttConfidence, alternativas, vigente })` devuelve una acción
  plana y **no** habla, navega ni escribe. La decisión de venta vive en
  `app/utils/voice/resolverVenta.js` (puro).
- `ejecutar(accion, { gen })` es el único sitio con efectos (abrir el formulario,
  registrar, navegar) y centraliza la auditoría.
- El precio dictado («vende 2 panes a 10») manda sobre el del catálogo. Se
  entiende **con o sin la palabra «pesos»** y en cualquier orden respecto al
  cliente: «vende 2 refrescos a 200 pesos a Juan», «vende 2 refrescos a 200 a
  Juan» y «vende 2 refrescos a Juan a 200» dan el mismo precio.

Esa separación es la que permite reutilizar el mismo intérprete con la app
cerrada.

## N-best

El reconocedor puede devolver varias transcripciones alternativas
(`alternativas` en `useVoiceCommand`). Cada alternativa se evalúa con el mismo
emparejador y se elige la mejor con `elegirAlternativa`
(`shared/voz/gramatica.js`). Si no hay margen suficiente entre alternativas, se
conserva la transcripción base.

## Configuración de flota (Fase C)

El `super_admin` fija una sola vez, desde **/admin/voz-configuracion**, lo que
aplican todos los equipos:

| Campo | Por defecto | Qué controla |
|---|---|---|
| `wake` | `oye nova` | Frase de activación. Exige **dos palabras o más**: «nova» a secas despertaba con la conversación del mostrador. |
| `motor` | `auto` | Motor del dock y del servicio (tabla anterior). |
| `idioma` | `sistema` | Idioma del reconocimiento. `sistema` usa el locale del teléfono; si no es español, `es-US`. App y servicio reciben el mismo valor resuelto. |
| `retencionDias` | `30` | Días que se conservan los eventos de voz (entre 7 y 365). |

- Tabla `voz_config` (una fila) y esquema Zod compartido
  (`shared/schemas/vozConfig.js`). Cada guardado sube `version`.
- `GET /api/voz/config` la descarga; `PUT /api/voz/config` solo la puede cambiar
  el `super_admin`.
- `useVozConfig` guarda una copia en Preferences (`voz.config`) y aplica motor e
  idioma al dock cuando llega una versión nueva. Sin red se usa la última copia;
  sin copia, los valores por defecto. El servicio nativo también persiste
  wake/idioma/motor y los lee si el sistema lo reinicia.
- Un cambio manual en **Ajustes → Avanzado** (solo `super_admin`) se respeta
  hasta el próximo cambio de flota.
- **Retención**: la tarea `voz:retencion` usa `retencionDias` y el botón
  **Depurar ahora** del panel aplica la misma política. Se conservan los eventos
  con 3+ intentos y las plantillas repetidas. Cómo se dispara cada noche:
  - **Servidor Node con el proceso vivo** (VPS, `pnpm preview`): la ejecuta
    Nitro sola (`nitro.scheduledTasks`, 03:00).
  - **Vercel / serverless**: no hay proceso permanente y Nitro **no** crea el
    cron. Lo dispara `vercel.json` (`crons`, 03:00) contra
    `POST /api/tasks/voz/retencion`, que exige `CRON_SECRET` (Vercel lo manda
    como `Authorization: Bearer`). Sin `CRON_SECRET` responde 503 y no borra
    nada.
  - **Cron propio**: `curl -fsS -X POST -H "x-voz-cron-secret: $CRON_SECRET"
    https://<host>/api/tasks/voz/retencion`.
  - Las dos vías pasan por `ejecutarRetencionVoz` (`server/utils/vozRetencion.ts`),
    así que no pueden divergir.

## Léxico remoto (Fase B)

Contadores de motivos sin texto primero; plantillas enmascaradas después. El
panel `/admin/voz` muestra los eventos no reconocidos agrupados por plantilla y
permite marcarlos como resueltos o descartados. El filtro por estado se aplica
en SQL y está indexado por `(estado, ultimo_en)`.

## Alias de productos (aprendidos)

El mostrador llama a los productos de otra forma («bombi», «la malta», «pan de
la casa»). Un **alias** une esa forma con un producto del catálogo.

- **Cuándo se aprende**: solo cuando el jefe **elige a mano** el producto — en el
  menú de candidatos («la dos») o en **Asignar producto** de **Por revisar**.
  Nunca por una venta que salió sola.
- **Qué se guarda**: el texto normalizado sin verbo, cantidad ni cliente
  («vende dos bombis» → `bombi`), con el `productoId`, en la tabla local
  `voz_alias` **por puesto**.
- **Cómo se usa**: el alias puede **meter** en la lista un producto que el fuzzy
  no habría encontrado, y lo deja como coincidencia casi exacta. Sigue pasando
  por el umbral, el margen, el stock y la confirmación: **un alias nunca vende
  solo**.
- **Conflictos**: si el mismo texto ya apunta a otro producto, no se pisa; si el
  texto apunta a dos productos, se ignora y se pregunta. Palabras de gramática
  (`de`, `dos`, `vende`) y nombres oficiales no se aprenden.
- **Límite**: 5 alias por producto; al pasarse se descarta el menos usado.
- **Deshacer**: el aviso «Alias aprendido» trae **Deshacer** (10 s). Después se
  borran desde **Ajustes → Voz → Alias de productos**.
- **Alcance**: local al teléfono y al puesto. No se sincroniza entre equipos (los
  productos son por puesto).

### Alias vs léxico remoto

No compiten: el **léxico remoto** son palabras de la *gramática* (verbos y
marcas) y es global para la flota; un **alias** es el nombre de un *producto* y
vive en un puesto. «factúrame» va al léxico; «bombi» va a los alias.

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

### Traza local (Ajustes → Avanzado, solo `super_admin`)

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

Para la prueba en teléfono real (la que levanta la puerta de las fases que
escriben), la hoja de firma es `docs/VOZ_VALIDACION.md`. Esta lista es el detalle
funcional caso por caso:

1. El dock aparece en `/deudas` y `/settings`.
2. En `/quiosco`, “vende 5 panes” abre la venta del **almacén**.
3. En `/deudas`, “vende 5 panes del almacén” abre la venta de almacén.
4. En `/quiosco`, “vende 5 panes del quiosco” abre la venta del quiosco.
5. `?voice=1` solo dispara en `/quiosco` y `/almacen`.
6. Venta por voz: la lectura incluye ubicación e importe; "sí" confirma una vez;
   "no" cancela; el silencio deja el formulario para confirmar a mano. El
   timeout elegido persiste tras recargar.
7. El proof queda en `voice.proofs` con producto, cantidad, ubicación y
   resultado.
8. En **Ajustes → Reconocimiento (entender)** se ven motor, on-device y nº de
   servicios.
9. *Probar micrófono* dicta correctamente y, si falla, el aviso muestra el
   código nativo.
10. Cambiar la **Voz de respuesta** no altera el resultado de *Probar micrófono*
    (TTS ≠ STT).
11. Tras una venta por voz, el stock hablado baja y, si hay dictados sin revisar,
    la voz dice «N por revisar».
12. **Por revisar (voz)**: una acción se Registra (descuenta stock con la fecha
    del dictado), se Edita (abre el diálogo con el precio dictado) o se Descarta
    (queda archivada). El badge del menú y el contador bajan al instante.
13. Con el interruptor activo y la app minimizada: decir «oye nova» responde
    «¿Qué puedo hacer por ti?»; luego «vende dos panes» pide confirmación y, al
    decir «sí», deja «1 dictado por revisar» en el badge al volver.
14. Con la app cerrada, «oye nova, cuántos panes quedan» se responde con
    voz y **no** crea una acción pendiente.
15. En modo avión, con motor **Vosk**, la frase de activación, el diálogo y el
    dictado funcionan igual (sin datos ni pitidos).
16. Un dictado sin producto muestra **Asignar producto**; tras elegirlo,
    **Registrar** queda habilitado y descuenta con la fecha del dictado.
17. Con dictados sin recoger en el buzón, una consulta de stock avisa de que hay
    pendientes en vez de jurar un número.
18. «oye nova, vende la última unidad» cuando ya hay una pendiente de ese
    producto: responde «Sólo quedan 0 libres: 1 está apartada por ventas por
    revisar» y **no** anota.
19. Dictar «hola, buenas» o «mañana compro refrescos» no anota nada ni habla.
20. Con la app abierta, «cuánto cuesta el refresco» responde precio y stock de
    ambas ubicaciones; «repite» lo vuelve a decir; «qué puedes hacer» da la ayuda.
21. Con la lectura de voz apagada, «vende dos panes» abre el formulario y **no**
    se queda esperando un «sí» en silencio.
22. En Ajustes, un `jefe` no ve motor, idioma, traza ni frases de prueba; solo
    `super_admin` los ve dentro de **Avanzado**.
23. «vende dos panes» → «no, eran tres»: relee «3 unidades…», recalcula el
    importe y solo anota con «sí». Una tercera corrección obliga a confirmar a
    mano.
24. En `/admin/voz-configuracion`, cambiar la palabra clave a «nova» debe
    rechazarse; «oye quiosco» se guarda y sube la versión.
25. Un equipo con la versión anterior, al sincronizar, aplica el nuevo motor e
    idioma y el servicio vivo se reconfigura sin reiniciar la app.
26. «Depurar ahora» borra según `retencionDias` y conserva los eventos con 3+
    intentos; la tarea `voz:retencion` hace lo mismo cada noche.
27. «cuánto me deben» lee el total y quién más debe; «cuánto debe Juan» el saldo
    de Juan. Con «Juan» y «Juanita» en la lista pide el nombre completo.
28. «cuánto debo» no responde (silencio): no puede confundirse con una compra del
    negocio. «abre deudas» no hace nada: la navegación por voz se retiró.
29. Con la app cerrada, las mismas frases de deuda se contestan desde
    `snapshot.json`; sin snapshot pide abrir la app. Un usuario sin permiso de
    `/deudas` no oye cifras.
30. «cómo va el día» y «cuánto vendí hoy» responden con las ventas de hoy y los
    dictados por revisar, igual con la app abierta que cerrada. Un trabajador oye
    que es información del jefe.
31. «cuánto vendí» sin decir el día no se contesta; «cuánto gané hoy» lee
    ganancia e importe vendido; «cómo va la caja» con cuadre abierto lee el
    efectivo esperado y, sin cuadre, «No hay un cuadre abierto».
32. «fía dos panes a Yunior» lee la deuda con el precio del catálogo y solo con
    «sí» la registra; el stock baja y la deuda aparece en `/deudas`.
33. «fía dos panes a Juan» con «Juanita» en la lista lee los parecidos y no fía
    nada hasta oír el nombre completo.
34. «fía dos panes a Yunior» con el producto ambiguo ofrece hasta 3 opciones y,
    al elegir «la dos», sigue siendo un fiado (pide el «sí»).
35. Con la lectura de voz apagada, un fiado no registra nada y lo avisa.
36. Con la app cerrada, un fiado confirmado aparece en **Por revisar** como
    **Fiado** con su cliente; **Registrar** crea la deuda y **Editar** no está.
37. «cobra 200 a Yunior» lee la deuda y solo con «sí» la cobra; el saldo de
    `/deudas` baja 200 y el pago queda en el historial.
38. «cobra la deuda de María» salda el total; con dos deudas, cobra primero la
    más antigua y lo dice.
39. «cobra 5000 a Yunior» (debe 2210) se rechaza sin cobrar nada.
40. «cobra 2 panes» sigue abriendo la venta, no un cobro.
41. Con la app cerrada, «oye nova, cobra 200 a Yunior» → confirma; al abrir la
    app aparece en **Por revisar** como **Cobro** con cliente y monto, y
    **Registrar** lo aplica.
42. Cobrar todo a un cliente con dos deudas deja **dos filas** de cobro (una por
    deuda) y, al registrarlas, el saldo queda en cero.
43. «cobra la deuda de Juan» con la app cerrada se responde como cobro, no como
    consulta de deuda.
44. Dictar «vende dos bombis» con «Bombillo LED» y «Bombillo 12W» en el catálogo
    abre el menú; al elegir uno, aparece «Alias aprendido» y la próxima vez
    «bombis» va directo a ese producto.
45. **Deshacer** en ese aviso borra el alias; la siguiente vez vuelve a preguntar.
46. Un dictado sin producto asignado a mano desde **Por revisar** enseña el alias
    con las palabras del dictado (sin verbo ni cantidad).
47. «bombi» con dos productos distintos apuntando al mismo alias no elige solo:
    se pregunta.
48. Con la app cerrada: «oye nova, cuánto cuesta el refresco» → «repite» lo
    vuelve a decir; «ayuda» lee qué sabe hacer. Sin respuesta previa, «repite»
    dice «No tengo nada que repetir todavía».
49. «cuánto gané hoy» con ventas anuladas no las suma; con una venta de 20 y
    ganancia 8 lee «Hoy ganaste 8 pesos de 20 vendidos».
50. Sin ventas, «cuánto gané hoy» dice «Todavía no hay ventas hoy, así que no hay
    ganancia» (no dice cero pesos).
51. «cómo va la caja» con el cuadre cerrado dice «No hay un cuadre abierto» y no
    crea uno. Con fiado y transferencias, las descuenta del efectivo esperado.
52. Con la app cerrada, «cómo va la caja» pide abrir la app; «cuánto gané hoy»
    responde desde el snapshot.
53. «vende 3 panes y 2 refrescos» con la app abierta abre **un** formulario con
    dos filas y lee «Voy a vender 3 unidades de Pan y 2 unidades de Refresco del
    almacén por 70 pesos».
54. «vende 3 panes y 2 refrescos» con un producto sin stock (o ambiguo) **no**
    abre la venta múltiple: cae al flujo de una línea y pregunta.
55. «vende treinta y cinco panes» sigue siendo **una** línea de 35, no 30 + 5.
56. «vende 2 panes y 3 panes» abre un solo renglón de 5; con la app cerrada,
    «vende 3 panes y 2 refrescos» dice «De uno en uno, por favor».
57. Con el teléfono en **modo avión**, confirmar una venta por voz deja el proof
    en el teléfono y lo encola; al quitar el modo avión, la app lo sube sola y la
    fila aparece en el panel de confirmaciones.
58. Con la red caída a mitad de la cola, los proofs ya subidos **no** se repiten
    al reintentar; los que faltan siguen en la cola.
59. Un proof con **20** intentos fallidos o más de **14 días** se descarta solo; la
    copia local de `voice.proofs` se conserva.
60. `POST /api/tasks/voz/retencion` sin secreto responde **401**; sin
    `CRON_SECRET` configurado en el servidor responde **503** y no borra nada.
61. «entraron 20 panes a 10 pesos» abre **Entrada al almacén** con 20, el costo
    dictado y el producto; **no** crea el lote hasta pulsar Guardar entrada.
62. «llegaron 5 panes» (sin costo) prellena la cantidad y deja el **último precio
    pagado**, avisando de que no se dijo el costo.
63. «cambia el precio del pan a 25» abre el diálogo con el precio actual y 25;
    el historial de precios solo aparece tras guardar.
64. «cierra el cuadre» lleva a `/cuadre`, lee la caja y recuerda que hay que
    escribir el dinero real: la voz **no** cierra el cuadre.
65. «pasa 5 panes al quiosco» abre el traspaso con 5 y lotes FIFO; con 9 cuando
    solo hay 3 avisa y no abre nada.
66. «pasa 5 panes del quiosco al almacén» se rechaza con un aviso (no se
    invierte el sentido).
67. Con la app cerrada, cualquiera de los cuatro no deja nada en «Por revisar».
68. Un trabajador (sin jefe) recibe «Solo el jefe puede…» y no se abre ningún
    formulario.
69. «vende 2 panes» **dentro de `/quiosco`** prellena una venta del **almacén**;
    con «del quiosco» sí sale del quiosco.
70. «vende 1 refresco del quiosco a 200 a adrian» toma **200** aunque el STT no
    transcriba «pesos», y deja «refresco» como producto (sin el número pegado).
71. «transfiere 5 panes del almacén al quiosco» abre el traspaso con 5 (mismo
    resultado que «pasa»).
72. «vende 3 panes» con «Pan de leche» en el catálogo resuelve **sin** menú de
    candidatos (el plural reconoce el nombre compuesto).

## Limitaciones conocidas

- «Repite» y «ayuda» funcionan en los dos modos: con la app cerrada, «repite»
  vuelve a decir la última frase del servicio (no guarda historial ni consulta
  la base).
- El resumen del día se responde en los dos modos; el de la app cerrada usa el
  último snapshot y no incluye las ventas hechas en OTRO teléfono desde que se
  escribió.
- Las deudas se consultan, se pueden **fiar** y **cobrar** por voz, con la app
  abierta y cerrada.
- La **caja** solo se responde con la app abierta: el snapshot no lleva el
  cuadre. La **ganancia** sí viaja en el snapshot (versión 4).
- Un snapshot anterior a la versión 4 no trae `gananciaHoy`: el servicio pide
  abrir la app en vez de leer cero.
- Un cobro que toca **varias deudas** del mismo cliente deja **una fila por
  deuda** en la revisión (el servicio reparte FIFO antes de escribir).
- Un fiado por voz usa el precio del catálogo y crea la deuda directa; no admite
  precio dictado ni pago inicial.
- Los **alias de producto** viven en el teléfono y en el puesto: no se sincronizan
  entre equipos, así que aprender uno en un teléfono no lo enseña en el otro.
- La auditoría central es best-effort: si el envío falla, el proof queda en la
  cola local y se reintenta al volver la red (ver «Proof local»).
- La retención de eventos se ejecuta con la tarea `voz:retencion` y con el botón
  **Depurar ahora** del panel. En Vercel la dispara el cron de `vercel.json`
  contra `/api/tasks/voz/retencion`; en un servidor Node la programa Nitro. Si
  el despliegue no ejecuta ninguna de las dos, hay que llamar al endpoint (o a
  `/_nitro/tasks/voz:retencion`) desde un cron externo.
- El comportamiento del STT nativo sin conexión depende del paquete de idioma
  offline del dispositivo y debe probarse en modo avión.
- El selector de **Voz de respuesta** es solo TTS; Android no expone una lista
  de voces de reconocimiento para elegir en la app.
- `ERROR_SERVER_DISCONNECTED` (11) puede ser transitorio: el plugin reintenta la
  cadena completa antes de reportar el primer error.
- La escucha en segundo plano gasta batería: el motor del sistema reconecta en
  cada frase y Vosk mantiene el modelo cargado. HyperOS puede matar el servicio
  igual; por eso existe el aviso de exención de batería. `START_STICKY` ayuda
  pero no garantiza nada.
- Vosk small-es es un modelo pequeño: entiende vocabulario de mostrador, pero
  confunde nombres de producto parecidos más que Google. El diccionario del
  catálogo sigue siendo el que decide qué se vendió.
- El primer uso de Vosk descomprime ~40 MB (unos segundos) y hasta terminar la
  frase de activación no funciona. El dock hace lo mismo con su modelo.
- La frase de activación se detecta sobre la transcripción del STT, no con un
  motor de palabra clave dedicado. Con ruido de mostrador puede no reconocerse;
  repetir «oye nova» más cerca del teléfono.
- Las consultas con la app cerrada usan la última foto del catálogo: si se vendió
  desde otro teléfono del mismo puesto, la respuesta puede quedar desfasada hasta
  la próxima apertura de la app.
- El servicio y el dock no comparten micrófono: mientras la app está abierta el
  servicio queda en pausa y no captura dictados (los toma el dock).
- **Tabla nueva + dev server encendido**: el journal de Drizzle se carga con
  `import.meta.glob`, que Vite resuelve al arrancar `pnpm dev`. Si añades una
  tabla y no reinicias el dev server, la app la crea desde el schema al primer
  uso (red de seguridad en `client.js`), pero sin los índices del journal. Para
  el estado completo, reinicia `pnpm dev` y reabre la app.
