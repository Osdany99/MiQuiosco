# Publicar cambios — MiQuiosco (runbook)

Guía paso a paso para llevar cambios a producción (web + APK). Lee primero
**Conceptos** y luego sigue el caso que corresponda: **A** (web+APK nueva, el
habitual — automática desde GitHub), **B** (solo web/servidor) o **C** (con
cambio de esquema de BD).

## Conceptos

- `versionCode` (entero): lo que se compara. **Siempre incremental, nunca se
  reutiliza ni se baja.** Desde la automatización sale del tag:
  `v{versionName}.{versionCode}` (ej. `v1.2.3` → `versionName "1.2"`,
  `versionCode 3`). El workflow lo inyecta en `android/app/build.gradle`.
  El `+` está prohibido en tags y APKs: GitHub devuelve 404 en la descarga
  directa aunque el asset exista (los releases `v1.2+3`/`v1.3+4` quedaron
  como historia con links rotos).
  **El `versionCode` nunca puede ser `0`**: Android exige un entero positivo y
  el build aborta con `android.defaultConfig.versionCode is set to 0`. El
  workflow no lo valida, así que un tag tipo `v1.4.0` pasa el gate de formato y
  revienta más tarde, ya en Gradle. Al bumpear la versión menor, comprueba que
  el tercer número suba de verdad (de `v1.3.5` a `v1.4.0` **no** es válido:
  mejor `v1.4.6`).
- `versionName` (ej. `"1.2"`): solo informativo para el usuario.
- `APP_MIN_VERSION_CODE`: por debajo de este código la actualización es
  **obligatoria** (bloquea la app) y el servidor responde `426` a esa APK.
- `APP_LATEST_VERSION_CODE`: por encima de la instalada hay actualización
  **opcional** (descartable, con "Más tarde" que no vuelve a insistir para
  esa misma versión).
- La web se actualiza sola al recargar (assets con hash, sin caché vieja).
- La APK se distribuye como asset del **GitHub Release** (no se commitea a
  `public/apk/`). `APP_APK_URL` en Vercel apunta a la URL de ese asset
  (el cliente acepta URLs absolutas `https://...` sin cambios de código).

## Requisito previo (una sola vez): secretos en GitHub

`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `miquiosco-prod.jks` en base64 (ver abajo cómo generarlo) |
| `KEYSTORE_STORE_PASSWORD` | password del store |
| `KEYSTORE_KEY_ALIAS` | alias (`miquiosco`) |
| `KEYSTORE_KEY_PASSWORD` | password de la key |
| `SYNC_SERVER_URL` | `https://mi-quiosco.vercel.app` |
| `VERCEL_TOKEN` | token de tu cuenta Vercel con acceso al proyecto (lo usa el job `sync-vercel` para actualizar variables y redeplegar; nunca al chat ni al repo) |
| `DATABASE_URL_PROD` | URL **directa** de Neon (la que dice "Direct connection", sin `-pooler`); la usa el job `migrate-db` con `drizzle-kit migrate` |

Generar el base64 en tu PC (no pegues el `.jks` ni passwords en el chat):

```powershell
$bytes = [IO.File]::ReadAllBytes("android\miquiosco-prod.jks")
[Convert]::ToBase64String($bytes) | Set-Content C:\Users\Osdany\AppData\Local\Temp\opencode\keystore.b64 -NoNewline
# Copia el contenido de keystore.b64 al secret ANDROID_KEYSTORE_BASE64 y borra el archivo temporal.
Remove-Item C:\Users\Osdany\AppData\Local\Temp\opencode\keystore.b64 -Force
```

Copia de seguridad del keystore: `Documents\MiQuiosco-seguro\<fecha>\`
(`miquiosco-prod.jks` + `keystore.properties` + `LEEME.txt`). Sin estos
archivos no se pueden firmar futuras actualizaciones compatibles.

## Caso A — Release completo (web + APK nueva). El habitual. Automático.

```powershell
# 0. Verificaciones locales (desde la raíz del proyecto)
pnpm lint && pnpm test && pnpm typecheck
```

1. Si el release cambia el esquema de forma **destructiva** (renombrar o
   borrar columnas/tablas): ir al **Caso C** primero y volver aquí.
   Si el cambio es **aditivo** (añadir tablas/columnas nullable o con
   default, índices): solo genera y commitea la migración
   (`pnpm db:generate`) — el workflow la aplica solo en `migrate-db`.
2. Commit + push de tus cambios a la rama principal:
   ```powershell
   git add -A; git commit -m "feat: ..."; git push
   ```
3. Crear y subir el tag (formato obligatorio `vX.Y.N`, sin `+`). El cuerpo del tag
   (`-m` adicionales) se usa como `APP_CHANGELOG`:
   ```powershell
   git tag -a v1.3.5 -m "release: v1.3 (versionCode 5)" -m "Notas breves de la versión"
   git push origin v1.3.5
   ```
   Antes de subirlo, verifica que el tercer número es un entero **positivo y
   mayor** que el del último release (`v1.4.0` daría `versionCode 0` y el build
   falla en Gradle aunque el tag tenga buena pinta):
   ```powershell
   "v1.4.6" -match '^v([0-9]+\.[0-9]+)\.([0-9]+)$'   # versionName=1.4 versionCode=6
   ```
    Esto dispara el workflow `release-apk`, que hace **todo solo**:
    - Job `migrate-db`: verifica que `drizzle/` esté generado al día con el
      schema y aplica las migraciones pendientes en Neon con
      `drizzle-kit migrate` (idempotente: si la BD ya está al día, no hace
      nada). Si falla, el release se aborta aquí y no se publica nada.
   - Job `build-release`: build web con URL de producción, `cap sync`,
     verificación de URL, `assembleRelease`, verificación de firma con
     `apksigner` y publicación del **GitHub Release** con la APK adjunta
     (`miquiosco-vX.Y.N.apk`).
   - Job `sync-vercel`: actualiza en Vercel `APP_LATEST_VERSION_CODE`,
     `APP_LATEST_VERSION_NAME`, `APP_MIN_VERSION_CODE` (= latest, o sea
     actualización **obligatoria**), `APP_APK_URL` (URL del asset recién
     creado) y `APP_CHANGELOG`; luego redeploy a producción y verifica
     `/api/app-version`.
4. Vigilar el run en `Actions → release-apk` hasta que los 3 jobs estén en
   verde (tarda ~10–12 min en total).
5. Probar en dispositivo físico los 3 caminos:
   - [ ] APK al día → sin avisos.
   - [ ] APK una versión atrás (opcional) → diálogo descartable, "Más tarde"
         no vuelve a insistir, "Actualizar" abre el navegador con la APK.
   - [ ] APK bajo el mínimo (obligatoria) → overlay no descartable y el
         servidor responde `426` al intentar sincronizar.

Si el workflow falla: revisa el log del paso en rojo. Los fallos
intencionados (gates) son: tag con formato inválido, secretos ausentes
(firma, `VERCEL_TOKEN` o `DATABASE_URL_PROD`), schema sin migración
generada (`drizzle/` desactualizado), error al migrar Neon (el release se
aborta antes de compilar), assets con `localhost` (secret `SYNC_SERVER_URL`
mal puesto), firma ausente en el APK o manifiesto que no refleja la versión.

> Para que una versión sea **opcional** en vez de obligatoria, baja
> `APP_MIN_VERSION_CODE` en el dashboard de Vercel tras el release
> (el workflow siempre publica como obligatoria, lo seguro).

## Caso B — Solo web/servidor (sin APK nueva)

1. `pnpm lint && pnpm test && pnpm typecheck`.
2. Si hay cambio **destructivo** de esquema → **Caso C** primero.
   Si es aditivo, genera y commitea la migración (`pnpm db:generate`).
3. Commit + push. Vercel redespliega solo.
4. Si el cambio rompe APKs ya instaladas → subir `APP_MIN_VERSION_CODE` en
   Vercel y redeploy (sin necesidad de APK nueva).
5. La web se actualiza sola al recargar.

## Caso C — Cambio destructivo de esquema de BD (manual)

El caso normal (**aditivo**: añadir tablas, columnas nullable o con
default, índices) **ya es automático**: generas la migración
(`pnpm db:generate`), la commiteas, y el job `migrate-db` la aplica en Neon
al crear el tag. Este Caso C es solo para cambios **destructivos**
(renombrar/borrar columnas o tablas) o BD vacía:

1. Editar `server/database/schema.ts` (nunca el SQL de `drizzle/` a mano).
2. Generar migración: `pnpm db:generate` (Postgres). Si toca al cliente
   (SQLite offline): `pnpm db:generate:sqlite`.
3. Aplicar contra Neon **desde tu PC** (la URL directa va en un archivo
   temporal, nunca en el chat):
   ```powershell
   Set-Content C:\Users\Osdany\AppData\Local\Temp\opencode\neon.url -Value "URL_DIRECTA_NEON" -NoNewline
   $env:DATABASE_URL = (Get-Content C:\Users\Osdany\AppData\Local\Temp\opencode\neon.url -Raw).Trim()
   pnpm db:migrate
   Remove-Item C:\Users\Osdany\AppData\Local\Temp\opencode\neon.url -Force
   ```
   Si `migrate` falla por historial divergente en BD vacía, alternativa:
   `pnpm db:push --force` (aplica el estado final del schema; solo en BD
   sin datos valiosos o tras vaciar `public`).
4. Regla **expand-only** para no romper la ventana entre migración y deploy:
   primero se publica lo aditivo (automático) y lo destructivo va después,
   en su propio release y siempre **obligatorio**
   (`APP_MIN_VERSION_CODE = APP_LATEST_VERSION_CODE`).
5. Volver al caso A (paso 2) o B (paso 3).

Notas:
- Drizzle-kit no genera migraciones reversas ("down"): si una migración
  aplicada rompe algo, se arregla **hacia adelante** con una nueva
  migración, nunca editando SQL ya aplicado en producción.
- Si `migrate-db` falla en rojo en el CI, el release queda abortado a
  propósito: corrige (nueva migración + nuevo tag con versionCode mayor)
  y vuelve a publicar. La BD nunca queda a medias: cada archivo SQL del
  journal se aplica o no se aplica entero.

## Notas permanentes (no olvidar)

- **Keystore** (`android/miquiosco-prod.jks` + `android/keystore.properties`):
  críticos y gitignored. Copia en `Documents\MiQuiosco-seguro\` **más una
  segunda copia externa** (USB/otro disco).
- **PIN del jefe en producción**: el seed crea `jefe / 1234` temporal.
  Cambiarlo al entrar en producción.
- **Secretos**: `.env`, `neon.url`, `keystore.b64`, tokens de Vercel → nunca
  al chat ni al repo. Los temporales de `Temp\opencode\`, borrarlos al terminar.
- `AGENTS.md` y `opencode.json` son locales (gitignored): no commitear.

## Problemas conocidos (y su solución)

- **El workflow falla en "Parsear tag"**: el tag no sigue `vX.Y.N`.
  Borra el tag (`git tag -d v...; git push origin :refs/tags/v...`) y créalo
  de nuevo con el formato correcto.
- **El build falla con `versionCode is set to 0`**: el tag era `vX.Y.0`. El
  gate de formato lo acepta (el `0` es un entero válido para la regex) pero
  Android exige un entero positivo. republica con el tercer número ≥1 y mayor
  que el anterior: `v1.4.0` → `v1.4.6`.
- **El workflow falla al borrar o crear el tag** (`Cannot delete this tag`,
  `creations being restricted`): es el ruleset `release-tags` acting. Es
  intencional; como admin lo autorizas con el bypass y el run continúa.
- **El workflow falla en "Verificar secretos de firma"**: falta algún secret.
  Revisa la tabla de la sección "Requisito previo".
- **El workflow falla en "Verificar URL de producción"**: el secret
  `SYNC_SERVER_URL` está vacío o apunta a localhost.
- **Build colgado que nunca termina** (Vercel en BUILDING eterno): un
  `setInterval`/`setTimeout` a nivel de módulo en `server/` mantiene vivo el
  proceso tras el prerender. Solución: `.unref()` al timer
  (ver `server/middleware/rateLimit.ts`). Todo timer global en servidor debe
  llevarlo.
- **Vercel bloquea guardar `NUXT_PUBLIC_SYNC_SERVER_URL`**: el prefijo
  `NUXT_PUBLIC_` está reservado en su UI. Se usa `SYNC_SERVER_URL`
  (ver `nuxt.config.ts`).
- **Deploy "Blocked" por email del commit**: configurar solo para este repo
  `git config user.email "tu-email-de-github"` (sin `--global` para no
  afectar otros proyectos/GitLab) y pushear un commit nuevo.
- **`db:seed` con bun ignora `DATABASE_URL` del shell**: bun carga el
  `.env` local por encima. Usar wrapper que reasigne
  `process.env.DATABASE_URL` antes de importar el seed, o correr el seed
  contra la URL correcta explícitamente.
- **Login 500 local tras tocar env**: el `.env` lleva `DATABASE_URL` entre
  comillas; al parsearlo a mano hay que retirarlas.

## Apéndice — Build local manual (fallback si GitHub Actions no está disponible)

Solo si el workflow no puede usarse. Requiere JDK de Android Studio y SDK
locales:

```powershell
$env:SYNC_SERVER_URL = "https://mi-quiosco.vercel.app"
pnpm build
pnpm cap:sync
# Abrir android/app/src/main/assets/public/index.html y confirmar que
# syncServerUrl es https://mi-quiosco.vercel.app
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\Osdany\AppData\Local\Android\Sdk"
cd android; .\gradlew.bat assembleRelease --console=plain; cd ..
$bt = "C:\Users\Osdany\AppData\Local\Android\Sdk\build-tools"
$ver = (Get-ChildItem $bt -Directory | Sort-Object Name -Descending)[0].Name
& "$bt\$ver\apksigner.bat" verify --print-certs android\app\build\outputs\apk\release\app-release.apk
# Debe mostrar firmante release. Si falla, no distribuir.
```

## Fase 8 (futura): entrega interna en la app (modo B)

Sin tocar servidor ni decisión de versiones, solo cliente + nativo:

1. `pnpm add @m430/capacitor-app-install` (o equivalente) + `cap:sync`.
2. `AndroidManifest.xml`: permiso `REQUEST_INSTALL_PACKAGES` + `FileProvider`
   (`${applicationId}.fileprovider`) y `res/xml/file_paths.xml`.
3. Implementar `entregarDescargaInterna(url)` en `useAppUpdate.js`:
   `Filesystem.downloadFile` al `Cache` con progreso → `installApk`.
   El fallback al navegador ya existe: si B falla, cae solo a A.
4. Probar en dispositivo físico (varios fabricantes si es posible).
