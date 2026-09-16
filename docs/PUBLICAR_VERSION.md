# Publicar una versión — MiQuiosco

Checklist para sacar una release de la APK y/o del servidor. El sistema de
actualización solo gobierna a partir de la primera APK que incluya
`useAppUpdate`: las APKs anteriores a ese código no pueden auto-detectar
nada y hay que reemplazarlas a mano una sola vez.

## Conceptos

- `versionCode` (entero en `android/app/build.gradle`): lo que se compara.
  **Siempre incremental, nunca se reutiliza ni se baja.**
- `versionName` (ej. `"1.1"`): solo informativo para el usuario.
- `APP_MIN_VERSION_CODE`: por debajo de este código la actualización es
  **obligatoria** (bloquea la app) y el servidor responde `426` a esa APK.
- `APP_LATEST_VERSION_CODE`: por encima de la instalada hay actualización
  **opcional** (descartable, con "Más tarde" que no vuelve a insistir para
  esa misma versión).

## Checklist de release de APK

1. Subir `versionCode` (+1 mínimo) y `versionName` en
   `android/app/build.gradle`.
2. `pnpm build && pnpm cap:sync` (usa `.output/public`, igual que antes).
3. En Android Studio: **Build → Generate Signed APK → release**
   (`android/app/build/outputs/apk/release/app-release.apk`).
4. Renombrar a `miquiosco-vX.Y.apk` y copiarlo a `public/apk/`
   (está en `.gitignore`: no se commitea, se sube al desplegar).
5. Fijar en el host (Vercel → Environment Variables) y en tu `.env`:
   `APP_LATEST_VERSION_CODE`, `APP_LATEST_VERSION_NAME`,
   `APP_MIN_VERSION_CODE` (igual al latest = obligatoria; menor = opcional),
   `APP_APK_URL=/apk/miquiosco-vX.Y.apk`, `APP_CHANGELOG` (notas breves).
6. Desplegar el servidor (git push → Vercel).
7. Probar en dispositivo físico los 3 caminos:
   - [ ] APK al día → sin avisos.
   - [ ] APK una versión atrás (opcional) → diálogo descartable, "Más tarde"
         no vuelve a insistir, "Actualizar" abre el navegador con la APK.
   - [ ] APK bajo el mínimo (obligatoria) → overlay no descartable y el
         servidor responde `426` al intentar sincronizar.
8. Si el release cambia el esquema SQLite (`drizzle/sqlite/*`) o el de
   Postgres (`drizzle/*`): la actualización debe ser **obligatoria**
   (`APP_MIN_VERSION_CODE = APP_LATEST_VERSION_CODE`) y hay que correr
   `pnpm db:migrate` contra la nube antes de desplegar.

## Checklist de release solo-servidor (sin APK nueva)

1. Cambios de esquema → `pnpm db:generate` (+ `db:generate:sqlite` si toca
   al cliente) → `db:migrate` contra la nube → desplegar.
2. La web se actualiza sola al recargar (assets con hash, sin caché vieja).
3. Si el cambio rompe APKs ya instaladas → subir `APP_MIN_VERSION_CODE`.

## Fase 8 (futura): entrega interna en la app (modo B)

Sin tocar servidor ni decisión de versiones, solo cliente + nativo:

1. `pnpm add @m430/capacitor-app-install` (o equivalente) + `cap:sync`.
2. `AndroidManifest.xml`: permiso `REQUEST_INSTALL_PACKAGES` + `FileProvider`
   (`${applicationId}.fileprovider`) y `res/xml/file_paths.xml`.
3. Implementar `entregarDescargaInterna(url)` en `useAppUpdate.js`:
   `Filesystem.downloadFile` al `Cache` con progreso → `installApk`.
   El fallback al navegador ya existe: si B falla, cae solo a A.
4. Probar en dispositivo físico (varios fabricantes si es posible).
