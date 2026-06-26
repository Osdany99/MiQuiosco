# Guía de Build Android - MiQuiosco

## Prerrequisitos

### 1. Java Development Kit (JDK 17+)
```bash
# Verificar instalación
java -version
# Debe mostrar 17.x o superior

# En Windows (con winget):
winget install Microsoft.OpenJDK.17

# En WSL/Ubuntu:
sudo apt update && sudo apt install openjdk-17-jdk
```

### 2. Android SDK Command Line Tools
**NO instalar Android Studio completo**, solo las herramientas de línea de comandos:

```bash
# Descargar desde: https://developer.android.com/studio#command-tools
# Windows: commandlinetools-win-<version>_latest.zip
# Linux: commandlinetools-linux-<version>_latest.zip

# Descomprimir en:
# Windows: C:\Android\cmdline-tools\latest\
# Linux/WSL: ~/Android/cmdline-tools/latest/

# Configurar variables de entorno (agregar a ~/.bashrc o ~/.zshrc):
export ANDROID_HOME=$HOME/Android
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# Windows (PowerShell):
# $env:ANDROID_HOME = "C:\Android"
# $env:PATH += ";$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools"
```

### 3. Instalar paquetes SDK necesarios
```bash
# Aceptar licencias primero
sdkmanager --licenses

# Instalar paquetes requeridos
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

### 4. Verificar instalación
```bash
# Verificar Android SDK
sdkmanager --list_installed | grep -E "platform-tools|platforms;android-34|build-tools;34"

# Verificar Gradle wrapper
cd android && ./gradlew --version
```

---

## Build del APK

### Desarrollo (Debug)
```bash
# 1. Build de Nuxt (genera .output/public)
pnpm run build

# 2. Sincronizar Capacitor con assets web
pnpm run cap:sync

# 3. Build APK debug
pnpm run android:build

# El APK queda en:
# android/app/build/outputs/apk/debug/app-debug.apk
```

### Producción (Release - firmado)
```bash
# 1. Generar keystore (solo la primera vez)
keytool -genkey -v -keystore miquioco-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias miquioco

# 2. Configurar signing en android/app/build.gradle.kts:
# android {
#     signingConfigs {
#         create("release") {
#             storeFile = file("miquioco-release-key.jks")
#             storePassword = "tu_password"
#             keyAlias = "miquioco"
#             keyPassword = "tu_password"
#         }
#     }
#     buildTypes {
#         release {
#             signingConfig = signingConfigs.getByName("release")
#         }
#     }
# }

# 3. Build release
pnpm run android:assemble-release

# El AAB/APK queda en:
# android/app/build/outputs/bundle/release/app-release.aab
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Instalación en dispositivo Android

### Opción A: ADB (recomendado para desarrollo)
```bash
# Conectar dispositivo por USB con depuración USB activada
adb devices

# Instalar APKKL
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Opción B: Transferencia manual
1. Copiar `app-debug.apk` al dispositivo (USB, WhatsApp Web, Google Drive, etc.)
2. En el dispositivo: habilitar "Instalar apps de orígenes desconocidos"
3. Abrir el APK e instalar

### Opción C: Servir desde la laptop (red local)
```bash
# En la laptop (directorio del proyecto)
python -m http.server 8080

# En el móvil (navegador): http://<IP_LAPTOP>:8080/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Configuración del servidor para acceso desde Android

### En la laptop (servidor Nuxt)
```bash
# .env
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
```

```bash
# Iniciar servidor accesible en red local
pnpm run dev
# Servidor escucha en http://0.0.0.0:3000

# Obtener IP de la laptop en la red WiFi:
# Windows: ipconfig | findstr IPv4
# Linux/WSL: ip route get 1 | awk '{print $7}'
```

### En el Android
- La app intentará conectar a `http://<IP_LAPTOP>:3000` para:
  - Login inicial (descargar hash PIN, catálogo productos)
  - Sincronización (push/pull)
- **Requisito**: Móvil y laptop en la misma WiFi

---

## Estructura de carpetas Android relevante

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/com/miquiosco/app/
│   │   │   └── MainActivity.kt
│   │   └── assets/
│   │       └── cap_config.json       # Config generada por Capacitor
│   └── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
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

---

## Troubleshooting común

### Error: "SDK location not found"
```bash
# Verificar ANDROID_HOME
echo $ANDROID_HOME
# Debe apuntar a la carpeta que contiene cmdline-tools/, platform-tools/, platforms/
```

### Error: "Gradle version incompatible"
```bash
# En android/gradle/wrapper/gradle-wrapper.properties
# distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-bin.zip
```

### Error: "cleartext traffic not permitted"
La config `android:usesCleartextTraffic="true"` ya está en capacitor.config.json → android.allowMixedContent

### Error: WebView no carga recursos locales
```bash
# Verificar capacitor.config.json:
# "webDir": ".output/public"
# "server": { "androidScheme": "https" }
```

### App se cierra al abrir (crash en WebView)
```bash
# Ver logs:
adb logcat | grep -i miquioco
# Buscar errores de SQLite, permisos, o JS console
```

### SQLite no funciona en Android
```bash
# Verificar @capacitor-community/sqlite versión compatible
# Requiere Capacitor 5+ y Android 7+ (API 24+)

# En MainActivity.kt agregar:
# import com.capacitorjs.plugins.sqlite.SQLitePlugin
# this.init(savedInstanceState, arrayOf(SQLitePlugin::class.java))
```

---

## Flujo de trabajo diario

### Desarrollo (con laptop como servidor)
```bash
# Terminal 1 - Servidor Nuxt
pnpm run dev

# Terminal 2 - App Android (cuando cambies código frontend)
pnpm run build && pnpm run cap:sync && pnpm run android:build && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Solo cambios en frontend (sin tocar backend)
```bash
pnpm run build && pnpm run cap:sync && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Probar sincronización
1. Abrir app en Android → Login como Jefe
2. Crear/modificar productos, hacer cuadre
3. Botón "Sincronizar ahora" → debe conectar a `http://<IP_LAPTOP>:3000/api/sync/...`

---

## Comandos útiles

```bash
# Ver logs de la app en tiempo real
adb logcat | grep -i miquioco

# Limpiar build Android
cd android && ./gradlew clean

# Ver dispositivos conectados
adb devices

# Reiniciar servidor ADB
adb kill-server && adb start-server

# Copiar base de datos SQLite del dispositivo (para debug)
adb shell run-as com.miquiosco.app cp /data/data/com.miquiosco.app/databases/miquioco.db /sdcard/miquioco.db
adb pull /sdcard/miquioco.db .
```

---

## Checklist previo a entrega a la jefa/trabajadores

- [ ] Build release firmado (`pnpm run android:assemble-release`)
- [ ] Probar en dispositivo físico (no solo emulador)
- [ ] Verificar login offline (sin WiFi)
- [ ] Verificar cuadre completo offline
- [ ] Verificar exportación JSON trabajador
- [ ] Verificar importación JSON en app de la jefa
- [ ] Verificar sincronización con servidor en WiFi
- [ ] Verificar gráficas cargan offline (contra SQLite local)
- [ ] Documentar IP del servidor para la jefa
- [ ] Entregar APK + instrucciones de instalación
