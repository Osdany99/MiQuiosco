# Migraciones (PostgreSQL)

Estado y decisión sobre el historial de `drizzle/` frente a la base real.

## Situación actual (2026-11)

- `drizzle/` tiene **36 migraciones** (`0000`–`0035`) y son la fuente del
  esquema versionado.
- La base de producción se creó con **`pnpm db:push`**, no con migraciones. En
  `drizzle.__drizzle_migrations` solo hay **4 filas**: `0001`, `0002`, `0003` y
  una de `0000` cuyo hash **no coincide** con el archivo actual (esa migración se
  editó después de aplicarse).
- Por eso **`pnpm db:migrate` falla**: drizzle lee la última fila registrada y
  reaplica desde ahí; las tablas ya existen («already exists») y no avanza.
- El job `migrate-db` del workflow de release usa `drizzle-kit migrate` con la
  base de producción: **con el historial así, ese job también falla**.

Mientras no se aplique el baseline, la regla es: **no correr `pnpm db:migrate`
contra esta base**; el SQL nuevo se aplica a mano y luego se registra con
`pnpm db:baseline`.

## Opciones

### A. Baseline (recomendado)

Marcar como aplicadas las migraciones que ya están en la base, sin ejecutar su
SQL. Después, el flujo normal (`db:generate` → `db:migrate`) vuelve a funcionar y
el job del release deja de fallar.

```bash
# 1. Converger el esquema real con schema.ts (idempotente; no borra datos)
pnpm db:push

# 2. Ver el plan (solo lee)
pnpm db:baseline

# 3. Copia de seguridad (Neon: rama, o pg_dump con DATABASE_URL_PROD)

# 4. Registrar las filas que faltan
pnpm db:baseline --aplicar

# 5. Comprobar que no queda nada por aplicar
pnpm db:migrate
pnpm db:baseline
```

Criterio de éxito: `db:migrate` termina sin aplicar nada y `db:baseline` informa
`Faltan por registrar: 0`.

Riesgo: el baseline **asume que el esquema real ya tiene el efecto de todas las
migraciones**. Por eso el paso 1 (`db:push`) va primero: si algo faltaba, push lo
crea antes de que la migración quede marcada como aplicada.

### B. Seguir con `db:push`

Nada de historial: el esquema se converge con `db:push` y cada cambio se aplica
a mano a producción (copiando el SQL de la migración generada). Es lo que se
hace hoy. Coste: `db:migrate` sigue roto, el job `migrate-db` del release hay que
quitarlo o ignorarlo, y no hay forma de saber qué se aplicó en cada equipo.

### C. Recrear la base desde las migraciones

`0000`–`0035` sobre una base vacía y migrar los datos. Es el único camino que
garantiza que el historial describe exactamente la base, pero exige exportar e
importar datos y ventana de mantenimiento. Solo tiene sentido si se va a
reestructurar la base de todas formas.

## Reglas para no repetir el problema

- **Nunca** editar una migración ya aplicada (`0000` quedó así). Un cambio de
  esquema es siempre una migración nueva: `pnpm db:generate`.
- Aplicar el SQL nuevo con `pnpm db:migrate` (una vez hecho el baseline), nunca a
  mano por dos caminos distintos.
- El SQLite del dispositivo (`drizzle/sqlite`) va por otro carril:
  `pnpm db:generate:sqlite` y se aplica en el teléfono; no comparte historial con
  PostgreSQL.

## Herramienta

`scripts/baseline-migraciones.mjs` (`pnpm db:baseline`):

- lee `drizzle/meta/_journal.json` y calcula el hash de cada `.sql` igual que
  drizzle (`sha256` del contenido, `created_at` = `when` del journal);
- informa cuántas faltan y qué filas registradas no coinciden con el repo
  (migraciones editadas o historial viejo);
- sin `--aplicar` no escribe nada; con `--aplicar` **solo inserta** las filas que
  faltan, en una transacción. Nunca borra.
