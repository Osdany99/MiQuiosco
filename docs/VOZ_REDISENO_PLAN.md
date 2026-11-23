# Rediseño progresivo del asistente de voz

> Documento vivo. Actualizar **Estado**, **Siguiente tarea** y **Registro de ejecución** al terminar cada bloque de trabajo.
>
> Rama de trabajo: `feat/asistente-voz-seguro` (creada desde `main`, punto de partida `a34f9ad`).
> Dispositivo de validación: Redmi Note 13 (`23129RA5FL`, serial ADB `4d82ea9c`).

## 1. Objetivo

Construir progresivamente un asistente que permita usar MiQuiosco con voz y tacto a personas con poca experiencia tecnológica, con estas garantías:

- Nunca confirmar ni escribir a partir de un parcial, eco, identidad ambigua o permiso insuficiente.
- Núcleo completo offline; mejora online opcional y visible.
- Operaciones idempotentes y recuperables tras red caída, proceso muerto o reinicio.
- La voz rellena y corrige **los mismos borradores y formularios** que el flujo manual.
- Sin duplicar reglas de negocio entre UI, voz, Android y servidor.
- Inteligencia útil medida por tareas completadas, no por apariencia de chat o LLM.

## 2. Decisiones de producto ya tomadas

1. **Automatización según riesgo:** consultas directas; ventas simples con revisión/confirmación; dinero, deudas y cambios sensibles con validación reforzada o revisión.
2. **App cerrada:** alcance esencial offline, captura para revisar y consultas básicas; no paridad total con la app abierta.
3. **Dispositivo de referencia:** gama media de 4 GB o más; el Redmi Note 13 sirve como referencia inicial.
4. **Motor híbrido:** priorizar el reconocedor del sistema/Google con Internet cuando esté permitido; continuidad offline sin fallback online silencioso.
5. **Texto crudo:** solo con consentimiento explícito, alcance visible y retención limitada. Audio no se conserva por defecto.
6. **Ubicación omitida:** siempre almacén, también después de elegir candidatos o corregir.
7. **Slots:** una unidad de producto puede proponerse con revisión visible; dinero y datos sensibles nunca se inventan.
8. **Trabajador:** solo lo autorizado por la API, con las mismas reglas online/offline.
9. **Primera instalación:** se permite aprovisionar antes el modelo por descarga o USB; después el núcleo funciona offline.
10. **Formularios:** no crear formularios paralelos para voz. El botón Guardar y el «sí» usan el mismo borrador validado y el mismo ejecutor de dominio.
11. **Correcciones:** modifican un campo del borrador, no escriben directamente ni obligan a repetir toda la orden.

## 3. Arquitectura destino

```text
STT (Google/sistema, on-device u offline)
  → Utterance identificado
  → IntentDraft (intent + slots provided/inferred/missing + candidatos)
  → máquina única de conversación
  → borrador del formulario manual existente
  → política (permiso + riesgo + ubicación + capacidad + frescura)
  → revisión visible y correcciones por campo
  → ejecutor único e idempotente
  → Receipt (applied/queued/needsReview/rejected/uncertain)
```

Contratos mínimos:

- `Utterance`: `utteranceId`, texto, alternativas, motor, usuario/puesto/dispositivo, contexto y timestamps.
- `IntentDraft`: intención, slots con presencia explícita, candidatos, razones y versión.
- `ActionDecision`: responder, pedir dato, elegir, revisar, ejecutar, denegar o no disponible.
- `Receipt`: `commandId`, estado real, IDs de negocio y siguiente acción recuperable.

Reglas:

- Validar antes del read-back y otra vez al ejecutar.
- Un fallo de lectura es «no pude comprobarlo», nunca una lista vacía o un cero.
- Un timeout produce resultado incierto y reconciliación por `commandId`, no reintento ciego.
- Telemetría fuera del camino crítico.
- Android no vuelve a implementar toda la gramática ni escribe directamente la BD.

## 4. Fases y estado

### Fase 0 — Contención de seguridad e integridad

- [x] **0.1 Confirmación hablada segura:** ignorar parciales para sí/no/corrección, cerrar bypass antieco, limitar alternativas sin confianza y añadir regresiones de conversación. **Código y tests completos; validación física E4 pendiente.**
- [x] **0.2 Escrituras directas de voz:** **código y tests completos; validación física F3 pendiente.**
  - [x] **0.2a IDs estables por dictado** en fiado, cobros FIFO, deuda y transferencias, conservados durante correcciones.
  - [x] **0.2b Resultado incierto reconciliable** por ID, plan durable para las cuatro escrituras y cobro múltiple con reanudación por pasos.
- [x] **0.3 Permisos:** misma matriz rol × acción × ubicación × online/offline; trabajador limitado a lo autorizado por API. **Código y tests completos.**
- [x] **0.4 Stock concurrente:** guarda transaccional PostgreSQL por puesto, conflicto 409 y operación completa/idempotente. **Código y tests completos.**
- [x] **0.5 Dispositivo revocado:** si el JWT tiene `dispositivoId`, exigir header coincidente; la omisión ya no evita la revocación. Tests HTTP añadidos y verdes.
- [ ] **0.6 Identidad nativa:** `usuarioId`, `puestoId`, dispositivo y `snapshotId` desde el dictado; nunca reasignar inbox al usuario que abre después.
- [ ] **0.7 Offline explícito:** Vosk/offline nunca cambia al sistema con `EXTRA_PREFER_OFFLINE=false` sin consentimiento.
- [ ] **0.8 Correcciones funcionales:** ganancia (`cargarMovimientos`), slot-filling, mover producto, ubicación tras candidato y copia de cobro nativo.
- [ ] **0.9 Privacidad:** quitar nombres/hints de `motivo` cuando captura esté apagada; separar código de error de datos crudos.
- [ ] **0.10 Migración 0030:** backfill previo y prueba 0029 con datos → 0030.

Criterio de salida: ninguna escritura sin intención final clara, permiso válido, identidad e idempotencia; migración segura; ningún fallback online oculto.

### Fase 1 — Contratos y pruebas de integración

- [ ] `Utterance`, `IntentDraft`, `ActionDecision`, `Receipt` versionados.
- [ ] `commandId + payloadHash + draftRevision` extremo a extremo.
- [ ] Registro declarativo por intent: ejemplos, slots, permisos, riesgo, capacidades, handler y respuestas.
- [ ] Pruebas «sí… pero no», «no, eran tres», eco real y segundo turno de slot-filling.
- [ ] Contratos `resolver → borrador/formulario → guardar → reintento`.
- [ ] Dos escrituras concurrentes contra una unidad de stock.
- [ ] Matriz anon/jefe/trabajador/super_admin y central/segundo puesto.
- [ ] Replays de eventos, aciertos, confirmaciones y acciones.
- [ ] Migraciones con datos previos y pruebas de retención.

### Fase 2 — Una conversación, un borrador y un ejecutor

- [ ] Extraer `useVentaPorVoz` por responsabilidades sin cambios de comportamiento no planificados.
- [ ] Una sola instancia de conversación; ubicación como contexto, no dos controladores.
- [ ] Una sola FSM: reposo → captura → interpretación → aclaración/revisión → ejecución → resultado.
- [ ] El formulario manual y la voz comparten borrador y validación.
- [ ] `setCantidad`, `setCliente`, `setProducto`, `setUbicacion`, `setTipoVenta` producen patches del borrador.
- [ ] Cantidades enteras y dinero decimal usan parsers distintos.
- [ ] El read-back se deriva del borrador actual, no del dictado inicial.
- [ ] Botón y «sí» llaman al mismo caso de uso, sin pulsar DOM sintéticamente.
- [ ] Ejecutor común app abierta/buzón/revisión; cobro múltiple atómico o plan durable.

### Fase 3 — Offline y Android

- [ ] `VoiceSessionController` único, eventos serializados y `sessionId + generation`.
- [ ] Toda llamada Vosk/TTS termina exactamente una vez: resultado, error o cancelación.
- [ ] Inbox versionado, durable e idempotente; una operación completa por archivo/registro.
- [ ] Drenaje hasta agotar, reintentos transitorios y cuarentena de entradas inválidas.
- [ ] Snapshot: escritor singleton real, temporal + rename y última versión válida.
- [ ] Secuencia: snapshot válido antes de reanudar micrófono.
- [ ] Modelo: staging → verificación → carga de prueba → swap atómico → borrado anterior.
- [ ] Detener persistente; boot compatible; watchdog TTS; onda cancelable.
- [ ] Notificación como superficie principal; full-screen no necesario.
- [ ] Cobros capturados dicen «Listo para revisar», nunca «Cobrado» antes de aplicar.
- [ ] Alcance nativo esencial; retirar progresivamente duplicación financiera Java.

### Fase 4 — Telemetría, backend y superadmin

- [ ] Eventos troceados a 200; borrar solo IDs confirmados; no borrar altas concurrentes.
- [ ] UUID y `creadoEn` del cliente en eventos/aciertos/confirmaciones; dedupe persistente.
- [ ] Fallos transitorios de BD devuelven 5xx y conservan colas.
- [ ] Retención de PII sin excepciones; confirmaciones incluidas; apagar captura limpia/anonimiza según política.
- [ ] Versionado de léxico serializado y resync completo de autocuración.
- [ ] `expectedVersion` en config; no incrementar versiones en no-ops.
- [ ] Cuotas/rate limit por dispositivo/puesto y validación de tenancy.
- [ ] Paginación keyset y agregados reales en SQL.
- [ ] Un solo acceso Voz: Salud, Frases, Configuración, Enseñar palabras y Privacidad.
- [ ] Filtros persistentes y navegación por URL correcta.

### Fase 5 — UX accesible y rendimiento

- [ ] Una superficie de conversación; el formulario manual es la revisión.
- [ ] Estado visible Guardando y resultado incierto recuperable.
- [ ] Primer uso: permiso explicado y práctica segura de solo lectura.
- [ ] Controles 48–56 px, foco visible/devuelto, contraste AA y TalkBack.
- [ ] Una región `aria-live` para turnos, no para cada parcial.
- [ ] `prefers-reduced-motion` también en canvas; sin RAF en reposo/oculto.
- [ ] Índice de catálogo precomputado por versión; NLU cargado bajo demanda si el perfil lo justifica.
- [ ] Validación táctil, teclado, voz y offline en el Redmi Note 13.

### Fase 6 — Inteligencia y retirada de legacy

- [ ] Correcciones contextuales: cantidad, cliente, producto, ubicación y modalidad.
- [ ] Alias locales revisables; aprendizaje por motor; compartir solo tras revisión.
- [ ] Hotwords de productos/clientes cuando el motor los soporte.
- [ ] A/B real: Google/sistema, Google on-device, Vosk y alternativa offline (p. ej. sherpa-onnx).
- [ ] Online opcional devuelve el mismo `IntentDraft`, sin SQL ni acceso directo a repos.
- [ ] Retirar segunda máquina de confirmación, buzón legacy, wrappers vacíos y telemetría duplicada.
- [ ] Retirar comandos sin valor demostrado (p. ej. mover producto si no se usa).

## 5. Métricas de aceptación

- 0 escrituras con parciales contradictorios o eco del TTS.
- 0 duplicados al repetir el mismo `commandId`.
- Dos ventas concurrentes por una unidad: una aplicada y una en conflicto.
- Dispositivo revocado sin header: 403.
- 0 dictados reasignados a otro usuario/puesto.
- 0 nombres nuevos en BD con captura desactivada.
- Replays sin cambiar contadores ni duplicar confirmaciones.
- Colas >200 eventos y >40 dictados drenan sin pérdida.
- 0 éxitos anunciados antes de aplicar el efecto correspondiente.
- Venta y corrección posibles con voz, tacto, teclado y TalkBack.
- 0 streams/RAF/escuchas activas tras cancelar o cerrar sesión.
- Medir exactitud de intención+slots, nombres, latencia p50/p95, RAM, batería y abandono en el Redmi.
- No fijar objetivos de modelo por marca: elegir motor por resultados con corpus real y consentimiento.

## 6. Pruebas y validación por bloque

Siempre que el cambio lo permita:

```powershell
pnpm test
pnpm exec eslint <archivos-tocados>
```

Cuando corresponda y fuera de modo solo lectura:

```powershell
pnpm typecheck
pnpm test:api
pnpm android:test
```

Dispositivo (el driver resuelve el SDK aunque `adb` no esté en PATH):

```powershell
python C:\Users\Osdany\.opencode\skills\android-testing\scripts\adb.py devices
python C:\Users\Osdany\.opencode\skills\android-testing\scripts\adb.py ui
python C:\Users\Osdany\.opencode\skills\android-testing\scripts\adb.py crash-check
```

No hacer commit, push, merge ni rebase sin autorización explícita de cada operación.

## 7. Registro de ejecución

### 2026-11-22 — Inicio

- Rama `feat/asistente-voz-seguro` creada desde `main` en `a34f9ad`.
- Baseline antes del rediseño: 1002 tests JS verdes; ESLint dirigido sin errores.
- Redmi Note 13 detectado por ADB: serial `4d82ea9c`.
- **Estado al cerrar 0.2b:** código y tests completos; validación física E4/F3 pendiente de reconectar el Redmi. Siguiente fase: 0.3 (permisos).

### 2026-11-22 — Primer bloque implementado

- 0.1: `evaluarRespuestaConfirmacion` puro; no se observa ni clasifica `transcriptParcial`; antieco de 1500 ms; alternativas con confianza >=0,5; 15 regresiones nuevas.
- 0.2a: `crearOperacionIds` con UUID por dictado/clave, reinicio solo al dictar de nuevo; IDs pasados a fiado, cada pago FIFO, deuda y transferencia; 4 regresiones nuevas.
- 0.5: JWT con dispositivo exige header; se prueban omisión, otro equipo y revocación.
- Validación: **1021 tests JS**, **10 tests API de voz**, `pnpm typecheck`, ESLint y `git diff --check` verdes.
- `docs/VOZ_VALIDACION.md` incluye E4.1–E4.5 para la prueba física de confirmación.
- Build web/APK correcto. El build produce avisos de chunks >500 kB, pendientes para la fase de rendimiento.
- Para no tocar la instalación real, se preparó una variante separada `com.myquiosco.app.vozdev` con versionCode dev 28 mediante init script temporal fuera del repo.
- La instalación está **bloqueada por `INSTALL_FAILED_USER_RESTRICTED` y el teléfono está en pantalla de bloqueo**. No se desinstaló ni alteró la app real. Hay que desbloquear el Redmi y autorizar la instalación de esa variante.

### 2026-11-22 — Fase 0.2b implementada

- Plan durable en Preferences para fiado, cobro FIFO, deuda de dinero y transferencia: `commandId`, payload, usuario/puesto/modo y estado por paso, sin texto crudo ni nombres.
- Reconciliación por ID después de timeout/respuesta perdida. Solo una ausencia confirmada permite reintentar; lectura fallida queda incierta. Un cambio online ↔ local detiene el plan.
- Cobro múltiple con pasos `pendiente/ejecutando/aplicado`, fallo intermedio recuperable y bloqueo de nuevas operaciones del mismo cliente mientras haya otra sin comprobar.
- Deuda + líneas + abono + cuadre, cobro + saldo + cuadre y transferencia + cuadre quedaron transaccionales en SQLite. La lectura para refrescar UI ya no convierte una escritura exitosa en falso fallo.
- Reintentos remotos/locales con mismo ID y distinto importe/payload dan 409. Corregida la deuda online solo de dinero: ya no se guardaba en cero.
- Añadidas 12 regresiones durables y cobertura API para deuda de dinero e IDs con payload distinto (deuda, cobro y transferencia). `docs/VOZ_VALIDACION.md` incluye F3.1–F3.6.
- Validación: **1033 tests JS**, **170 tests API**, `pnpm typecheck`, `pnpm build`, ESLint y `git diff --check` verdes. La APK dev actualizada también compiló correctamente.
- Al cerrar el bloque, `adb devices` ya no muestra el Redmi. La validación física F3 queda pendiente de **reconectar y desbloquear** el dispositivo e instalar la variante dev; la app real sigue intacta.

### 2026-11-22 — Validación física aplazada

- El Redmi se reconectó y se intentó instalar la variante `com.myquiosco.app.vozdev`, pero MIUI siguió devolviendo `INSTALL_FAILED_USER_RESTRICTED` incluso tras activar el permiso indicado por el usuario. No se sustituyó ni alteró la app real.
- **Decisión del usuario:** dejar E4.1–E4.5 y F3.1–F3.6 para una revisión posterior y continuar con Fase 0.3. No insistir en la instalación hasta que el usuario la retome.
- **En curso:** Fase 0.3, matriz de permisos rol × acción × ubicación × online/offline, con foco en trabajador.

### 2026-11-23 — Fase 0.3 implementada

- Matriz compartida `shared/voz/permisos.js` aplicada antes de resolver/ejecutar: trabajador solo fiado, deuda de dinero y transferencia; el fiado con inventario también exige `acciones.<ubicacion>.voz`. Cobro y venta directa quedan para jefe.
- Login propio de trabajador online/offline, sesión acotada a 24 h, restauración de JWT y limpieza al salir. Pull completo, administración, costos, ganancias, salarios y snapshot nativo quedan fuera de su alcance.
- Guard servidor por puesto, propiedad/estado del cuadre, bloqueo de abonos y altas arbitrarias de clientes; solo puede repararse el centinela «Sin cliente».
- Push selectivo en una petición, sin deletes ni tablas ajenas. El canal dedicado del servidor valida permiso, propiedad, cuadre abierto, líneas y FIFO; recalcula totales/costos, aplica solo deltas de operaciones nuevas y hace rollback completo ante conflicto. Replays conservan IDs sin duplicar efectos ni devolver filas sensibles.
- Validación: **1042 tests JS**, **189 tests API** (incluidas 10 de permisos y 9 de sync selectivo), `pnpm typecheck`, ESLint dirigido y `git diff --check` verdes. La BD real no se tocó; las suites recrean solo `MiQuiosco_test`.
- **Siguiente:** Fase 0.4, concurrencia de stock. La auditoría confirmó el read-check-write sin serialización; se implementará una guarda transaccional PostgreSQL y pruebas de carreras reales.

### 2026-11-23 — Fase 0.4 implementada

- Migración custom `0041_stock_concurrente`: trigger sobre `movimientos_inventario` con advisory lock transaccional por puesto y comprobación por producto, lote y ubicación. Rechaza únicamente un saldo negativo que empeora; una entrada puede reparar un desajuste histórico. SQLSTATE `P0409` se traduce a HTTP 409 `stock_concurrente`.
- Cierre/reapertura bloquean la fila del cuadre y repiten el guard de estado dentro de la transacción. Venta/deuda directa serializan el mismo `operationId` antes de leer stock y comparan el efecto completo al reconciliar: puesto, líneas, cantidades, ubicación, tipo, importes y abono inicial. Un ID con payload distinto devuelve 409.
- Push del jefe: `P0409` aborta toda la transacción. El cliente agrupa cabecera + líneas + FIFO en una sola petición (`app/utils/syncLotes.js`) y solo marca las tablas tras éxito; no quedan ventas/deudas confirmadas sin su salida de inventario. El push selectivo del trabajador conserva el mismo comportamiento atómico.
- Añadidas **13 pruebas API de carreras e idempotencia**: venta/venta, venta/deuda, mismo ID en paralelo, payload distinto, abono inicial, secuencia, cierre, reapertura, movimientos aislados y operaciones completas de jefe/trabajador. También hay 3 regresiones JS para el empaquetado indivisible y una para clasificar el conflicto.
- Revisión independiente adicional: el primer pase detectó posibles cabeceras parciales y falsos replays; se corrigieron y se añadieron sus regresiones antes del cierre.
- Validación final: **1046 tests JS**, **202 tests API**, `pnpm typecheck`, `pnpm build`, ESLint dirigido y `git diff --check` verdes. La migración y todas las pruebas se ejecutaron únicamente sobre `MiQuiosco_test`; la BD real y la app instalada permanecen intactas.
- Nota operativa: los caminos actuales escriben movimientos por fila. Si en el futuro se introduce un `UPDATE`/`DELETE` multirow con deltas que se compensan entre filas, la guarda debe ampliarse para evaluar el neto final de la sentencia; hoy puede rechazar conservadoramente un estado intermedio.
- No se inicia todavía Fase 0.6 ni rediseño visual/IA.

## 8. Siguiente tarea concreta al reanudar

1. Fases 0.3 y 0.4 cerradas. Esperar decisión del usuario antes de comenzar Fase 0.6 (identidad nativa) u otro bloque.
2. Si se despliega `0041_stock_concurrente` fuera de pruebas, revisar antes los saldos históricos y ejecutar la migración con el procedimiento habitual; no se aplicó a la BD real desde esta tarea.
3. **Cuando el usuario lo decida:** retomar E4.1–E4.5 y F3.1–F3.6 en el Redmi con la variante dev, sin tocar la app real.
