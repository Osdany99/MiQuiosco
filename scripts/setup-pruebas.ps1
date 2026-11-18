param(
    [string]$DeviceSerial        = "",
    [string]$DbName             = "MiQuiosco_test",
    [switch]$SkipSeed,
    [switch]$SkipBuild,
    [switch]$SkipInstall,
    [switch]$StartDevServer,
    [switch]$ForceBuildServer    # forzar rebuild + sync aunque existan artefactos
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Resolve-IPv4 {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "169.*" -and
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "0.*" -and
            $_.InterfaceAlias -notmatch "Loopback|WSL|Virtual"
        } |
        Sort-Object InterfaceMetric
    if (-not $candidates) { return $null }
    return $candidates[0].IPAddress
}

$adb = "C:\Users\Osdany\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) { throw "ADB no encontrado en $adb" }

$Ip = Resolve-IPv4
if (-not $Ip) { throw "No se pudo detectar una IP IPv4 activa en Wi-Fi/Ethernet." }
Write-Step "IP detectada: $Ip"

$DbUrl = "postgresql://postgres:9902@localhost:5432/$DbName?schema=public"
$ServerUrl = "http://$Ip`:3000"

Write-Step "Preparando DB de pruebas ($DbName)"
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:DATABASE_URL = $DbUrl
$env:PGPASSWORD = "9902"

if (-not $SkipSeed) {
    Push-Location $Root
    try {
        Write-Host "Ejecutando migrate..."
        pnpm db:migrate
        Write-Host "Ejecutando seed (idempotente)..."
        pnpm db:seed
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Saltando migrate/seed (--SkipSeed)."
}

if (-not $SkipBuild -or $ForceBuildServer) {
    Write-Step "Construyendo web + APK (solo pruebas; usa MiQuiosco_test)"
    Push-Location $Root
    try {
        $env:NUXT_PUBLIC_SYNC_SERVER_URL = $ServerUrl
        $env:DATABASE_URL = $DbUrl
        pnpm build
        pnpm cap:sync
        pnpm android:build
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Saltando build (--SkipBuild)."
}

$apk = Join-Path $Root "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) { throw "APK no encontrada: $apk" }

if (-not $SkipInstall) {
    Write-Step "Generando/Instalando APK de pruebas"
    $devices = (& $adb devices) -split "`n" |
        Where-Object { $_ -match "device$" } |
        ForEach-Object { ($_ -split "\s+")[0] }

    if ($devices.Count -eq 0) {
        $outputApk = Join-Path $PSScriptRoot "MiQuiosco-test.apk"
        Copy-Item -Force $apk $outputApk
        Write-Host "No se detecto dispositivo Android conectado por adb."
        Write-Host "La APK se genero y quedo guardada aqui:"
        Write-Host "  $outputApk" -ForegroundColor Green
        Write-Host ""
        Write-Host "Para instalarla mas tarde, conecta el movil y ejecuta:"
        Write-Host "  adb -s <serial> install -r -t `"$outputApk`""
        Write-Host " (Desbloquea el movil y activa 'Instalar mediante USB' si MIUI lo bloquea)"
    } else {
        if ($devices.Count -gt 1 -and [string]::IsNullOrWhiteSpace($DeviceSerial)) {
            Write-Host "Hay varios dispositivos conectados:"
            foreach ($d in $devices) { Write-Host "  - $d" }
            throw "Pasa el serial con -DeviceSerial (ej. -DeviceSerial 4d82ea9c)"
        }
        $target = if ([string]::IsNullOrWhiteSpace($DeviceSerial)) { $devices[0] } else { $DeviceSerial }
        Write-Host "Instalando en $target ..."
        & $adb -s $target install -r -t $apk
        Write-Host "APK instalada. (Si MIUI la bloquea, desbloquea el movil y activa 'Instalar mediante USB'.)"
        & $adb -s $target reverse tcp:3000 tcp:3000 2>$null | Out-Null

        # Mientras exista dispositivo conectado, tambien deja copia en carpeta del script
        $outputApk = Join-Path $PSScriptRoot "MiQuiosco-test.apk"
        Copy-Item -Force $apk $outputApk -ErrorAction SilentlyContinue
        Write-Host "Copia de respaldo en: $outputApk"
    }
} else {
    Write-Host "Saltando install (--SkipInstall)."
}

Write-Step "Listo para probar"
@"
Web local:        http://localhost:3000
APK apunta a:     $ServerUrl
DB pruebas:       $DbName

Login (web / app):
  jefe      : jefe / 1234
  superadmin: superadmin / 123456  (solo panel web)

Comandos utiles:
  Logs del APK:
    adb -s <serial> logcat
  Recompilar + reinstalar manual:
    pnpm build && pnpm cap:sync && pnpm android:build
    adb -s <serial> install -r -t android\app\build\outputs\apk\debug\app-debug.apk
"@ | Write-Host -ForegroundColor Green

if ($StartDevServer) {
    Write-Step "Arrancando servidor dev en una ventana nueva"
    $command = "`$env:DATABASE_URL='$DbUrl'; `$env:NUXT_PORT='3000'; `$env:NUXT_HOST='0.0.0.0'; Set-Location '$Root'; pnpm dev"
    Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $command | Out-Null
    Write-Host "Servidor arrancando en http://0.0.0.0:3000 (nueva ventana PowerShell)."
} else {
    Write-Host "`nPara arrancar el servidor dev ahora, ejecuta (misma ventana):"
    Write-Host "  `$env:DATABASE_URL='$DbUrl'; `$env:NUXT_PORT='3000'; `$env:NUXT_HOST='0.0.0.0'; pnpm dev" -ForegroundColor Yellow
}
