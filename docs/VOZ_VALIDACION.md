# Validación en dispositivo (voz)

Registro de la prueba en **teléfono real** antes de cada fase que escribe datos
(K, L, M, N). Las fases ya implementadas (C, E1, E2, E3, F1, F2, G, H, I, J)
también se aprueban aquí: sus casos están abajo.

El checklist funcional completo (ítems 1–60) vive en `docs/VOZ_COMANDOS.md`;
este documento es la hoja de firma: qué se probó, en qué equipo y qué falló.

## Datos de la sesión

| Campo | Valor |
|---|---|
| Fecha | |
| Teléfono / Android | |
| APK (`versionCode`) | |
| Motor de reconocimiento | Vosk / sistema |
| Permiso de red del puesto | sí / no |
| Quién prueba | |

## Reglas de la puerta (no negociables)

1. **Teléfono real**, no emulador, con el APK de `pnpm android:dev` o release.
2. **Ruido de mostrador**: clientes hablando y la radio puesta.
3. **Modo avión** en las fases que dependen de reconocimiento (Vosk).
4. Tras cada **«no»** y cada **timeout de 6 s** no puede quedar nada a medias:
   ni venta, ni deuda, ni pago, ni acción en «Por revisar», ni stock reservado.

Marcar `✔` / `✘` y anotar qué pasó. Un `✘` bloquea la fase siguiente.

## Casos por fase

### C — Configuración de flota

| # | Qué hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| C1 | Cambiar wake/idioma/motor como `super_admin` en `/admin/voz-configuracion` | La APK lo aplica tras sincronizar; sin red usa la copia local | | |
| C2 | Cambiar la retención a 7 días y pulsar «Depurar ahora» | Borra solo lo viejo y conserva eventos con 3+ intentos | | |
| C3 | Con el servicio nativo activo, reiniciar el teléfono | La escucha queda en pausa; el aviso recuerda abrir la app | | |
| C4 | Encender «Guardar comandos exitosos» y sincronizar | La APK sube los dictados nuevos a `voz_aciertos` | | |

### E1 — Consultar deudas

| # | Qué decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| E1.1 | «cuánto debe Juan» | Lee el saldo pendiente, sin inventar si no hay cliente | | |
| E1.2 | «cuánto me deben» / «quién me debe más» | Total y el mayor deudor | | |
| E1.3 | «cuánto debe» (sin nombre) | Pregunta de quién; no responde cifras | | |

### E2 — Resumen del día

| # | Qué decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| E2.1 | «cómo va el día» | Ventas y total de hoy; no incluye anuladas | | |
| E2.2 | Con la app cerrada, «cómo va el día» | Responde desde el snapshot (puede faltar lo de otro teléfono) | | |

### E3 — Fiar por voz

| # | Qué hacer/decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| E3.1 | «fía 2 panes a Juan» → «sí» | Un solo registro con el **precio de catálogo**; sube la deuda | | |
| E3.2 | Igual, pero decir «no» | No se crea deuda ni se descuenta stock | | |
| E3.3 | Igual y dejar pasar 6 s | Formulario abierto; nada registrado | | |
| E3.4 | Fiar sin permiso de `/deudas` o con la lectura de voz apagada | No se cobra ni se fía; avisa | | |

### E4 — Confirmación hablada segura

| # | Qué hacer/decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| E4.1 | Preparar una venta y decir «sí… pero no» sin pausa | No registra; vuelve al modo manual | | |
| E4.2 | Preparar una venta y decir «no, eran tres» | No cancela en el primer «no»: muestra 3 y vuelve a pedir confirmación | | |
| E4.3 | Dejar que el micrófono oiga solamente el «sí» del propio anuncio | No registra una venta ni confirma un cobro | | |
| E4.4 | Tras el anuncio, decir «sí» claramente y dejar que el motor cierre | Registra una sola vez | | |
| E4.5 | Decir «sí por favor» | Confirma; el antieco no destruye la respuesta corta | | |

### F1 / F2 — Cobrar deudas

| # | Qué hacer/decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| F1.1 | «cobra 200 a Juan» → «sí» (app abierta) | Baja el saldo FIFO; el cuadre **no** se toca | | |
| F1.2 | «cobra 5000 a Juan» (debe 2210) | Rechaza el exceso y dice cuánto debe | | |
| F1.3 | «no, eran 150» tras la lectura | Corrige el importe y vuelve a leer (máx. 2 veces) | | |
| F1.4 | «cobra 2 panes» | Sigue siendo **venta**, no cobro | | |
| F2.1 | App cerrada: «oye nova, cobra 100 a Juan» → «sí» | Deja **un archivo por deuda** en el inbox; en «Por revisar» una fila **Cobro** por deuda | | |
| F2.2 | «no» en el diálogo cerrado | No deja archivo en `files/voz/inbox` | | |

### F3 — Recuperación de escrituras directas

| # | Qué hacer/decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| F3.1 | Perder la conexión justo tras confirmar un fiado; restaurarla y repetir exactamente la orden | Primero reconcilia el ID; hay una sola deuda y el stock solo bajó una vez | | |
| F3.2 | Cobrar a un cliente con dos deudas e interrumpir después del primer pago | No cobra la segunda a ciegas; informa el importe aplicado y conserva el plan | | |
| F3.3 | Repetir exactamente el cobro anterior (también tras cerrar/abrir la app) | Reutiliza los IDs originales y continúa desde el primer pago no aplicado, sin duplicar | | |
| F3.4 | Cambiar importe/forma de pago mientras el cobro anterior sigue incierto | No abre otra operación para ese cliente; pide comprobar primero la anterior | | |
| F3.5 | Iniciar online y cambiar a local antes de repetir | No cruza la reconciliación entre capas; pide volver al modo de origen | | |
| F3.6 | Repetir una deuda de dinero confirmada | Conserva el importe real (no queda en cero) y no vuelve a sumarla al cuadre | | |

### G — Alias aprendidos

| # | Qué hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| G1 | Elegir el producto a mano tras una duda | Aparece «Alias aprendido» con **Deshacer** (10 s) | | |
| G2 | Repetir el dictado con ese alias | Resuelve directo al producto | | |
| G3 | Aprender el mismo texto para otro producto | El alias se **desactiva** (conflicto); no adivina | | |
| G4 | Pulsar Deshacer y revisar Ajustes → Alias | El alias desaparece de la lista | | |

### H — Repite y ayuda

| # | Qué decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| H1 | «repite» tras cualquier respuesta | Repite la última frase, sin consultar la base | | |
| H2 | «repite» sin nada dicho | «No tengo nada que repetir todavía» | | |
| H3 | «qué puedes hacer» | Ayuda corta con los comandos reales | | |
| H4 | App cerrada: «oye nova, repite» | Repite la última frase del servicio | | |

### I — Ganancia y caja

| # | Qué decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| I1 | «cuánto gané hoy» con ventas | Ganancia de hoy + importe vendido; sin anuladas | | |
| I2 | «cuánto gané hoy» sin ventas | «Todavía no hay ventas hoy…» (no «cero pesos») | | |
| I3 | «cómo va la caja» con cuadre abierto | Esperado y efectivo esperado; descuenta fiado y transferencias | | |
| I4 | «cómo va la caja» sin cuadre abierto | «No hay un cuadre abierto» y **no** crea uno | | |
| I5 | App cerrada: «cómo va la caja» / «cuánto gané hoy» | Caja pide abrir la app; ganancia desde el snapshot | | |

### J — Varias líneas en una frase

| # | Qué decir | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| J1 | «vende 2 pan de leche y 2 refresco cola» → «sí» | Un formulario con dos filas; una sola venta con dos líneas | | |
| J2 | «vende 3 panes y 2 refrescos» con un producto ambiguo o sin stock | No abre la venta múltiple; pregunta | | |
| J3 | «vende treinta y cinco panes» | Una línea de 35 (no 30 + 5) | | |
| J4 | «vende 2 pan de leche y 3 pan de leche» | Un renglón de 5 | | |
| J5 | App cerrada: «oye nova, vende 3 panes y 2 refrescos» | «De uno en uno, por favor»; no deja nada | | |

### K — Entrada al almacén (asistida)

| # | Qué decir/hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| K1 | «entraron 20 panes a 10 pesos» | Abre la entrada con 20 y costo 10; **no** guarda solo | | |
| K2 | «llegaron 5 panes» (sin costo) | Usa el último precio pagado y lo avisa | | |
| K3 | «entraron panes» (producto ambiguo) | Menú de candidatos; al elegir, prellena igual | | |
| K4 | Pulsar Cancelar tras dictar | No queda lote ni movimiento | | |

### L — Cambio de precio (asistido)

| # | Qué decir/hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| L1 | «cambia el precio del pan a 25» | Diálogo con actual y 25; al guardar aparece en el historial | | |
| L2 | «pon el refresco a 60» | Sigue siendo **venta**, no cambio de precio | | |
| L3 | Cancelar el diálogo | El precio del producto no cambia | | |

### M — Cuadre (asistido)

| # | Qué decir/hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| M1 | «abre el cuadre» | Lleva a `/cuadre` y lee la caja sin crear nada | | |
| M2 | «cierra el cuadre» / «cierra y confirma el cuadre» | Lleva al cuadre y pide el dinero real; **no** cierra | | |
| M3 | Pulsar Cerrar cuadre sin dinero real | El cuadre sigue abierto (aviso de caja) | | |
| M4 | «abre el cuadre» con un cuadre cerrado | Lo dice y no crea otro | | |

### N — Traspaso (asistido)

| # | Qué decir/hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| N1 | «pasa 5 panes del almacén al quiosco» | Abre el traspaso con 5 y lotes FIFO | | |
| N2 | «pasa 9 refrescos al quiosco» con 3 en almacén | Avisa de la cantidad y no abre nada | | |
| N3 | «pasa 5 panes del quiosco al almacén» | Rechaza el sentido inverso con un aviso | | |
| N4 | Cancelar el traspaso | No mueve stock | | |

### O — Aciertos y léxico administrable

| # | Qué hacer | Qué debe pasar | ✔/✘ | Nota |
|---|---|---|---|---|
| O1 | Con la captura de aciertos encendida, dictar una venta y una consulta de stock; sincronizar | `/admin/voz → Aciertos` muestra dos filas con texto, comando, acción y detalle | | |
| O2 | Apagar la captura y dictar otra venta | No aparece una fila nueva; el servidor descarta lo que llegue de una copia vieja | | |
| O3 | Pulsar «Borrar todos» en Aciertos | La lista queda vacía y no se puede deshacer | | |
| O4 | En `/admin/voz-lexico`, desactivar `saca` de `venta_fuerte`; sincronizar y decir «saca 2 panes» | No abre venta: el panel de fallos registra `palabra_retirada` | | |
| O5 | Activar `saca` en `traspaso_verbo` y decir «saca 2 panes del almacén al quiosco» | Abre el traspaso; sin ubicación sigue sin actuar | | |
| O6 | Restaurar `saca` y comprobar «saca 2 panes» | Vuelve al comportamiento anterior sin tocar código | | |
| O7 | Quitar `rompio` de `merma_verbo` y decir «se rompió 2 panes» | No abre merma; otro verbo de la familia (`cayo`) sigue funcionando | | |
| O8 | Abrir `/admin/voz` y cambiar a la pestaña **Confirmaciones**; abrir el enlace antiguo `/admin/voz-confirmaciones` | La pestaña muestra los proofs y el enlace antiguo redirige a ella | | |

## Cierre: nada a medias

Después de recorrer los casos, revisar que no quedó basura:

| Comprobación | ✔/✘ | Nota |
|---|---|---|
| `/pendientes` no tiene dictados de las pruebas que dijeron «no» | | |
| `/deudas` no muestra deudas ni pagos de prueba | | |
| `/venta-directa` no muestra ventas que debían cancelarse | | |
| El stock de los productos usados volvió a su sitio | | |
| `voice.proofs` tiene un proof por confirmación (sin duplicados) | | |
| `voz_confirmaciones` recibió los proofs con red y la cola quedó vacía | | |
| Los aciertos de prueba se borraron desde la pestaña Aciertos | | |

## Resultado

| Fase | Resultado (aprobada / con fallos) | Nota |
|---|---|---|
| C | | |
| E1 | | |
| E2 | | |
| E3 | | |
| F1 / F2 | | |
| G | | |
| H | | |
| I | | |
| J | | |
| K | | |
| L | | |
| M | | |
| N | | |

Con las fases de escritura aprobadas se levanta la puerta para **K, L, M y N**
(ver `C:\Users\Osdany\.opencode\plan\voz-fases-restantes.md`).
