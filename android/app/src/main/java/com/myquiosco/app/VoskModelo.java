package com.myquiosco.app;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * VoskModelo — carpeta del modelo Vosk compartida por el dock y el servicio.
 *
 * El modelo (vosk-model-small-es, ~38 MB en ZIP) ya NO viaja dentro de la APK:
 * se descarga una sola vez (o se importa desde un archivo) y se descomprime a
 * `files/vosk-es`. Tanto `VoskVoicePlugin` como `VozEscuchaService` leen esa
 * MISMA carpeta.
 *
 * Orígenes del ZIP, por orden:
 * 1. `files/vosk-modelo.zip` — descargado por `VoskModeloPlugin` o importado
 *    desde el selector de archivos (USB/SD).
 * 2. `cache/vosk-es.zip` — resto de la copia desde assets de versiones viejas.
 * 3. `assets/vosk/vosk-es.zip` — compatibilidad temporal: si esta versión se
 *    compiló con el asset dentro (build local), se sigue usando.
 *
 * Si no hay ninguno se lanza `Ausente`, que el servicio interpreta como
 * "modelo sin descargar" (no como modelo corrupto): no marca fallo permanente.
 *
 * Aquí solo vive la preparación del directorio: cada consumidor crea su propio
 * `org.vosk.Model`, porque un modelo cargado no se puede cerrar mientras otro
 * hilo lo está usando. Así el servicio no tumba el reconocedor del dock ni al
 * revés.
 */
public final class VoskModelo {

    private static final String ASSET_ZIP = "vosk/vosk-es.zip";
    private static final String CARPETA = "vosk-es";
    private static final String MARCADOR = ".ok";
    /** ZIP descargado/importado: la fuente "normal" desde la v2.4. */
    private static final String ZIP = "vosk-modelo.zip";
    /** Archivo de texto con la versión del modelo instalado (lo escribe el plugin). */
    private static final String VERSION = "vosk-modelo.version";
    /** Descarga parcial, reanudable. Vive en caché para no ocupar datos del usuario. */
    public static final String PART = "vosk-modelo.zip.part";

    /** Aviso de progreso; puede ser `null`. */
    public interface Progreso {
        void fase(String fase, int porcentaje);
    }

    /** El modelo no está en el dispositivo y no hay asset: hay que descargarlo. */
    public static class Ausente extends Exception {
        public Ausente(String mensaje) {
            super(mensaje);
        }
    }

    private VoskModelo() { }

    /**
     * Devuelve la carpeta con el modelo, descomprimiéndolo la primera vez.
     * Es idempotente y serializado: dos llamadas simultáneas esperan la misma
     * descompresión en vez de pelearse por los ficheros.
     */
    public static synchronized File asegurar(Context ctx, Progreso progreso) throws Exception {
        File base = new File(ctx.getFilesDir(), CARPETA);
        File marcador = new File(base, MARCADOR);
        File existente = primeraCarpeta(base);
        if (marcador.exists() && existente != null) return existente;

        File zip = zipParaDescomprimir(ctx);
        if (zip == null) {
            throw new Ausente("modelo_no_descargado");
        }

        if (!base.exists() && !base.mkdirs()) {
            throw new IllegalStateException("no se pudo crear " + base.getAbsolutePath());
        }
        // Restos de un intento anterior (descompresión a medias): se limpian
        // para no mezclar modelos de versiones distintas.
        borrarContenido(base);

        avisar(progreso, "descomprimiendo", 0);
        try (ZipFile zf = new ZipFile(zip)) {
            Enumeration<? extends ZipEntry> entradas = zf.entries();
            int total = zf.size();
            int hechos = 0;
            String baseCanonica = base.getCanonicalPath() + File.separator;
            while (entradas.hasMoreElements()) {
                ZipEntry entrada = entradas.nextElement();
                File destino = new File(base, entrada.getName());
                // Defensa contra entradas ".." del ZIP: nada fuera de la carpeta.
                if (!destino.getCanonicalPath().startsWith(baseCanonica)) continue;
                if (entrada.isDirectory()) {
                    destino.mkdirs();
                } else {
                    File padre = destino.getParentFile();
                    if (padre != null) padre.mkdirs();
                    try (InputStream in = zf.getInputStream(entrada);
                         OutputStream out = new FileOutputStream(destino)) {
                        copiar(in, out);
                    }
                }
                hechos++;
                if (total > 0 && hechos % Math.max(1, total / 10) == 0) {
                    avisar(progreso, "descomprimiendo", Math.min(99, hechos * 100 / total));
                }
            }
        }

        File carpeta = primeraCarpeta(base);
        if (carpeta == null) throw new IllegalStateException("ZIP sin carpeta de modelo");
        if (!marcador.createNewFile() && !marcador.exists()) {
            throw new IllegalStateException("no se pudo crear el marcador");
        }

        // El ZIP descargado se borra al terminar: el modelo descomprimido es lo
        // que se usa y guardarlo duplicaría ~38 MB en el dispositivo. El asset y
        // la copia legada en caché también se limpian.
        if (zip.equals(zipDescargado(ctx)) || zip.equals(zipLegado(ctx))) {
            zip.delete();
        }

        avisar(progreso, "listo", 100);
        return carpeta;
    }

    /** ¿Ya está descomprimido? Sirve para saber si se puede escuchar offline. */
    public static boolean extraido(Context ctx) {
        File base = new File(ctx.getFilesDir(), CARPETA);
        return new File(base, MARCADOR).exists() && primeraCarpeta(base) != null;
    }

    /**
     * ¿Hay algo con lo que arrancar Vosk ahora mismo? Incluye el caso "ya
     * descomprimido", el ZIP descargado pendiente de descomprimir y el asset de
     * compatibilidad. Si es false, hay que descargar el modelo.
     */
    public static boolean disponible(Context ctx) {
        if (extraido(ctx)) return true;
        File descargado = zipDescargado(ctx);
        if (descargado.exists() && descargado.length() > 1024) return true;
        File legado = zipLegado(ctx);
        if (legado.exists() && legado.length() > 1024) return true;
        return assetDisponible(ctx);
    }

    /** Bytes del ZIP pendiente de descomprimir (0 si ya solo queda el extraído). */
    public static long bytesZip(Context ctx) {
        File descargado = zipDescargado(ctx);
        if (descargado.exists()) return descargado.length();
        File legado = zipLegado(ctx);
        if (legado.exists()) return legado.length();
        return 0L;
    }

    /** Versión del modelo instalado ('' si es un asset viejo o no hay modelo). */
    public static String version(Context ctx) {
        File f = new File(ctx.getFilesDir(), VERSION);
        if (!f.exists()) return "";
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] datos = new byte[(int) Math.min(64, f.length())];
            int n = in.read(datos);
            return n <= 0 ? "" : new String(datos, 0, n, "UTF-8").trim();
        } catch (Exception e) {
            return "";
        }
    }

    public static void guardarVersion(Context ctx, String version) {
        File f = new File(ctx.getFilesDir(), VERSION);
        try (OutputStream out = new FileOutputStream(f)) {
            out.write(String.valueOf(version == null ? "" : version).getBytes("UTF-8"));
        } catch (Exception ignored) { }
    }

    /**
     * Instala un ZIP ya validado como fuente del modelo: lo deja en
     * `files/vosk-modelo.zip` y borra el modelo descomprimido para que la
     * próxima llamada a `asegurar()` extraiga la versión nueva.
     */
    public static synchronized void instalarZip(Context ctx, File origen) throws IOException {
        if (!validar(origen)) throw new IOException("zip_invalido");
        File destino = zipDescargado(ctx);
        File temporal = new File(ctx.getCacheDir(), ZIP + ".nuevo");
        try (InputStream in = new FileInputStream(origen);
             OutputStream out = new FileOutputStream(temporal)) {
            copiar(in, out);
        }
        if (destino.exists() && !destino.delete()) {
            temporal.delete();
            throw new IOException("no se pudo reemplazar el modelo anterior");
        }
        if (!temporal.renameTo(destino)) {
            temporal.delete();
            throw new IOException("no se pudo guardar el modelo");
        }
        limpiarExtraido(ctx);
    }

    /** ¿El archivo es un ZIP con contenido suficiente para ser el modelo? */
    public static boolean validar(File zip) {
        if (zip == null || !zip.exists() || zip.length() < 1024 * 1024) return false;
        try (ZipFile zf = new ZipFile(zip)) {
            return zf.size() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /** Borra solo el modelo descomprimido (el ZIP queda para reintentar). */
    public static synchronized void limpiarExtraido(Context ctx) {
        borrarContenido(new File(ctx.getFilesDir(), CARPETA));
    }

    /** Borra modelo, ZIP, parcial y versión: vuelve al estado "sin descargar". */
    public static synchronized void borrarTodo(Context ctx) {
        limpiarExtraido(ctx);
        zipDescargado(ctx).delete();
        zipLegado(ctx).delete();
        new File(ctx.getCacheDir(), PART).delete();
        new File(ctx.getFilesDir(), VERSION).delete();
    }

    // ── Origen del ZIP ─────────────────────────────────────────────────────

    private static File zipDescargado(Context ctx) {
        return new File(ctx.getFilesDir(), ZIP);
    }

    private static File zipLegado(Context ctx) {
        return new File(ctx.getCacheDir(), "vosk-es.zip");
    }

    private static boolean assetDisponible(Context ctx) {
        try (InputStream in = ctx.getAssets().open(ASSET_ZIP)) {
            return in != null;
        } catch (Exception e) {
            return false;
        }
    }

    private static File zipParaDescomprimir(Context ctx) throws IOException {
        File descargado = zipDescargado(ctx);
        if (descargado.exists() && descargado.length() > 1024) return descargado;

        File legado = zipLegado(ctx);
        if (legado.exists() && legado.length() > 1024) return legado;

        // Compatibilidad con builds que aún empaquetan el asset: se copia a
        // caché porque ZipFile no lee bien un asset comprimido de la APK.
        if (assetDisponible(ctx)) {
            try (InputStream in = ctx.getAssets().open(ASSET_ZIP);
                 OutputStream out = new FileOutputStream(legado)) {
                copiar(in, out);
            }
            return legado;
        }
        return null;
    }

    private static void avisar(Progreso progreso, String fase, int porcentaje) {
        if (progreso == null) return;
        try {
            progreso.fase(fase, porcentaje);
        } catch (Exception ignored) { }
    }

    private static File primeraCarpeta(File base) {
        File[] hijos = base.listFiles();
        if (hijos == null) return null;
        for (File hijo : hijos) {
            if (hijo.isDirectory()) return hijo;
        }
        return null;
    }

    private static void borrarContenido(File carpeta) {
        File[] hijos = carpeta.listFiles();
        if (hijos == null) return;
        for (File hijo : hijos) {
            borrar(hijo);
        }
    }

    private static void borrar(File f) {
        if (f == null) return;
        File[] hijos = f.isDirectory() ? f.listFiles() : null;
        if (hijos != null) {
            for (File hijo : hijos) borrar(hijo);
        }
        f.delete();
    }

    private static void copiar(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
    }
}
