package com.myquiosco.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Copia de seguridad de la base SQLite local, guardada en la carpeta Descargas.
 *
 * POR QUÉ UN PLUGIN Y NO Filesystem
 * La base vive en el directorio interno `databases/` de la app
 * (/data/user/0/<paquete>/databases/miquiosco), y el enum `Directory` de
 * @capacitor/filesystem no tiene un valor para él: `Documents` y
 * `ExternalStorage` apuntan a carpetas públicas que, con targetSdk 36, Android
 * bloquea por *scoped storage*, y `External` cae en Android/data/, que muchos
 * exploradores ya no dejan abrir. Aquí se usa MediaStore, que es la vía que
 * Android documenta para escribir en Descargas sin depender del legacy storage.
 *
 * Se espera a que el JS haya cerrado la conexión antes de copiar: ver
 * cerrarParaCopia() en app/server-offline/db/client.js. Con la base cerrada el
 * WAL ya está fusionado en el .db, así que la copia sale completa.
 *
 * El archivo se guarda SIN cifrar (la app abre la base con 'no-encryption'),
 * para que se pueda abrir y analizar tal cual.
 */
@CapacitorPlugin(name = "DbBackup")
public class DbBackupPlugin extends Plugin {

    /**
     * Nombre de la CONEXIÓN, tal y como la crea app/server-offline/db/client.js.
     * No es el nombre del archivo: ver ARCHIVO_BD.
     */
    private static final String DB_NAME = "miquiosco";

    /**
     * Nombre real del archivo en databases/.
     *
     * POR QUÉ NO ES `miquiosco`
     * @capacitor-community/sqlite no usa el nombre de la conexión tal cual: su
     * Android le concatena el sufijo "SQLite.db" al abrirla (CapacitorSQLite.java
     * -> `new Database(context, dbName + "SQLite.db", ...)`, y Database.java hace
     * `_file = context.getDatabasePath(dbName)`). Con DB_NAME = "miquiosco" el
     * archivo en disco es "miquioscoSQLite.db"; buscar "miquiosco" daba siempre
     * NOT_FOUND y la copia de seguridad no salía nunca.
     */
    private static final String ARCHIVO_BD = DB_NAME + "SQLite.db";

    private static final String MIME_SQLITE = "application/vnd.sqlite3";

    /**
     * Localiza el archivo de la base local en databases/.
     *
     * Primero prueba el nombre exacto que construye el plugin; si no aparece,
     * recorre databaseList() buscando la base de esta app (todo lo que empieza
     * por el nombre de conexión y acaba en "SQLite.db"). Así la copia no se rompe
     * si el plugin cambia su convención de nombres en una actualización.
     *
     * @return el archivo, o null si la base todavía no existe en disco.
     */
    private File encontrarBase() {
        File directa = getContext().getDatabasePath(ARCHIVO_BD);
        if (directa != null && directa.exists()) {
            return directa;
        }

        for (String nombre : getContext().databaseList()) {
            if (nombre.startsWith(DB_NAME) && nombre.endsWith("SQLite.db")) {
                File encontrado = getContext().getDatabasePath(nombre);
                if (encontrado != null && encontrado.exists()) {
                    return encontrado;
                }
            }
        }
        return null;
    }

    /**
     * Copia la base local a Descargas/miquiosco-<sello>.db.
     *
     * Devuelve { ruta, bytes }. La ruta es legible por el usuario para que sepa
     * dónde buscar el archivo (viene del selector de archivos o del explorador).
     */
    @PluginMethod
    public void exportar(PluginCall call) {
        File origen = encontrarBase();
        if (origen == null) {
            call.reject("No se encontró la base de datos local", "NOT_FOUND");
            return;
        }

        String sello = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        String nombre = "miquiosco-" + sello + ".db";

        try {
            long bytes;
            String ruta;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                bytes = copiarConMediaStore(origen, nombre);
                ruta = Environment.DIRECTORY_DOWNLOADS + "/" + nombre;
            } else {
                // Android 7-9: sin MediaStore hay que escribir en la ruta pública
                // clásica, lo que requiere WRITE_EXTERNAL_STORAGE. Por eso el
                // permiso se declara con maxSdkVersion=28 en el manifest.
                bytes = copiarEnDescargasClasico(origen, nombre);
                ruta = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS) + "/" + nombre;
            }

            JSObject data = new JSObject();
            data.put("ruta", ruta);
            data.put("bytes", bytes);
            call.resolve(data);
        } catch (Exception ex) {
            call.reject("No se pudo guardar la copia: " + ex.getMessage(), ex);
        }
    }

    /**
     * Copia vía MediaStore (API 29+). No necesita permiso de almacenamiento y
     * sobrevive a que el usuario cleans el directorio de la app.
     */
    private long copiarConMediaStore(File origen, String nombre) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, nombre);
        values.put(MediaStore.Downloads.MIME_TYPE, MIME_SQLITE);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

        Uri item = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) {
            throw new IllegalStateException("El sistema no aceptó crear el archivo en Descargas");
        }

        try (InputStream in = new FileInputStream(origen);
             OutputStream out = getContext().getContentResolver().openOutputStream(item)) {
            if (out == null) {
                throw new IllegalStateException("No se pudo abrir el archivo en Descargas");
            }
            byte[] buffer = new byte[8192];
            int leidos;
            long total = 0;
            while ((leidos = in.read(buffer)) != -1) {
                out.write(buffer, 0, leidos);
                total += leidos;
            }
            out.flush();
            return total;
        } catch (Exception ex) {
            // Si la copia falla a medias, se borra el registro para no dejar en
            // Descargas un .db corrupto que aparente ser una copia válida.
            getContext().getContentResolver().delete(item, null, null);
            throw ex;
        }
    }

    /** Copia a la carpeta Descargas clásica (API 24-28). Devuelve el tamaño copiado. */
    private long copiarEnDescargasClasico(File origen, String nombre) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null || (!dir.exists() && !dir.mkdirs())) {
            throw new IllegalStateException("No se pudo preparar la carpeta Descargas");
        }
        File destino = new File(dir, nombre);

        try (InputStream in = new FileInputStream(origen);
             FileOutputStream out = new FileOutputStream(destino)) {
            byte[] buffer = new byte[8192];
            int leidos;
            long total = 0;
            while ((leidos = in.read(buffer)) != -1) {
                out.write(buffer, 0, leidos);
                total += leidos;
            }
            out.flush();
            return total;
        }
    }
}