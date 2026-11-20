package com.myquiosco.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

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
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * VoskModeloPlugin — aprovisiona el modelo de voz offline sin llevarlo dentro
 * de la APK (que pesaba 38 MB de los 57 MB de cada actualización).
 *
 * API:
 *   VoskModelo.estado()   -> { listo, disponible, bytes, version }
 *   VoskModelo.descargar({ url, sha256?, bytes?, version? }) -> estado
 *   VoskModelo.cancelar() -> { ok }
 *   VoskModelo.importar() -> estado   (selector de archivos: USB/SD)
 *   VoskModelo.borrar()   -> estado
 *
 * La descarga es reanudable (Range sobre `cache/vosk-modelo.zip.part`), verifica
 * sha256 y tamaño, y solo entonces reemplaza el modelo. Emite `progreso`
 * ({ fase, bytes, total, pct }) para la barra de Ajustes.
 *
 * El disparador normal NO es el usuario: cuando el super admin pone el motor
 * Vosk para un dispositivo, la app ve la configuración en el sync y llama a
 * `descargar()`. `importar()` es la red de seguridad para equipos sin red
 * (el ZIP se lleva en un pendrive).
 */
@CapacitorPlugin(name = "VoskModelo")
public class VoskModeloPlugin extends Plugin {

    private static final String TAG = "MiQuioscoVoskModelo";

    private final AtomicBoolean ocupado = new AtomicBoolean(false);
    private final AtomicBoolean cancelar = new AtomicBoolean(false);

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estadoActual());
    }

    private JSObject estadoActual() {
        JSObject r = new JSObject();
        r.put("listo", VoskModelo.extraido(getContext()));
        r.put("disponible", VoskModelo.disponible(getContext()));
        r.put("bytes", VoskModelo.bytesZip(getContext()));
        r.put("version", VoskModelo.version(getContext()));
        return r;
    }

    @PluginMethod
    public void descargar(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL del modelo", "INVALID_URL");
            return;
        }
        if (!ocupado.compareAndSet(false, true)) {
            call.reject("Ya hay una descarga del modelo en curso", "BUSY");
            return;
        }
        cancelar.set(false);

        final String sha = call.getString("sha256", "");
        // Los números de JS llegan como Integer: getLong() los descarta y el
        // tamaño esperado se quedaba en 0 (sin verificación de tamaño).
        final long bytesEsperados = bytesDe(call, "bytes");
        final String version = call.getString("version", "");

        new Thread(() -> {
            try {
                descargar(url, sha, bytesEsperados, version);
                call.resolve(estadoActual());
            } catch (IOException e) {
                String motivo = e.getMessage() == null ? "desconocido" : e.getMessage();
                Log.w(TAG, "descarga del modelo falló: " + motivo);
                if ("cancelado".equals(motivo)) {
                    call.reject("Descarga cancelada", "CANCELADO");
                } else {
                    call.reject(motivo, "DESCARGA_FALLIDA");
                }
            } catch (Throwable e) {
                Log.e(TAG, "descarga del modelo falló", e);
                call.reject("No se pudo preparar el modelo: " + e.getMessage(), "MODELO_FALLIDO");
            } finally {
                ocupado.set(false);
            }
        }, "vosk-modelo-descarga").start();
    }

    @PluginMethod
    public void cancelar(PluginCall call) {
        cancelar.set(true);
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    @PluginMethod
    public void importar(PluginCall call) {
        if (!ocupado.compareAndSet(false, true)) {
            call.reject("Ya hay una operación del modelo en curso", "BUSY");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/zip", "application/octet-stream", "application/x-zip-compressed"
            });
            startActivityForResult(call, intent, "importarResultado");
        } catch (Exception e) {
            ocupado.set(false);
            call.reject("No se pudo abrir el selector de archivos: " + e.getMessage(), e);
        }
    }

    @ActivityCallback
    private void importarResultado(PluginCall call, ActivityResult resultado) {
        if (call == null) {
            ocupado.set(false);
            return;
        }
        try {
            if (resultado.getResultCode() != android.app.Activity.RESULT_OK
                || resultado.getData() == null
                || resultado.getData().getData() == null) {
                // Sin liberar aquí, el candado `ocupado` dejaría el plugin
                // bloqueado hasta reiniciar la app.
                ocupado.set(false);
                call.reject("Importación cancelada", "CANCELADO");
                return;
            }
            Uri origen = resultado.getData().getData();
            File temporal = new File(getContext().getCacheDir(), "vosk-modelo.zip.importado");
            try (InputStream in = getContext().getContentResolver().openInputStream(origen);
                 OutputStream out = new FileOutputStream(temporal)) {
                if (in == null) throw new IOException("archivo_ilegible");
                copiar(in, out);
            }
            if (!VoskModelo.validar(temporal)) {
                temporal.delete();
                ocupado.set(false);
                call.reject("El archivo elegido no es el modelo Vosk", "ZIP_INVALIDO");
                return;
            }
            VoskModelo.instalarZip(getContext(), temporal);
            temporal.delete();
            instalarYExtraer(call, "");
        } catch (Exception e) {
            ocupado.set(false);
            call.reject("No se pudo importar el modelo: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        if (ocupado.get()) {
            call.reject("Hay una operación del modelo en curso", "BUSY");
            return;
        }
        VoskModelo.borrarTodo(getContext());
        call.resolve(estadoActual());
    }

    /**
     * Anota la versión del modelo ya extraído sin volver a descargarlo. Se usa
     * con equipos que traían el modelo dentro de la APK vieja: la próxima vez
     * que el manifiesto publique una versión distinta, se descargará sola.
     */
    @PluginMethod
    public void marcar(PluginCall call) {
        VoskModelo.guardarVersion(getContext(), call.getString("version", ""));
        call.resolve(estadoActual());
    }

    // ── Descarga ───────────────────────────────────────────────────────────

    private void descargar(String url, String sha, long bytesEsperados, String version) throws Exception {
        File parte = new File(getContext().getCacheDir(), VoskModelo.PART);
        if (bytesEsperados > 0 && parte.length() > bytesEsperados) parte.delete();
        long desde = parte.exists() ? parte.length() : 0L;

        HttpURLConnection conexion = (HttpURLConnection) new URL(url).openConnection();
        conexion.setConnectTimeout(20000);
        conexion.setReadTimeout(30000);
        conexion.setInstanceFollowRedirects(true);
        // Sin compresión: si no, el rango reanudable y el tamaño no cuadran.
        conexion.setRequestProperty("Accept-Encoding", "identity");
        if (desde > 0) conexion.setRequestProperty("Range", "bytes=" + desde + "-");
        conexion.connect();

        int codigo = conexion.getResponseCode();
        if (codigo == 416) {
            // El servidor no acepta el rango: el archivo parcial ya no sirve.
            parte.delete();
            throw new IOException("reanudacion_rechazada");
        }
        if (codigo != HttpURLConnection.HTTP_OK && codigo != 206) {
            conexion.disconnect();
            throw new IOException("http_" + codigo);
        }
        boolean reanudado = codigo == 206;
        if (!reanudado) desde = 0L;

        long largo = conexion.getContentLengthLong();
        long total = largo > 0 ? desde + largo : bytesEsperados;

        emitirProgreso("descargando", desde, total);
        try (InputStream in = conexion.getInputStream();
             OutputStream out = new FileOutputStream(parte, reanudado)) {
            byte[] buffer = new byte[64 * 1024];
            long hechos = desde;
            long ultimoAviso = 0L;
            int n;
            while ((n = in.read(buffer)) > 0) {
                if (cancelar.get()) throw new IOException("cancelado");
                out.write(buffer, 0, n);
                hechos += n;
                long ahora = System.currentTimeMillis();
                if (ahora - ultimoAviso >= 200) {
                    ultimoAviso = ahora;
                    emitirProgreso("descargando", hechos, total);
                }
            }
            emitirProgreso("descargando", hechos, total);
        } finally {
            conexion.disconnect();
        }

        if (bytesEsperados > 0 && parte.length() != bytesEsperados) {
            throw new IOException("tamano_inesperado:" + parte.length());
        }
        if (sha != null && !sha.isEmpty()) {
            emitirProgreso("verificando", parte.length(), parte.length());
            String real = sha256(parte);
            if (!real.toLowerCase(Locale.US).equals(sha.toLowerCase(Locale.US))) {
                // Un parcial con hash malo no se puede reanudar: se descarta.
                parte.delete();
                throw new IOException("hash_invalido");
            }
        }
        if (!VoskModelo.validar(parte)) {
            parte.delete();
            throw new IOException("zip_invalido");
        }

        emitirProgreso("instalando", parte.length(), parte.length());
        VoskModelo.instalarZip(getContext(), parte);
        parte.delete();
        VoskModelo.guardarVersion(getContext(), version);
        extraer();
    }

    private void instalarYExtraer(PluginCall call, String version) {
        if (version != null && !version.isEmpty()) {
            VoskModelo.guardarVersion(getContext(), version);
        }
        new Thread(() -> {
            try {
                extraer();
                call.resolve(estadoActual());
            } catch (Exception e) {
                Log.e(TAG, "no se pudo extraer el modelo importado", e);
                call.reject("El modelo se copió pero no se pudo descomprimir: " + e.getMessage(), "MODELO_FALLIDO");
            } finally {
                ocupado.set(false);
            }
        }, "vosk-modelo-extraer").start();
    }

    /** Extrae con progreso para que la UI no parezca colgada. */
    private void extraer() throws Exception {
        VoskModelo.asegurar(getContext(), (fase, porcentaje) ->
            emitirProgreso(fase, porcentaje, 100));
    }

    private void emitirProgreso(String fase, long bytes, long total) {
        JSObject p = new JSObject();
        p.put("fase", fase);
        p.put("bytes", bytes);
        p.put("total", total);
        p.put("pct", total > 0 ? Math.min(100, Math.round(bytes * 100.0 / total)) : 0);
        try {
            notifyListeners("progreso", p);
        } catch (Exception ignored) { }
    }

    /** Número que llega de JS (Integer o Long) como long; 0 si no viene. */
    private static long bytesDe(PluginCall call, String nombre) {
        Long l = call.getLong(nombre, null);
        if (l != null) return l;
        Integer i = call.getInt(nombre, null);
        return i == null ? 0L : i.longValue();
    }

    private static String sha256(File archivo) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(archivo)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) > 0) digest.update(buffer, 0, n);
        }
        StringBuilder texto = new StringBuilder();
        for (byte b : digest.digest()) texto.append(String.format("%02x", b));
        return texto.toString();
    }

    private static void copiar(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
    }
}
