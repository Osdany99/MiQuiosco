# Guía de Build Android - MiQuiosco

## Prerrequisitos

### 1. Java Development Kit (JDK 17+)
```bash
java -version
# Debe mostrar 17.x o superior
```

Android Studio incluye su propio JDK (ubicado en `C:\Program Files\Android\Android Studio\jbr\`). Si prefieres usar tu propio JDK:
- **Windows**: descargar de https://adoptium.net/ y configurar `JAVA_HOME`
- Android Studio detecta automáticamente el JDK incluido

### 2. Android Studio
Descargar e instalar desde: https://developer.android.com/studio

Durante la instalación asegúrate de incluir:
- **Android SDK Platform 36**
- **Android SDK Build-Tools 36.0.0**
- **Android Emulator** (opcional, para probar sin dispositivo físico)

Android Studio instalará el SDK en:
- **Windows**: `C:\Users\<tu_usuario>\AppData\Local\Android\Sdk`
- **Linux**: `~/Android/Sdk`

### 3. Verificar SDK desde Android Studio
1. Abrir Android Studio
2. Ir a **File → Settings** (Windows/Linux) o **Android Studio → Preferences** (macOS)
3. Navegar a **Appearance & Behavior → System Settings → Android SDK**
4. Verificar que **Android 16.0 (API 36)** esté instalado en la pestaña **SDK Platforms**
5. En la pestaña **SDK Tools**, verificar **Android SDK Build-Tools 36** y **Android Emulator**
6. Anotar la ruta del SDK (se necesita para `local.properties`)

---

## Setup inicial (primera vez)

```bash
# 1. Instalar dependencias del proyecto
pnpm install

# 2. Build de Nuxt (genera la versión estática en .output/public)
pnpm run build

# 3. Añadir la plataforma Android (SOLO LA PRIMERA VEZ)
npx cap add android

# 4. Sincronizar Capacitor: copia assets web + configura plugins a android/
pnpm run cap:sync
```

### Abrir proyecto en Android Studio
1. **File → Open...** → seleccionar la carpeta `android/` dentro del proyecto
2. Android Studio detecta `build.gradle` y empieza a sincronizar Gradle automáticamente
3. Esperar que la barra de progreso "Sync" termine (primera vez descarga dependencias)

### Configurar SDK en el proyecto (solo primera vez)
Android Studio crea automáticamente `android/local.properties` con la ruta del SDK. Si no aparece:
- **File → Project Structure → SDK Location** → verificar que la ruta al SDK sea correcta

---

## Build Debug APK + Run en dispositivo

### Método recomendado — Android Studio Run ▶
1. Conectar dispositivo Android por USB con **depuración USB** activada
   - En el dispositivo: **Settings → Developer Options → USB Debugging**
   - Si no ves Developer Options: **Settings → About Phone** → tocar "Build Number" 7 veces
2. En Android Studio: seleccionar el dispositivo en el dropdown de **Run/Debug Configurations**
3. Hacer clic en **Run ▶** (o **Shift+F10**)
4. Android Studio compila, firma con debug keystore, instala y ejecuta la app

### APK debug sin Run (para distribuir)
**Compilar → Compilar lote(s) / APK(s) → Compilar APK(s)**
El APK firmado con debug keystore queda en:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Build Release APK (firmado para producción)

> **Vía oficial: automática.** La release de producción se genera con el
> workflow `release-apk` de GitHub Actions (ver **Caso A** en
> `docs/PUBLICAR_VERSION.md`): creas el tag `vX.Y.N`, el CI compila, firma
> con `apksigner`, publica el GitHub Release y actualiza Vercel solo.
> Lo de abajo es solo fallback manual.

En Android Studio (manual, solo si el workflow no está disponible):
1. **Compilar → Generar paquete / APK firmado...**
2. Seleccionar **APK** → **Siguiente**
3. Si no tienes keystore: hacer clic en **Crear nuevo...** (Key store path, Password, Key alias, etc.)
4. Si ya tienes keystore: seleccionar archivo y llenar credenciales
5. Elegir **release** en la lista **Build Variants**
6. Seleccionar **V1 (Jar Signature)** y **V2 (Full APK Signature)** → **Terminar**

El APK firmado queda en:
```
android/app/build/outputs/apk/release/app-release.apk
```

---

## Build con emulador (sin dispositivo físico)

1. En Android Studio: **Tools → Device Manager**
2. **Create device** → seleccionar modelo (Pixel 6, etc.) → **Next**
3. Seleccionar **API 36** (Android 16) → descargar si no está instalada
4. **Finish**
5. En el dropdown de Run, seleccionar el emulador creado y hacer clic en **Run ▶**

---

## Flujo de trabajo diario

Cada vez que cambies código frontend:
```bash
# Terminal — rebuild assets web
pnpm build && pnpm cap:sync
```
Luego en Android Studio:
- Si ya está corriendo: el botón **Apply Changes** (⚡) actualiza solo los assets sin reinstalar
- O hacer clic en **Run ▶** (▶) para reinstalar completo

### Solo cambios en el frontend (sin cambios en plugins nativos)
`pnpm cap:sync` copia `capacitor.config.json` y los assets de `.output/public` a `android/`.
Después de sync, **Run ▶** o **Apply Changes** en Android Studio.

---

## Logs y depuración

### Usando Android Studio — Logcat
1. Abrir la pestaña **Logcat** en la parte inferior de Android Studio
2. En el filtro, escribir `MiQuiosco` o `com.miquiosco.app`
3. Los logs de WebView (console.log, errores JS) aparecen aquí con tag `Capacitor/WebView`

### Ver logs en tiempo real filtrados
En el campo de búsqueda del Logcat:
```
package:com.miquiosco.app
```
O para ver solo errores:
```
package:com.miquiosco.app level:ERROR
```

---

## Estructura de carpetas Android relevante

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/miquiosco/app/
│   │   │   └── MainActivity.java
│   │   └── assets/
│   │       └── cap_config.json       # Config generada por Capacitor
│   └── build.gradle
├── build.gradle
├── settings.gradle
├── gradle.properties
├── variables.gradle                  # Versiones SDK (compile/target 36)
├── local.properties                  # Ruta del SDK (auto-generado)
└── gradlew / gradlew.bat
```

### Permisos en AndroidManifest.xml
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Estos permisos se mantienen automáticamente al hacer `cap sync` desde `capacitor.config.json`.

---

## Configuración del servidor para acceso desde Android

### En la laptop (servidor Nuxt)
```bash
# .env
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
```

```bash
pnpm run dev
# Servidor escucha en http://0.0.0.0:3000

# Obtener IP de la laptop en la red WiFi:
# Windows: ipconfig | findstr IPv4
```

### En el Android
- La URL del servidor se configura **en la propia app** (Ajustes → URL del
  servidor), ej. `http://<IP_LAPTOP>:3000` para desarrollo local.
- **Requisito para desarrollo**: móvil y laptop en la misma WiFi.
- En producción la app usa la URL del GitHub Release / Vercel; no hay que
  configurar nada.

---

## Troubleshooting común

### Error: "SDK location not found"
Android Studio debería crear `android/local.properties` automáticamente. Si no:
- **File → Project Structure → SDK Location** → establecer la ruta al SDK

### Error: "Gradle sync failed"
- **File → Sync Project with Gradle Files**
- Si persiste: **File → Invalidate Caches → Invalidate and Restart**

### Error: "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
El dispositivo tiene una versión anterior instalada. Desinstalar la app manualmente y volver a hacer **Run ▶**

### Error: "Cleartext traffic not permitted"
La app necesita HTTP para conectarse al servidor local. Verificar `capacitor.config.json`:
```json
{
  "android": { "allowMixedContent": true }
}
```
Después de cambiar, ejecutar `pnpm run cap:sync` y **Run ▶** de nuevo.

### App se cierra al abrir (crash en WebView)
1. Abrir la pestaña **Logcat** en Android Studio
2. Filtrar por `com.miquiosco.app`
3. Buscar errores de SQLite, permisos, o excepciones de WebView

### SQLite no funciona en Android
```bash
# Verificar que @capacitor-community/sqlite esté en package.json
pnpm cap:sync   # regenera la configuración de plugins
```
No hace falta registrar el plugin a mano: `MainActivity.java` extiende
`BridgeActivity` y Capacitor registra los plugins automáticamente con cada
`cap sync`.

### Copiar base de datos SQLite del dispositivo (para debug)
```bash
# La BD local se llama miquioscoSQLite.db (ver DB_NAME en app/server-offline/db/client.js)
adb shell run-as com.miquiosco.app cp /data/data/com.miquiosco.app/databases/miquioscoSQLite.db /sdcard/miquioscoSQLite.db
adb pull /sdcard/miquioscoSQLite.db .

# O desde Android Studio: Device Explorer (View → Tool Windows → Device Explorer)
```

---

## Comandos útiles (terminal)

```bash
# Build + sync rápido (para luego abrir Android Studio)
pnpm build && pnpm cap:sync

# Ver dispositivos conectados
adb devices

# Instalar APK manual (alternativa a Run ▶)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Checklist previo a entrega a la jefa/trabajadores

- [ ] Release generada por el flujo automático (`docs/PUBLICAR_VERSION.md` Caso A: tag → GitHub Actions → Release + Vercel)
- [ ] Probar en dispositivo físico (no solo emulador) los 3 caminos de actualización (al día / opcional / obligatoria)
- [ ] Verificar login offline (sin WiFi)
- [ ] Verificar cuadre completo offline
- [ ] Verificar sincronización con servidor
- [ ] Verificar gráficas cargan offline (contra SQLite local)
