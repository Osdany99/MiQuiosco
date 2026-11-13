package com.myquiosco.app;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * VOSK — reconocimiento de voz offline empaquetado en la app.
 *
 * Se usa cuando no hay acceso a Internet real (sin depender del paquete de
 * idioma de Google ni del servicio del sistema). Modelo: vosk-model-small-es
 * (39 MB, Apache 2.0), descomprimido una vez a filesDir.
 *
 * API:
 *   VoskVoice.preparar()   -> { listo, msCarga, ruta }
 *   VoskVoice.requestPermission()
 *   VoskVoice.start()      -> { text, confidence, alternativas, msAudio, msDecode, motor }
 *   VoskVoice.finish()     -> { ok }   (resuelve el start pendiente)
 *   VoskVoice.cancel()     -> { ok }   (descarta y rechaza el start)
 *   VoskVoice.liberar()    -> { ok }
 *   VoskVoice.estado()     -> { listo, grabando, sampleRate }
 *
 * Emite eventos `sttEvent` (start, ready, partial, result, error, stop,
 * finish) para que la traza de diagnóstico unificada los capture igual que
 * el motor Google.
 */
@CapacitorPlugin(
    name = "VoskVoice",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "record"
        )
    }
)
public class VoskVoicePlugin extends Plugin {

    private static final String ALIAS_RECORD = "record";
    private static final String TAG = "MiQuioscoVosk";
    private static final int SAMPLE_RATE = 16000;
    private static final String ASSET_ZIP = "vosk/vosk-es.zip";
    private static final String CARPETA = "vosk-es";
    private static final String MARCADOR = ".ok";

    private Model modelo = null;
    private Recognizer recognizer = null;
    private AudioRecord audio = null;
    private Thread hilo = null;
    private PluginCall llamadaInicio = null;

    private final AtomicBoolean grabando = new AtomicBoolean(false);
    private final AtomicBoolean detener = new AtomicBoolean(false);
    private final AtomicBoolean cancelado = new AtomicBoolean(false);

    private long inicioMs = 0L;
    private long audioMs = 0L;
    private final StringBuilder acumulado = new StringBuilder();
    private final List<String> ultimasAlternativas = new ArrayList<>();
    private String ultimoParcial = "";

    // ── Permisos ───────────────────────────────────────────────────────────

    private boolean tienePermiso() {
        return getPermissionState(ALIAS_RECORD) == PermissionState.GRANTED;
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (tienePermiso()) {
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias(ALIAS_RECORD, call, "permisoCallback");
    }

    @PermissionCallback
    private void permisoCallback(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", tienePermiso());
        call.resolve(r);
    }

    // ── Modelo ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void preparar(PluginCall call) {
        new Thread(() -> {
            try {
                long t0 = System.currentTimeMillis();
                File carpetaModelo = asegurarModelo();
                if (modelo == null) {
                    emitir("carga", null);
                    modelo = new Model(carpetaModelo.getAbsolutePath());
                }
                JSObject r = new JSObject();
                r.put("listo", true);
                r.put("msCarga", System.currentTimeMillis() - t0);
                r.put("ruta", carpetaModelo.getName());
                call.resolve(r);
                emitir("listo", r);
            } catch (Throwable e) {
                Log.e(TAG, "preparar falló", e);
                call.reject("modelo: " + e.getMessage());
            }
        }, "vosk-preparar").start();
    }

    private File asegurarModelo() throws Exception {
        File base = new File(getContext().getFilesDir(), CARPETA);
        File marcador = new File(base, MARCADOR);
        File existente = primeraCarpeta(base);
        if (marcador.exists() && existente != null) return existente;

        if (!base.exists() && !base.mkdirs()) {
            throw new IllegalStateException("no se pudo crear " + base.getAbsolutePath());
        }

        File zip = new File(getContext().getCacheDir(), "vosk-es.zip");
        if (!zip.exists() || zip.length() < 1024) {
            emitir("preparar", datos("copiando"));
            try (InputStream in = getContext().getAssets().open(ASSET_ZIP);
                 OutputStream out = new FileOutputStream(zip)) {
                copiar(in, out);
            }
        }

        emitir("preparar", datos("descomprimiendo"));
        try (ZipFile zf = new ZipFile(zip)) {
            Enumeration<? extends ZipEntry> entradas = zf.entries();
            int total = zf.size();
            int hechos = 0;
            String baseCanonica = base.getCanonicalPath() + File.separator;
            while (entradas.hasMoreElements()) {
                ZipEntry entrada = entradas.nextElement();
                File destino = new File(base, entrada.getName());
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
                    JSObject p = datos("descomprimiendo");
                    p.put("progreso", Math.min(99, hechos * 100 / total));
                    emitir("preparar", p);
                }
            }
        }
        zip.delete();

        File carpeta = primeraCarpeta(base);
        if (carpeta == null) throw new IllegalStateException("ZIP sin carpeta de modelo");
        if (!marcador.createNewFile() && !marcador.exists()) {
            throw new IllegalStateException("no se pudo crear el marcador");
        }
        emitir("preparar", datos("listo"));
        return carpeta;
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

    // ── Grabación ──────────────────────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        if (modelo == null) {
            call.reject("modelo_no_listo");
            return;
        }
        if (grabando.get()) {
            call.reject("busy");
            return;
        }
        if (!tienePermiso()) {
            call.reject("insufficient_permissions");
            return;
        }

        try {
            recognizer = new Recognizer(modelo, SAMPLE_RATE);
            recognizer.setMaxAlternatives(5);
            // Endpointer permisivo: no exige silencio prolongado al final.
            recognizer.setEndpointerDelays(5.0f, 1.0f, 15.0f);
        } catch (Throwable e) {
            call.reject("recognizer: " + e.getMessage());
            return;
        }

        int minimo = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int tamBuffer = Math.max(minimo, SAMPLE_RATE / 5 * 2); // ~200 ms
        try {
            audio = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                tamBuffer
            );
        } catch (Throwable e) {
            call.reject("audio: " + e.getMessage());
            return;
        }
        if (audio.getState() != AudioRecord.STATE_INITIALIZED) {
            audio.release();
            audio = null;
            call.reject("audio_no_inicializado");
            return;
        }

        llamadaInicio = call;
        acumulado.setLength(0);
        ultimasAlternativas.clear();
        ultimoParcial = "";
        audioMs = 0L;
        inicioMs = System.currentTimeMillis();
        cancelado.set(false);
        detener.set(false);
        grabando.set(true);

        JSObject inicio = new JSObject();
        inicio.put("sampleRate", SAMPLE_RATE);
        inicio.put("motor", "vosk");
        emitir("start", inicio);

        hilo = new Thread(this::bucle, "vosk-audio");
        hilo.start();
    }

    private void bucle() {
        try {
            audio.startRecording();
            emitir("ready", null);

            short[] buffer = new short[1600]; // 100 ms a 16 kHz
            while (!detener.get()) {
                int n = audio.read(buffer, 0, buffer.length);
                if (n <= 0) continue;
                audioMs += (n * 1000L) / SAMPLE_RATE;

                boolean corte = recognizer.acceptWaveForm(buffer, n);
                String parcial = textoDe(recognizer.getPartialResult(), "partial");
                if (!parcial.isEmpty() && !parcial.equals(ultimoParcial)) {
                    ultimoParcial = parcial;
                    JSObject p = new JSObject();
                    p.put("texto", parcial);
                    p.put("msAudio", audioMs);
                    emitir("partial", p);
                }
                if (corte) {
                    acumular(recognizer.getResult());
                    ultimoParcial = "";
                }
            }

            // Cierre limpio: el último tramo no se pierde.
            String finalJson = recognizer.getFinalResult();
            acumular(finalJson);
            if (acumulado.length() == 0 && !ultimoParcial.isEmpty()) {
                acumulado.append(ultimoParcial);
            }
            ultimoParcial = "";
            terminar();
        } catch (Throwable e) {
            Log.e(TAG, "bucle de audio falló", e);
            fallar(e);
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        detener.set(true);
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
        emitir("finish", null);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelado.set(true);
        detener.set(true);
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
        emitir("cancel", null);
    }

    private void terminar() {
        liberarAudio();
        boolean fueCancelado = cancelado.get();
        PluginCall pendiente = llamadaInicio;
        llamadaInicio = null;
        grabando.set(false);

        if (pendiente == null) return;
        if (fueCancelado) {
            pendiente.reject("cancelled");
            return;
        }

        JSObject r = new JSObject();
        r.put("text", acumulado.toString().trim());
        r.put("confidence", ultimasAlternativas.isEmpty() ? 0.8 : 0.9);
        JSArray alternativas = new JSArray();
        for (String a : ultimasAlternativas) {
            JSObject alt = new JSObject();
            alt.put("texto", a);
            alt.put("confianza", 0.8);
            alternativas.put(alt);
        }
        r.put("alternativas", alternativas);
        r.put("msAudio", audioMs);
        r.put("msDecode", System.currentTimeMillis() - inicioMs);
        r.put("motor", "vosk");
        pendiente.resolve(r);
        emitir("result", r);
    }

    private void fallar(Throwable e) {
        liberarAudio();
        PluginCall pendiente = llamadaInicio;
        llamadaInicio = null;
        grabando.set(false);
        JSObject error = new JSObject();
        error.put("detalle", e.getMessage() == null ? "" : e.getMessage());
        emitir("error", error);
        if (pendiente != null) pendiente.reject("audio: " + e.getMessage());
    }

    private void liberarAudio() {
        detener.set(true);
        if (audio != null) {
            try {
                if (audio.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) audio.stop();
            } catch (Exception ignored) { }
            try {
                audio.release();
            } catch (Exception ignored) { }
            audio = null;
        }
        if (recognizer != null) {
            try {
                recognizer.close();
            } catch (Exception ignored) { }
            recognizer = null;
        }
        hilo = null;
        if (!cancelado.get()) emitir("stop", null);
    }

    // ── Estado y liberación ────────────────────────────────────────────────

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("listo", modelo != null);
        r.put("grabando", grabando.get());
        r.put("sampleRate", SAMPLE_RATE);
        call.resolve(r);
    }

    @PluginMethod
    public void liberar(PluginCall call) {
        cancelado.set(true);
        detener.set(true);
        liberarAudio();
        if (modelo != null) {
            try {
                modelo.close();
            } catch (Exception ignored) { }
            modelo = null;
        }
        JSObject r = new JSObject();
        r.put("ok", true);
        call.resolve(r);
    }

    // ── Utilidades ─────────────────────────────────────────────────────────

    private void emitir(String evento, JSObject datos) {
        JSObject d = datos == null ? new JSObject() : datos;
        d.put("event", evento);
        d.put("evento", "stt." + evento);
        d.put("t", System.currentTimeMillis());
        try {
            notifyListeners("sttEvent", d);
        } catch (Exception ignored) { }
    }

    private static JSObject datos(String fase) {
        JSObject d = new JSObject();
        d.put("fase", fase);
        return d;
    }

    private static String textoDe(String json, String campo) {
        if (json == null) return "";
        try {
            org.json.JSONObject o = new org.json.JSONObject(json);
            String texto = o.optString(campo, "");
            if (texto.isEmpty()) texto = o.optString("text", "");
            return texto.trim();
        } catch (Exception e) {
            return "";
        }
    }

    private void acumular(String json) {
        if (json == null) return;
        try {
            org.json.JSONObject o = new org.json.JSONObject(json);
            String texto = o.optString("text", "").trim();
            if (!texto.isEmpty()) {
                if (acumulado.length() > 0) acumulado.append(' ');
                acumulado.append(texto);
            }
            org.json.JSONArray alternativas = o.optJSONArray("alternatives");
            if (alternativas != null) {
                ultimasAlternativas.clear();
                for (int i = 0; i < alternativas.length(); i++) {
                    org.json.JSONObject alt = alternativas.optJSONObject(i);
                    String t = alt == null ? "" : alt.optString("text", "").trim();
                    if (!t.isEmpty()) ultimasAlternativas.add(t);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "resultado no parseable: " + json);
        }
    }
}
