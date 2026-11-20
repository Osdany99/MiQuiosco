package com.myquiosco.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * WebBundle — bundle web (HTML/JS/CSS de Nuxt, ~1 MB comprimido) actualizable
 * sin APK.
 *
 * Capacitor sirve la app desde `https://localhost` con `WebViewLocalServer`.
 * `Bridge.setServerBasePath(carpeta)` cambia la carpeta de origen SIN cambiar el
 * origen: la sesión, el `localStorage` y el sqlite nativo siguen intactos.
 * `Bridge.load()` aplica la ruta persistida en `CapWebViewSettings` al arrancar
 * y la borra sola cuando cambia el versionCode de la APK (`isNewBinary`), así
 * que una APK nueva siempre arranca con su bundle de fábrica.
 *
 * Aquí vive solo lo que no cambia con el WebView: carpetas, versión activa,
 * marcador de fallo y watchdog de arranque. La descarga/extracción está en
 * `WebBundlePlugin`.
 *
 * Carpetas: `files/web/v<versionCode>/` con `index.html` en la raíz.
 */
public final class WebBundle {

    /** Preferencias que lee Capacitor al arrancar (`com.getcapacitor.plugin.WebView`). */
    public static final String PREF = "CapWebViewSettings";
    public static final String PREF_PATH = "serverBasePath";
    /** Arranques seguidos sin que la app confirme que cargó. */
    static final String PREF_BOOTS = "webBundleBoots";
    /** Versión OTA que no llegó a arrancar: no se vuelve a bajar. */
    static final String PREF_FALLIDA = "webBundleFallida";

    /** A la tercera vez que no arranca se vuelve al bundle de la APK. */
    static final int BOOTS_MAX = 3;

    static final String CARPETA = "web";
    static final String PREFIJO = "v";

    private WebBundle() { }

    // ── Carpetas y versión activa ──────────────────────────────────────────

    static File raiz(Context ctx) {
        return new File(ctx.getFilesDir(), CARPETA);
    }

    /** Carpeta de una versión concreta (exista o no). */
    public static File carpeta(Context ctx, int version) {
        return new File(raiz(ctx), PREFIJO + version);
    }

    /**
     * Versión OTA activa, leída de la ruta persistida. 0 = se está usando el
     * bundle que viene dentro de la APK.
     */
    public static int versionActiva(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String ruta = prefs.getString(PREF_PATH, "");
        if (ruta == null || ruta.isEmpty()) return 0;
        File dir = new File(ruta);
        if (!new File(dir, "index.html").exists()) return 0;
        return versionDeCarpeta(dir);
    }

    /** Carpeta del bundle activo, o null si corre el de la APK. */
    public static File activa(Context ctx) {
        int v = versionActiva(ctx);
        if (v <= 0) return null;
        File dir = carpeta(ctx, v);
        return new File(dir, "index.html").exists() ? dir : null;
    }

    /** Activa una versión ya extraída (se aplica en el próximo arranque). */
    public static void activar(Context ctx, int version) {
        File dir = carpeta(ctx, version);
        if (!new File(dir, "index.html").exists()) return;
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_PATH, dir.getAbsolutePath())
            .putInt(PREF_BOOTS, 0)
            .apply();
    }

    /** Vuelve al bundle de la APK (se aplica en el próximo arranque). */
    public static void volverAApk(Context ctx) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_PATH, "")
            .putInt(PREF_BOOTS, 0)
            .apply();
    }

    public static int versionFallida(Context ctx) {
        return ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getInt(PREF_FALLIDA, 0);
    }

    public static void marcarFallida(Context ctx, int version) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putInt(PREF_FALLIDA, Math.max(0, version))
            .putInt(PREF_BOOTS, 0)
            .apply();
    }

    /** Versiones descargadas, de la más nueva a la más vieja. */
    public static List<Integer> versiones(Context ctx) {
        List<Integer> lista = new ArrayList<>();
        File[] hijos = raiz(ctx).listFiles();
        if (hijos == null) return lista;
        for (File hijo : hijos) {
            if (!hijo.isDirectory()) continue;
            int v = versionDeCarpeta(hijo);
            if (v > 0 && new File(hijo, "index.html").exists()) lista.add(v);
        }
        lista.sort((a, b) -> Integer.compare(b, a));
        return lista;
    }

    /** Borra las carpetas OTA salvo la indicada. */
    public static void borrarSalvo(Context ctx, int conservar) {
        File[] hijos = raiz(ctx).listFiles();
        if (hijos == null) return;
        for (File hijo : hijos) {
            if (hijo.isDirectory() && versionDeCarpeta(hijo) != conservar) borrar(hijo);
        }
    }

    // ── Watchdog de arranque ───────────────────────────────────────────────

    /**
     * Se llama en `MainActivity.onCreate` ANTES de `super.onCreate` (que es
     * quien carga el WebView). Cuenta arranques con un bundle OTA activo: si la
     * app no confirmó que cargó en los últimos `BOOTS_MAX`, se vuelve al bundle
     * de la APK y se marca esa versión como fallida.
     */
    public static void arrancar(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String ruta = prefs.getString(PREF_PATH, "");
        if (ruta == null || ruta.isEmpty()) {
            if (prefs.getInt(PREF_BOOTS, 0) != 0) {
                prefs.edit().putInt(PREF_BOOTS, 0).apply();
            }
            return;
        }
        int boots = prefs.getInt(PREF_BOOTS, 0) + 1;
        if (boots >= BOOTS_MAX) {
            int fallida = versionDeCarpeta(new File(ruta));
            prefs.edit()
                .putString(PREF_PATH, "")
                .putInt(PREF_BOOTS, 0)
                .putInt(PREF_FALLIDA, fallida)
                .apply();
        } else {
            prefs.edit().putInt(PREF_BOOTS, boots).apply();
        }
    }

    /** La app cargó: el bundle activo funciona. */
    public static void confirmar(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        if (prefs.getInt(PREF_BOOTS, 0) != 0) {
            prefs.edit().putInt(PREF_BOOTS, 0).apply();
        }
    }

    // ── Instalación del ZIP ────────────────────────────────────────────────

    /**
     * Extrae un ZIP ya descargado y verificado a `files/web/v<version>`.
     * No activa nada: eso lo decide `WebBundlePlugin` (próximo arranque).
     */
    public static synchronized File instalar(Context ctx, File zip, int version) throws IOException {
        if (version <= 0) throw new IOException("version_invalida");
        if (!zipValido(zip)) throw new IOException("zip_invalido");

        File destino = carpeta(ctx, version);
        File temporal = new File(raiz(ctx), ".tmp-" + PREFIJO + version);
        borrar(temporal);
        if (!temporal.mkdirs()) throw new IOException("no se pudo crear " + temporal);
        if (!raiz(ctx).exists() && !raiz(ctx).mkdirs()) {
            throw new IOException("no se pudo crear " + raiz(ctx).getAbsolutePath());
        }

        try (ZipFile zf = new ZipFile(zip)) {
            String baseCanonica = temporal.getCanonicalPath() + File.separator;
            Enumeration<? extends ZipEntry> entradas = zf.entries();
            while (entradas.hasMoreElements()) {
                ZipEntry entrada = entradas.nextElement();
                File salida = new File(temporal, entrada.getName());
                // Defensa contra entradas ".." del ZIP: nada fuera de la carpeta.
                if (!salida.getCanonicalPath().startsWith(baseCanonica)) continue;
                if (entrada.isDirectory()) {
                    salida.mkdirs();
                    continue;
                }
                File padre = salida.getParentFile();
                if (padre != null) padre.mkdirs();
                try (InputStream in = zf.getInputStream(entrada);
                     OutputStream out = new FileOutputStream(salida)) {
                    copiar(in, out);
                }
            }
        }

        if (!new File(temporal, "index.html").exists()) {
            borrar(temporal);
            throw new IOException("zip_sin_index");
        }
        // Reemplazo atómico: fuera la versión anterior (misma numeración) y
        // dentro la nueva, ya completa.
        borrar(destino);
        if (!temporal.renameTo(destino)) {
            borrar(temporal);
            throw new IOException("no se pudo mover el bundle");
        }
        return destino;
    }

    /** ZIP con al menos un `index.html` en la raíz y tamaño plausible. */
    public static boolean zipValido(File zip) {
        if (zip == null || !zip.exists() || zip.length() < 1024) return false;
        try (ZipFile zf = new ZipFile(zip)) {
            // `zip -r out.zip .` puede guardar `./index.html` según la versión;
            // el archivo extraído cae igual en la raíz, así que valen las dos.
            ZipEntry index = zf.getEntry("index.html");
            if (index == null) index = zf.getEntry("./index.html");
            return index != null && !index.isDirectory();
        } catch (Exception e) {
            return false;
        }
    }

    static int versionDeCarpeta(File dir) {
        String nombre = dir == null ? "" : dir.getName();
        if (nombre == null || !nombre.startsWith(PREFIJO)) return 0;
        try {
            return Integer.parseInt(nombre.substring(PREFIJO.length()));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static void borrar(File f) {
        if (f == null) return;
        File[] hijos = f.isDirectory() ? f.listFiles() : null;
        if (hijos != null) {
            for (File hijo : hijos) borrar(hijo);
        }
        f.delete();
    }

    static void copiar(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
    }
}
