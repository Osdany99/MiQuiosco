# MiQuiosco

App de gestión de quiosco: productos, cuadres de caja, ventas a fiado,
usuarios, transferencias y gráficas. **Offline-first**: funciona sin
conexión con SQLite en el dispositivo (Capacitor) y sincroniza contra
PostgreSQL cuando hay red (push/pull).

## Stack

- **Nuxt 4** (Vue 3, `<script setup>`) + Nuxt UI + Tailwind CSS + pnpm
- **Capacitor 8** (Android) + `@capacitor-community/sqlite` (offline local)
- **Drizzle ORM** + PostgreSQL · **Zod** (validación compartida)
- Releases automáticos con GitHub Actions (build + firma + GitHub Release + sync Vercel)

## Comandos (desde la raíz)

```bash
pnpm dev          # desarrollo
pnpm build        # build de producción
pnpm preview      # previsualizar build
pnpm lint         # ESLint
pnpm typecheck    # vue-tsc
pnpm test         # tests unitarios

pnpm db:generate  # generar migración Postgres (Drizzle)
pnpm db:migrate   # aplicar migraciones
pnpm db:push      # sincronizar schema (solo BD sin datos valiosos)
pnpm db:studio    # Drizzle Studio
pnpm db:generate:sqlite  # migración para el SQLite local
pnpm db:seed      # datos iniciales (bun)

pnpm cap:sync     # copiar web + plugins a android/
pnpm cap:open     # abrir en Android Studio
```

## Estructura

- `app/` — frontend: `pages/`, `composables/` (dominio + datos:
  `useRepo`, `useSync`, `useCuadre`, `useTableCrud`…),
  `components/base/` (reutilizables: `Table`, `Form`, `Dialog`…),
  `server-offline/` (SQLite + módulos CRUD offline).
- `server/api/` — rutas Nitro por recurso (`productos/`, `cuadres/`,
  `sync/`…). Convención: `index.get.ts`, `index.post.ts`, `[id].patch.ts`.
- `shared/` — `tables.js` (config de tablas, fuente única de verdad),
  `schemas/` (Zod), `mutations/`, `types.ts`, `constants.ts`.
- `android/` — proyecto nativo Capacitor (compilado 36).
- `docs/` — guías del proyecto (ver abajo).

## Documentación

- `docs/PUBLICAR_VERSION.md` — runbook de producción: Caso A (release
  web+APK, lo habitual), Caso B (solo web), Caso C (cambio de esquema).
- `docs/CREAR_NUEVA_ENTIDAD.md` — cómo añadir una tabla/entidad nueva.
- `docs/ANDROID_BUILD_GUIDE.md` — build, emulador y debug Android.

## Producción (resumen)

Cada release es un tag `vX.Y+Z` (ej. `v1.2+3`):

```bash
git tag -a v1.3+4 -m "release: v1.3 (versionCode 4)" -m "Notas de la versión"
git push origin v1.3+4
```

El workflow `release-apk` compila la web, genera la APK firmada, la publica
como asset del GitHub Release, actualiza las variables en Vercel, redeplega
y verifica `/api/app-version`. Detalle completo en el Caso A de
`docs/PUBLICAR_VERSION.md`. Los binarios **nunca** se commitean al repo.

## Desarrollo local

```bash
1. pnpm install
2. Copiar .env.example → .env y completar (DATABASE_URL, JWT_SECRET…)
3. pnpm db:generate && pnpm db:migrate && pnpm db:seed
4. pnpm dev   # servidor en 0.0.0.0:3000
```

Para probar en Android físico, seguir `docs/ANDROID_BUILD_GUIDE.md`
(la URL del servidor se configura en Ajustes dentro de la propia app).
