package com.miquiosco.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Instalador de APK en la propia app (auto-actualización, Fase 8 / modo 'interno').
 *
 * Capacitor no trae ningún plugin oficial para lanzar el instalador del sistema,
 * así que se implementa aquí. El flujo se parte en tres métodos en vez de usar
 * startActivityForResult: el permiso "Instalar apps desconocidas" es especial y
 * devolver de Ajustes con un callback frágil entre fabricantes; con este diseño
 * el JS decide cuándo reintentar.
 *
 * El archivo a instalar debe vivir en un directorio expuesto por el FileProvider
 * declarado en AndroidManifest.xml. En la app se descarga a Directory.Cache, que
 * res/xml/file_paths.xml ya cubre con <cache-path>.
 *
 * Requiere <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
 * en AndroidManifest.xml (obligatorio desde la API 26 con targetSdk 36).
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private static final String MIME_APK = "application/vnd.android.package-archive";

    /**
     * ¿Puede la app lanzar el instalador? En API < 26 no hace falta permiso
     * especial, así que se responde true siempre.
     */
    @PluginMethod
    public void canInstall(PluginCall call) {
        call.resolve(resultadoCanInstall());
    }

    /**
     * Abre Ajustes → "Instalar apps desconocidas" para esta app. Tras concederlo,
     * el usuario vuelve con el gesto atrás y el JS reintenta la instalación.
     */
    @PluginMethod
    public void openPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("No se pudo abrir los ajustes de instalación: " + ex.getMessage(), ex);
        }
    }

    /**
     * Lanza el instalador del sistema sobre un APK ya descargado.
     * El path debe ser absoluto y estar dentro del directorio de caché de la app.
     */
    @PluginMethod
    public void install(PluginCall call) {
        // getBool devuelve Boolean nullable: sin Boolean.TRUE.equals el "!"
        // desempaquetaría y reventaría con NPE si faltara la clave.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !Boolean.TRUE.equals(resultadoCanInstall().getBool("allowed"))) {
            call.reject("Falta permiso para instalar apps", "PERMISSION_REQUIRED");
            return;
        }

        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("Falta el path del APK", "INVALID_PATH");
            return;
        }

        File apk = new File(path);
        File cacheDir = getContext().getCacheDir();
        if (!apk.exists()) {
            call.reject("El APK descargado no existe", "NOT_FOUND");
            return;
        }

        try {
            // Solo se acepta un archivo dentro de la caché propia: evita que un
            // path arbitrario llegue al instalador con los permisos de la app.
            // getCanonicalPath() lanza IOException, va dentro del try.
            if (cacheDir == null
                || !apk.getCanonicalPath().startsWith(cacheDir.getCanonicalPath() + File.separator)) {
                call.reject("El APK debe estar en el directorio de caché de la app", "INVALID_PATH");
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            // ACTION_VIEW + mime de APK es la vía que documenta Android para
            // invitar a instalar; ACTION_INSTALL_PACKAGE está deprecado desde
            // la API 29 y el instalador del sistema lo resuelve igual.
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, MIME_APK);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("No se pudo abrir el instalador: " + ex.getMessage(), ex);
        }
    }

    private JSObject resultadoCanInstall() {
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PackageManager pm = getContext().getPackageManager();
            allowed = pm.canRequestPackageInstalls();
        }
        JSObject data = new JSObject();
        data.put("allowed", allowed);
        return data;
    }
}
