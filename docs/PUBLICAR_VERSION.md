# Publicar cambios — MiQuiosco (runbook)

Guía paso a paso para llevar cambios a producción (web + APK). Lee primero
**Conceptos** y luego sigue el caso que corresponda: **A** (web+APK, el
habitual), **B** (solo web/servidor) o **C** (con cambio de esquema de BD).

## Conceptos

- `versionCode` (entero en `android/app/build.gradle`): lo que se compara.
  **Siempre incremental, nunca se reutiliza ni se baja.**
- `versionName` (ej. `"1.1"`): solo informativo para el usuario.
- `APP_MIN_VERSION_CODE`: por debajo de este código la actualización es
  **obligatoria** (bloquea la app) y el servidor responde `426` a esa APK.
- `APP_LATEST_VERSION_CODE`: por encima de la instalada hay actualización
  **opcional** (descartable, con "Más tarde" que no vuelve a insistir para
  esa misma versión).
- La web se actualiza sola al recargar (assets con hash, sin caché vieja).
- El APK se sirve desde el propio dominio: `APP_APK_URL=/apk/miquiosco-vX.Y.apk`
  (el archivo vive en `public/apk/` y **sí se commitea** — ver paso 8).

## Caso A — Release completo (web + APK nueva). El habitual.

```powershell
# 0. Verificaciones locales (desde la raíz del proyecto)
pnpm lint && pnpm test && pnpm typecheck
```

1. Subir `versionCode` (+1 mínimo) y `versionName` en
   `android/app/build.gradle`.
2. Si el release cambia el esquema: ir al **Caso C** primero y volver aquí.
3. Fijar versión en Vercel (**Settings → Environment Variables**,
   scopes Production + Preview) y en tu `.env` local:
   `APP_LATEST_VERSION_CODE`, `APP_LATEST_VERSION_NAME`,
   `APP_MIN_VERSION_CODE` (igual al latest = obligatoria; menor = opcional),
   `APP_APK_URL=/apk/miquiosco-vX.Y.apk`, `APP_CHANGELOG` (notas breves).
4. Build web **con la URL de producción** (obligatorio: el `.env` local trae
   `NUXT_PUBLIC_SYNC_SERVER_URL=http://127.0.0.1:3000` y pisa el valor si no
   se exporta):
   ```powershell
   $env:SYNC_SERVER_URL = "https://mi-quiosco.vercel.app"
   $env:NUXT_PUBLIC_SYNC_SERVER_URL = "https://mi-quiosco.vercel.app"
   pnpm build
   ```
   Debe terminar solo con `exit=0` y `✨ Build complete!`. Si se queda
   colgado, ver "Problemas conocidos".
5. Sincronizar y comprobar que la APK llevará la URL buena:
   ```powershell
   pnpm cap:sync
   ```
   Abrir `android/app/src/main/assets/public/index.html` y confirmar que
   `syncServerUrl` es `https://mi-quiosco.vercel.app`.
6. Compilar el APK firmado (usa el JDK de Android Studio; `java` no está en
   el PATH):
   ```powershell
   $env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
   $env:ANDROID_HOME = "C:\Users\Osdany\AppData\Local\Android\Sdk"
   cd android; .\gradlew.bat assembleRelease --console=plain; cd ..
   ```
   Sale en `android/app/build/outputs/apk/release/app-release.apk`.
7. Verificar la firma con `apksigner` (ojo: `jarsigner -verify` dice
   "unsigned" aunque esté bien firmado, porque solo mira firma V1 y aquí
   prima V2):
   ```powershell
   $bt = "C:\Users\Osdany\AppData\Local\Android\Sdk\build-tools"
   $ver = (Get-ChildItem $bt -Directory | Sort-Object Name -Descending)[0].Name
   & "$bt\$ver\apksigner.bat" verify --print-certs android\app\build\outputs\apk\release\app-release.apk
   ```
   Debe mostrar `V2 Signer` con `CN=MiQuiosco`. Si falla, no distribuir.
8. Copiar el APK a `public/apk/miquiosco-vX.Y.apk` y permitir esa versión en
   `.gitignore` (la regla base `public/apk/*.apk` sigue ignorando el resto):
   ```powershell
   Copy-Item android\app\build\outputs\apk\release\app-release.apk public\apk\miquiosco-vX.Y.apk -Force
   ```
   Añadir `!public/apk/miquiosco-vX.Y.apk` al `.gitignore` (y quitar la
   excepción de la versión anterior si ya no se quiere servir).
9. Commit + push (dispara el deploy en Vercel):
   ```powershell
   git add -A; git commit -m "release: vX.Y (versionCode N)"; git push
   ```
   Comprobar en `git status` que `.env`, `*.jks` y `keystore.properties`
   **no** aparecen (están ignorados).
10. Verificar el deploy (esperar a ✓ Ready en Vercel → Deployments):
    ```powershell
    # Manifiesto de versiones
    Invoke-WebRequest https://mi-quiosco.vercel.app/api/app-version -UseBasicParsing
    # APK servida con MIME y tamaño correctos
    Invoke-WebRequest https://mi-quiosco.vercel.app/apk/miquiosco-vX.Y.apk -Method Head -UseBasicParsing
    ```
    La segunda debe devolver `application/vnd.android.package-archive` y el
    tamaño en bytes igual al archivo local.
11. Probar en dispositivo físico los 3 caminos:
    - [ ] APK al día → sin avisos.
    - [ ] APK una versión atrás (opcional) → diálogo descartable, "Más tarde"
          no vuelve a insistir, "Actualizar" abre el navegador con la APK.
    - [ ] APK bajo el mínimo (obligatoria) → overlay no descartable y el
          servidor responde `426` al intentar sincronizar.

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
5. Volver al caso A (paso 3) o B (paso 3).

## Notas permanentes (no olvidar)

- **Keystore** (`android/miquiosco-prod.jks` + `android/keystore.properties`):
  críticos y gitignored. **Guarda copia en lugar seguro**: sin ellos no se
  pueden firmar futuras actualizaciones compatibles.
- **PIN del jefe en producción**: el seed crea `jefe / 1234` temporal.
  Cambiarlo al entrar en producción.
- **Secretos**: `.env`, `neon.url`, tokens de Vercel → nunca al chat ni al
  repo. Los temporales de `Temp\opencode\`, borrarlos al terminar.
- `AGENTS.md` y `opencode.json` son locales (gitignored): no commitear.

## Problemas conocidos (y su solución)

- **Build colgado que nunca termina** (Vercel en BUILDING eterno): un
  `setInterval`/`setTimeout` a nivel de módulo en `server/` mantiene vivo el
  proceso tras el prerender. Solución: `.unref()` al timer
  (ver `server/middleware/rateLimit.ts`). Todo timer global en servidor debe
  llevarlo.
- **Vercel bloquea guardar `NUXT_PUBLIC_SYNC_SERVER_URL`**: el prefijo
  `NUXT_PUBLIC_` está reservado en su UI. Se usa `SYNC_SERVER_URL`
  (ver `nuxt.config.ts`).
- **`syncServerUrl` sale con `localhost` en el build local**: el `.env`
  local tiene prioridad. Exportar ambas variables (paso 4 del caso A).
- **Deploy "Blocked" por email del commit**: configurar solo para este repo
  `git config user.email "tu-email-de-github"` (sin `--global` para no
  afectar otros proyectos/GitLab) y pushear un commit nuevo.
- **`db:seed` con bun ignora `DATABASE_URL` del shell**: bun carga el
  `.env` local por encima. Usar wrapper que reasigne
  `process.env.DATABASE_URL` antes de importar el seed, o correr el seed
  contra la URL correcta explícitamente.
- **Login 500 local tras tocar env**: el `.env` lleva `DATABASE_URL` entre
  comillas; al parsearlo a mano hay que retirarlas.

## Fase 8 (futura): entrega interna en la app (modo B)

Sin tocar servidor ni decisión de versiones, solo cliente + nativo:

1. `pnpm add @m430/capacitor-app-install` (o equivalente) + `cap:sync`.
2. `AndroidManifest.xml`: permiso `REQUEST_INSTALL_PACKAGES` + `FileProvider`
   (`${applicationId}.fileprovider`) y `res/xml/file_paths.xml`.
3. Implementar `entregarDescargaInterna(url)` en `useAppUpdate.js`:
   `Filesystem.downloadFile` al `Cache` con progreso → `installApk`.
   El fallback al navegador ya existe: si B falla, cae solo a A.
4. Probar en dispositivo físico (varios fabricantes si es posible).
