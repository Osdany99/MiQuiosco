package com.myquiosco.app;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Enumeration;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * VoskModelo — carpeta del modelo Vosk compartida por el dock y el servicio.
 *
 * El modelo (vosk-model-small-es, ~40 MB) se copia y descomprime una sola vez
 * desde `assets/vosk/vosk-es.zip` a `files/vosk-es`. Tanto el plugin de voz del
 * dock (`VoskVoicePlugin`) como el servicio en primer plano
 * (`VozEscuchaService`) leen esa MISMA carpeta.
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

    /** Aviso de progreso; puede ser `null`. */
    public interface Progreso {
        void fase(String fase, int porcentaje);
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

        if (!base.exists() && !base.mkdirs()) {
            throw new IllegalStateException("no se pudo crear " + base.getAbsolutePath());
        }

        File zip = new File(ctx.getCacheDir(), "vosk-es.zip");
        if (!zip.exists() || zip.length() < 1024) {
            avisar(progreso, "copiando", 0);
            try (InputStream in = ctx.getAssets().open(ASSET_ZIP);
                 OutputStream out = new FileOutputStream(zip)) {
                copiar(in, out);
            }
        }

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
        zip.delete();

        File carpeta = primeraCarpeta(base);
        if (carpeta == null) throw new IllegalStateException("ZIP sin carpeta de modelo");
        if (!marcador.createNewFile() && !marcador.exists()) {
            throw new IllegalStateException("no se pudo crear el marcador");
        }
        avisar(progreso, "listo", 100);
        return carpeta;
    }

    /** ¿Ya está descomprimido? Sirve para saber si se puede escuchar offline. */
    public static boolean extraido(Context ctx) {
        File base = new File(ctx.getFilesDir(), CARPETA);
        return new File(base, MARCADOR).exists() && primeraCarpeta(base) != null;
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

    private static void copiar(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
    }
}
