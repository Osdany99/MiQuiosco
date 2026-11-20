package com.myquiosco.app;

import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
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
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * WebBundlePlugin — descarga y activa el bundle web sin instalar la APK.
 *
 * API:
 *   WebBundle.estado()                  -> { activa, fallida, carpetas }
 *   WebBundle.descargar({url, sha256?, bytes?, version}) -> estado
 *   WebBundle.activar({version})        -> estado  (se aplica al reiniciar)
 *   WebBundle.aplicarAhora({version})   -> estado  (persiste y recarga el WebView)
 *   WebBundle.volverAApk()              -> estado  (recarga con el bundle de la APK)
 *   WebBundle.listo()                   -> { activa }  (confirma que cargó)
 *   WebBundle.limpiar({conservar})      -> estado
 *   WebBundle.cancelar()                -> { ok }
 *
 * La descarga es reanudable (`cache/web-v<version>.zip.part`), verifica sha256 y
 * tamaño, y solo entonces extrae a `files/web/v<version>/`. El JS decide cuándo
 * activar; por defecto se aplica en el siguiente arranque, que es lo que evita
 * recargar la app en mitad de una venta.
 */
@CapacitorPlugin(name = "WebBundle")
public class WebBundlePlugin extends Plugin {

    private static final String TAG = "MiQuioscoWebBundle";

    private final AtomicBoolean ocupado = new AtomicBoolean(false);
    private final AtomicBoolean cancelar = new AtomicBoolean(false);

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estadoActual());
    }

    private JSObject estadoActual() {
        JSObject r = new JSObject();
        r.put("activa", WebBundle.versionActiva(getContext()));
        r.put("fallida", WebBundle.versionFallida(getContext()));
        JSArray carpetas = new JSArray();
        List<Integer> versiones = WebBundle.versiones(getContext());
        for (Integer v : versiones) carpetas.put(v);
        r.put("carpetas", carpetas);
        return r;
    }

    @PluginMethod
    public void descargar(PluginCall call) {
        String url = call.getString("url");
        int version = comoInt(call, "version");
        if (url == null || url.isEmpty()) {
            call.reject("Falta la URL del bundle", "INVALID_URL");
            return;
        }
        if (version <= 0) {
            call.reject("Falta la versión del bundle", "INVALID_VERSION");
            return;
        }
        // Ya está en disco: reinstalar sería reescribir el bundle para nada.
        if (new File(WebBundle.carpeta(getContext(), version), "index.html").exists()) {
            call.resolve(estadoActual());
            return;
        }
        if (!ocupado.compareAndSet(false, true)) {
            call.reject("Ya hay una descarga del bundle en curso", "BUSY");
            return;
        }
        cancelar.set(false);

        final String sha = call.getString("sha256", "");
        final long bytesEsperados = comoLong(call, "bytes");

        new Thread(() -> {
            try {
                descargar(url, sha, bytesEsperados, version);
                call.resolve(estadoActual());
            } catch (IOException e) {
                String motivo = e.getMessage() == null ? "desconocido" : e.getMessage();
                Log.w(TAG, "descarga del bundle falló: " + motivo);
                if ("cancelado".equals(motivo)) {
                    call.reject("Descarga cancelada", "CANCELADO");
                } else {
                    call.reject(motivo, "DESCARGA_FALLIDA");
                }
            } catch (Throwable e) {
                Log.e(TAG, "descarga del bundle falló", e);
                call.reject("No se pudo preparar el bundle: " + e.getMessage(), "BUNDLE_FALLIDO");
            } finally {
                ocupado.set(false);
            }
        }, "web-bundle-descarga").start();
    }

    private void descargar(String url, String sha, long bytesEsperados, int version) throws Exception {
        File parte = new File(getContext().getCacheDir(), "web-v" + version + ".zip.part");
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
                parte.delete();
                throw new IOException("hash_invalido");
            }
        }
        if (!WebBundle.zipValido(parte)) {
            parte.delete();
            throw new IOException("zip_invalido");
        }

        emitirProgreso("instalando", parte.length(), parte.length());
        WebBundle.instalar(getContext(), parte, version);
        parte.delete();
        emitirProgreso("listo", 1, 1);
    }

    @PluginMethod
    public void activar(PluginCall call) {
        int version = comoInt(call, "version");
        if (version <= 0) {
            call.reject("Falta la versión", "INVALID_VERSION");
            return;
        }
        WebBundle.activar(getContext(), version);
        call.resolve(estadoActual());
    }

    /**
     * Aplica ya: persiste la ruta y recarga el WebView desde la carpeta nueva.
     * Solo para el botón «Reiniciar ahora»; el flujo normal es `activar`, que
     * espera al siguiente arranque.
     */
    @PluginMethod
    public void aplicarAhora(PluginCall call) {
        int version = comoInt(call, "version");
        File dir = version > 0 ? WebBundle.carpeta(getContext(), version) : null;
        if (dir == null || !new File(dir, "index.html").exists()) {
            call.reject("Esa versión del bundle no está descargada", "NO_INSTALADA");
            return;
        }
        WebBundle.activar(getContext(), version);
        call.resolve(estadoActual());
        // Después de resolver: la recarga tumba el puente JS.
        getBridge().setServerBasePath(dir.getAbsolutePath());
    }

    @PluginMethod
    public void volverAApk(PluginCall call) {
        WebBundle.volverAApk(getContext());
        call.resolve(estadoActual());
        getBridge().setServerAssetPath("public");
    }

    /** La app cargó: el watchdog deja de contar arranques. */
    @PluginMethod
    public void listo(PluginCall call) {
        WebBundle.confirmar(getContext());
        JSObject r = new JSObject();
        r.put("activa", WebBundle.versionActiva(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void limpiar(PluginCall call) {
        int conservar = comoInt(call, "conservar");
        WebBundle.borrarSalvo(getContext(), conservar);
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void cancelar(PluginCall call) {
        cancelar.set(true);
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    /**
     * Los números que llegan de JS se decodifican como `Integer`: `getLong()`
     * devuelve el valor por defecto y se perdía la versión. Se prueban ambos.
     */
    private static int comoInt(PluginCall call, String nombre) {
        Integer i = call.getInt(nombre, null);
        if (i != null) return i;
        Long l = call.getLong(nombre, null);
        return l == null ? 0 : l.intValue();
    }

    private static long comoLong(PluginCall call, String nombre) {
        Long l = call.getLong(nombre, null);
        if (l != null) return l;
        Integer i = call.getInt(nombre, null);
        return i == null ? 0L : i.longValue();
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
}
