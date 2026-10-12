package com.myquiosco.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

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
 *
 * ADEMÁS EXPORTA, restaurarla: elegirCopia() abre el selector del sistema, deja
 * el archivo elegido validado en la caché y devuelve un RESUMEN para que el jefe
 * confirme; aplicarCopia() es la que sustituye el archivo, y solo después de que
 * el JS haya cerrado la conexión (cerrarParaCopia). Va en dos métodos y no en uno
 * a propósito: entre elegir y aplicar no debe quedar nada a medias, y sobre
 * todo debe quedar una copia del estado actual antes de sobrescribirlo.
 */
@CapacitorPlugin(name = "DbBackup")
public class DbBackupPlugin extends Plugin {

    /**
     * Nombre del archivo, tal y como la crea app/server-offline/db/client.js.
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
     * Copia elegida por el jefe, a la espera de que confirme. Vive en la caché
     * de la app (se borra sola si el sistema limpia) y SOLO se usa mientras el
     * diálogo está abierto: aplicarCopia() la borra después de usarla.
     */
    private static final String CANDIDATO = "restauracion-candidata.db";

    /** Tablas sin las cuales el archivo no es una base de MiQuiosco. */
    private static final String[] TABLAS_MINIMAS = {
        "cuadres", "cuadre_items", "productos", "movimientos_inventario", "lotes", "usuarios"
    };

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

    /** Escribe un archivo en Descargas por la vía que toque según la versión. */
    private String guardarEnDescargas(File origen, String nombre) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            copiarConMediaStore(origen, nombre);
            return Environment.DIRECTORY_DOWNLOADS + "/" + nombre;
        }
        copiarEnDescargasClasico(origen, nombre);
        return Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS) + "/" + nombre;
    }

    // ==================================================== restauración =====

    /**
     * Abre el selector de archivos del sistema para elegir una copia.
     *
     * NO cambia nada todavía: deja el archivo en la caché, lo valida y devuelve
     * un resumen (cuadres, productos, fechas). El jefe confirma en la UI y luego
     * se llama a aplicarCopia(). Así elegir el archivo equivocado no cuesta nada.
     */
    @PluginMethod
    public void elegirCopia(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // */* con la lista de mimes: varios exploradores de Android no
        // reconocen 'application/vnd.sqlite3' y el picker no mostraría nada.
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
            MIME_SQLITE, "application/octet-stream", "application/x-sqlite3"
        });
        startActivityForResult(call, intent, "resultadoSelector");
    }

    @ActivityCallback
    private void resultadoSelector(PluginCall call, ActivityResult result) {
        // El callback puede llegar sin llamada si el proceso se recreó con el
        // picker abierto: sin esto, reventaría con NPE al salvar la llamada.
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK
            || result.getData() == null
            || result.getData().getData() == null) {
            // Cancelar no es un error: se resuelve para que el diálogo se cierre.
            JSObject data = new JSObject();
            data.put("cancelado", true);
            call.resolve(data);
            return;
        }

        try {
            File cache = getContext().getCacheDir();
            if (cache == null) {
                throw new IllegalStateException("No hay caché disponible para la copia");
            }
            File candidato = new File(cache, CANDIDATO);
            copiarUri(result.getData().getData(), candidato);
            call.resolve(validar(candidato));
        } catch (Exception ex) {
            borrarCandidato();
            String mensaje = ex.getMessage() != null ? ex.getMessage() : "El archivo elegido no sirve";
            call.reject(mensaje, "ARCHIVO_INVALIDO", ex);
        }
    }

    /**
     * Valida la copia elegida y devuelve su resumen.
     *
     * Tres barreras, de la más barata a la más cara:
     *  1. Tamaño mínimo: un .db de MiQuiosco pesa bastante más de 1 KB, así que
     *     un archivo truncado o un PDF renombrado se caen aquí sin abrir nada.
     *  2. PRAGMA integrity_check: si SQLite dice que no está "ok", el archivo
     *     está dañado y restaurarlo sería cambiar un problema por otro.
     *  3. Tablas mínimas: que tenga el esqueleto de MiQuiosco.
     *
     * El resumen no es adorno: es lo que el jefe lee para asegurarse de que
     * está poniendo el archivo que cree (los .db no tienen nombre descriptivo
     * y suele haber varias copias en Descargas).
     */
    private JSObject validar(File archivo) throws Exception {
        long bytes = archivo.length();
        if (bytes < 4096) {
            throw new IllegalStateException("El archivo es demasiado pequeño para ser una base de datos");
        }

        try (SQLiteDatabase bd = SQLiteDatabase.openDatabase(
                archivo.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY)) {

            try (Cursor c = bd.rawQuery("PRAGMA integrity_check", null)) {
                String resultado = (c.moveToFirst()) ? c.getString(0) : "";
                if (!"ok".equalsIgnoreCase(resultado)) {
                    throw new IllegalStateException("La copia está dañada (SQLite dice: " + resultado + ")");
                }
            }

            Set<String> tablas = new HashSet<>();
            try (Cursor c = bd.rawQuery("SELECT name FROM sqlite_master WHERE type = 'table'", null)) {
                while (c.moveToNext()) tablas.add(c.getString(0));
            }
            List<String> faltan = new ArrayList<>();
            for (String t : TABLAS_MINIMAS) {
                if (!tablas.contains(t)) faltan.add(t);
            }
            if (!faltan.isEmpty()) {
                throw new IllegalStateException(
                    "El archivo no es una copia de MiQuiosco (le faltan: " + String.join(", ", faltan) + ")");
            }

            JSObject resumen = new JSObject();
            resumen.put("bytes", bytes);
            resumen.put("tablas", tablas.size());
            resumen.put("cuadres", contar(bd, "select count(*) from cuadres"));
            resumen.put("productos", contar(bd, "select count(*) from productos"));
            resumen.put("movimientos", contar(bd, "select count(*) from movimientos_inventario"));
            String desde = texto(bd, "select min(fecha) from cuadres");
            String hasta = texto(bd, "select max(fecha) from cuadres");
            resumen.put("desde", desde == null ? "" : desde);
            resumen.put("hasta", hasta == null ? "" : hasta);
            return resumen;
        }
    }

    private int contar(SQLiteDatabase bd, String sql) {
        try (Cursor c = bd.rawQuery(sql, null)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    private String texto(SQLiteDatabase bd, String sql) {
        try (Cursor c = bd.rawQuery(sql, null)) {
            return c.moveToFirst() ? c.getString(0) : null;
        }
    }

    /**
     * Sustituye la base local por la copia elegida.
     *
     * El JS debe haber cerrado la conexión antes (cerrarParaCopia): con la base
     * abierta, el WAL se volvería a escribir encima del archivo nuevo.
     *
     * Orden: respaldo del estado actual → borrado de los restos de WAL → copia
     * del candidato sobre databases/ → borrado del candidato. Si algo falla a
     * medias, el respaldo sigue en Descargas y el archivo original no se toca
     * hasta el último momento (el rename es la única operación que sustituye).
     */
    @PluginMethod
    public void aplicarCopia(PluginCall call) {
        File cache = getContext().getCacheDir();
        File candidato = (cache == null) ? null : new File(cache, CANDIDATO);
        if (candidato == null || !candidato.exists()) {
            call.reject("No hay ninguna copia elegida", "NO_HAY_CANDIDATO");
            return;
        }

        File actual = encontrarBase();
        if (actual == null) {
            call.reject("No se encontró la base de datos local", "NOT_FOUND");
            return;
        }

        try {
            // 1. Respaldo: el jefe puede volver atrás con la copia que había
            //    antes de tocar nada, sin depender de que esto salió bien.
            String sello = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
            String nombre = "miquiosco-antes-de-restaurar-" + sello + ".db";
            String rutaRespaldo = guardarEnDescargas(actual, nombre);

            // 2. Los restos de WAL del archivo viejo pertenecen a una base
            //    que ya no va a existir: si se dejan, SQLite los aplicaría
            //    encima del archivo nuevo al abrirlo.
            new File(actual.getPath() + "-wal").delete();
            new File(actual.getPath() + "-shm").delete();
            new File(actual.getPath() + "-journal").delete();

            // 3. Sustitución. El archivo nuevo tiene que quedar CON EL NOMBRE
            //    EXACTO del anterior (miquioscoSQLite.db): el plugin de SQLite
            //    lo abre por ese nombre, no por el primero que encuentre en
            //    databases/. Por eso el candidato no se renombra directamente
            //    sobre él, sino que el viejo se aparta un momento.
            File dir = actual.getParentFile();
            File puesto = new File(dir, CANDIDATO);
            // El sufijo ".reemplazando" evita que el buscador de la base lo
            // confunda con la base si una restauración queda a medias.
            File viejo = new File(dir, ARCHIVO_BD + ".reemplazando");

            if (viejo.exists()) viejo.delete();
            puesto.delete();
            if (!candidato.renameTo(puesto)) {
                // Mismo volumen, así que esto casi no pasa; si pasa (algún
                // fabricante montando distinto), se copia punto a punto.
                copiar(candidato, puesto);
                candidato.delete();
            }

            try {
                if (!actual.renameTo(viejo)) {
                    throw new IllegalStateException("No se pudo apartar la base actual");
                }
                if (!puesto.renameTo(actual)) {
                    // El nuevo no llegó a su sitio: se devuelve el viejo a su
                    // nombre antes de salir, para no dejar la app sin base.
                    viejo.renameTo(actual);
                    throw new IllegalStateException("No se pudo poner la copia en su sitio");
                }
            } finally {
                // Si sigue ahí, es que ya estamos sobre el archivo nuevo.
                if (viejo.exists()) viejo.delete();
            }

            // El rename conserva los permisos del archivo viejo; si acabó
            // copiando, se le ponen a mano: SQLite abre en lectura y escritura
            // y si el archivo no es del usuario de la app el proceso ni lo abre.
            actual.setReadable(true, true);
            actual.setWritable(true, true);

            JSObject data = new JSObject();
            data.put("bytes", actual.length());
            data.put("respaldo", rutaRespaldo);
            call.resolve(data);
        } catch (Exception ex) {
            call.reject("No se pudo restaurar la base: " + ex.getMessage(), ex);
        } finally {
            borrarCandidato();
        }
    }

    /** Copia un Uri (del selector del sistema) a un archivo local. */
    private void copiarUri(Uri origen, File destino) throws Exception {
        try (InputStream in = getContext().getContentResolver().openInputStream(origen)) {
            if (in == null) {
                throw new IllegalStateException("No se pudo leer el archivo elegido");
            }
            copiar(in, destino);
        }
    }

    private void copiar(File origen, File destino) throws Exception {
        try (InputStream in = new FileInputStream(origen)) {
            copiar(in, destino);
        }
    }

    /** Vuelca un flujo a un archivo. Es el caso del Uri del selector de archivos. */
    private void copiar(InputStream in, File destino) throws Exception {
        try (FileOutputStream out = new FileOutputStream(destino)) {
            byte[] buffer = new byte[8192];
            int leidos;
            while ((leidos = in.read(buffer)) != -1) {
                out.write(buffer, 0, leidos);
            }
            out.flush();
        }
    }

    private void borrarCandidato() {
        File cache = getContext().getCacheDir();
        if (cache == null) return;
        File candidato = new File(cache, CANDIDATO);
        if (candidato.exists()) candidato.delete();
    }
}