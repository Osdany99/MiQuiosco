# Publicar cambios — MiQuiosco (runbook)

Guía paso a paso para llevar cambios a producción (web + APK). Lee primero
**Conceptos** y luego sigue el caso que corresponda: **A** (web+APK nueva, el
habitual — automática desde GitHub), **B** (solo web/servidor) o **C** (con
cambio de esquema de BD).

## Conceptos

- `versionCode` (entero): lo que se compara. **Siempre incremental, nunca se
  reutiliza ni se baja.** Desde la automatización sale del tag:
  `v{versionName}+{versionCode}` (ej. `v1.2+3` → `versionName "1.2"`,
  `versionCode 3`). El workflow lo inyecta en `android/app/build.gradle`.
- `versionName` (ej. `"1.2"`): solo informativo para el usuario.
- `APP_MIN_VERSION_CODE`: por debajo de este código la actualización es
  **obligatoria** (bloquea la app) y el servidor responde `426` a esa APK.
- `APP_LATEST_VERSION_CODE`: por encima de la instalada hay actualización
  **opcional** (descartable, con "Más tarde" que no vuelve a insistir para
  esa misma versión).
- La web se actualiza sola al recargar (assets con hash, sin caché vieja).
- La APK se distribuye como asset del **GitHub Release** (ya no se commitea a
  `public/apk/`). `APP_APK_URL` en Vercel apunta a la URL de ese asset
  (el cliente acepta URLs absolutas `https://...` sin cambios de código).
- Transición: `public/apk/miquiosco-v1.1.apk` sigue commiteado hasta que el
  primer Release de GitHub esté verificado y `APP_APK_URL` apunte allí.
  Después se borra y se quita su excepción del `.gitignore`.

## Requisito previo (una sola vez): secretos en GitHub

`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `miquiosco-prod.jks` en base64 (ver abajo cómo generarlo) |
| `KEYSTORE_STORE_PASSWORD` | password del store |
| `KEYSTORE_KEY_ALIAS` | alias (`miquiosco`) |
| `KEYSTORE_KEY_PASSWORD` | password de la key |
| `SYNC_SERVER_URL` | `https://mi-quiosco.vercel.app` |

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

1. Si el release cambia el esquema: ir al **Caso C** primero y volver aquí.
2. Commit + push de tus cambios a la rama principal:
   ```powershell
   git add -A; git commit -m "feat: ..."; git push
   ```
3. Crear y subir el tag (formato obligatorio `vX.Y+Z`). El cuerpo del tag
   (`-m` adicionales) se usa como `APP_CHANGELOG`:
   ```powershell
   git tag -a v1.3+4 -m "release: v1.3 (versionCode 4)" -m "Notas breves de la versión"
   git push origin v1.3+4
   ```
   Esto dispara el workflow `release-apk`, que hace **todo solo**:
   - Job `build-release`: build web con URL de producción, `cap sync`,
     verificación de URL, `assembleRelease`, verificación de firma con
     `apksigner` y publicación del **GitHub Release** con la APK adjunta
     (`miquiosco-vX.Y+Z.apk`).
   - Job `sync-vercel`: actualiza en Vercel `APP_LATEST_VERSION_CODE`,
     `APP_LATEST_VERSION_NAME`, `APP_MIN_VERSION_CODE` (= latest, o sea
     actualización **obligatoria**), `APP_APK_URL` (URL del asset recién
     creado) y `APP_CHANGELOG`; luego redeploy a producción y verifica
     `/api/app-version`.
4. Vigilar el run en `Actions → release-apk` hasta que los 2 jobs estén en
   verde (tarda ~8–10 min en total).
5. Probar en dispositivo físico los 3 caminos:
   - [ ] APK al día → sin avisos.
   - [ ] APK una versión atrás (opcional) → diálogo descartable, "Más tarde"
         no vuelve a insistir, "Actualizar" abre el navegador con la APK.
   - [ ] APK bajo el mínimo (obligatoria) → overlay no descartable y el
         servidor responde `426` al intentar sincronizar.
6. Tras el primer Release verificado: borrar `public/apk/miquiosco-v1.1.apk`
   del repo y quitar su excepción (`!public/apk/...`) del `.gitignore`.

Si el workflow falla: revisa el log del paso en rojo. Los fallos
intencionados (gates) son: tag con formato inválido, secretos ausentes
(firma o `VERCEL_TOKEN`), assets con `localhost` (secret `SYNC_SERVER_URL`
mal puesto), firma ausente en el APK o manifiesto que no refleja la versión.

> Para que una versión sea **opcional** en vez de obligatoria, baja
> `APP_MIN_VERSION_CODE` en el dashboard de Vercel tras el release
> (el workflow siempre publica como obligatoria, lo seguro).

## Caso B — Solo web/servidor (sin APK nueva)

1. `pnpm lint && pnpm test && pnpm typecheck`.
2. Si hay cambio de esquema → **Caso C** primero.
3. Commit + push. Vercel redespliega solo.
4. Si el cambio rompe APKs ya instaladas → subir `APP_MIN_VERSION_CODE` en
   Vercel y redeploy (sin necesidad de APK nueva).
5. La web se actualiza sola al recargar.

## Caso C — Cambio de esquema de BD

1. Editar `server/database/schema.ts` (nunca el SQL de `drizzle/` a mano).
2. Generar migración: `pnpm db:generate` (Postgres). Si toca al cliente
   (SQLite offline): `pnpm db:generate:sqlite`.
3. Aplicar contra Neon **desde tu PC** (la URL directa va en un archivo
   temporal, nunca en el chat):
   ```powershell
   Set-Content C:\Users\Osdany\AppData\Local\Temp\opencode\neon.url -Value "URL_DIRECTA_NEON_POOLING_OFF" -NoNewline
   $env:DATABASE_URL = (Get-Content C:\Users\Osdany\AppData\Local\Temp\opencode\neon.url -Raw).Trim()
   pnpm db:migrate
   ```
   Si `migrate` falla por historial divergente en BD vacía, alternativa:
   `pnpm db:push --force` (aplica el estado final del schema; solo en BD
   sin datos valiosos o tras vaciar `public`).
4. Si el cambio rompe compatibilidad con APKs viejas → la release debe ser
   **obligatoria** (`APP_MIN_VERSION_CODE = APP_LATEST_VERSION_CODE`).
5. Volver al caso A (paso 2) o B (paso 3).

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

- **El workflow falla en "Parsear tag"**: el tag no sigue `vX.Y+Z`.
  Borra el tag (`git tag -d v...; git push origin :refs/tags/v...`) y créalo
  de nuevo con el formato correcto.
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
$env:NUXT_PUBLIC_SYNC_SERVER_URL = "https://mi-quiosco.vercel.app"
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
