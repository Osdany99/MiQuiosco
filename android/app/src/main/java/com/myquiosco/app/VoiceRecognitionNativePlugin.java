package com.myquiosco.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.List;

/**
 * Plugin nativo de STT.
 *
 * API:
 *   VoiceRecognitionNative.check()
 *   VoiceRecognitionNative.requestPermission()
 *   VoiceRecognitionNative.start({ language: 'es-US', offline: true }) -> { text, confidence, durationMs }
 *   VoiceRecognitionNative.start({ language: null, offline: true })    // idioma del sistema
 *   VoiceRecognitionNative.stop()
 *   VoiceRecognitionNative.finish()
 *
 * Un solo intento: no hay plan de reintentos ni fallback online/offline.
 * `offline = true` pone EXTRA_PREFER_OFFLINE; `offline = false` usa el motor online.
 */
@CapacitorPlugin(
    name = "VoiceRecognitionNative",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "record"
        )
    }
)
public class VoiceRecognitionNativePlugin extends Plugin {

    private static final String ALIAS_RECORD = "record";
    private static final String TAG = "MiQuioscoSTT";

    // Codigos de SpeechRecognizer que solo existen desde API 31. Se declaran
    // como literales para no disparar el lint NewApi en minSdk 24.
    private static final int ERROR_TOO_MANY_REQUESTS_CODE = 10;
    private static final int ERROR_SERVER_DISCONNECTED_CODE = 11;
    private static final int ERROR_LANGUAGE_NOT_SUPPORTED_CODE = 12;
    private static final int ERROR_LANGUAGE_UNAVAILABLE_CODE = 13;

    private SpeechRecognizer recognizer = null;
    private PluginCall currentCall = null;
    private long startTime = 0L;
    private long ultimoNivelMs = 0L;
    private String lastPartialText = "";
    private ArrayList<String> lastPartialMatches = new ArrayList<>();
    private int partialContados = 0;
    private String servicioActual = "";
    // Android sigue ocupado 200-500 ms después de cerrar una sesión. Un solo
    // reintento silencioso evita perder el comando por `recognizer_busy`.
    private boolean reintentoBusy = false;
    private static final int MAX_DIAG = 200;
    private final ArrayDeque<JSObject> bufferDiag = new ArrayDeque<>();
    private final Handler handler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void check(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permission", tienePermiso(Manifest.permission.RECORD_AUDIO));
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("onDevice", onDeviceDisponible());
        r.put("service", servicioReconocimiento());
        r.put("services", serviciosReconocimiento());
        call.resolve(r);
    }

    // ── Diagnóstico ────────────────────────────────────────────────────────
    // Cada callback del reconocedor se emite también a JS como `sttEvent`
    // (event + datos). Es local: la app decide si lo muestra o lo copia.

    private void emitir(String evento, JSObject datos) {
        JSObject d = datos == null ? new JSObject() : datos;
        d.put("event", evento);
        // `evento` es el nombre que espera `fusionarTrazas` en JS.
        d.put("evento", "stt." + evento);
        d.put("t", System.currentTimeMillis());
        guardarDiag(d);
        try {
            notifyListeners("sttEvent", d);
        } catch (Exception ignored) {
            // Sin listeners JS: no es un error.
        }
    }

    /** Buffer propio del plugin: red de seguridad si `notifyListeners` falla. */
    private void guardarDiag(JSObject evento) {
        try {
            bufferDiag.addLast(evento);
            while (bufferDiag.size() > MAX_DIAG) bufferDiag.removeFirst();
        } catch (Exception ignored) { }
    }

    @PluginMethod
    public void diag(PluginCall call) {
        JSObject r = new JSObject();
        JSArray eventos = new JSArray();
        for (JSObject e : bufferDiag) eventos.put(e);
        r.put("eventos", eventos);
        r.put("total", bufferDiag.size());
        call.resolve(r);
    }

    private static String nombreVariante(String idioma, boolean offline) {
        if (idioma == null) {
            return offline ? "offline-sistema" : "online-sistema";
        }
        return offline ? "offline" : "online";
    }

    private JSObject datosIntento(String idioma, boolean offline) {
        JSObject d = new JSObject();
        d.put("variante", nombreVariante(idioma, offline));
        d.put("offline", offline);
        if (idioma != null && !idioma.isEmpty()) d.put("lang", idioma);
        if (servicioActual != null && !servicioActual.isEmpty()) d.put("servicio", servicioActual);
        return d;
    }

    private JSObject datosTexto(String texto, float confidence, long durationMs, ArrayList<String> matches) {
        JSObject d = new JSObject();
        d.put("texto", texto == null ? "" : texto);
        d.put("confidence", confidence);
        d.put("ms", durationMs);
        d.put("alternativas", matches == null ? 0 : matches.size());
        return d;
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (tienePermiso(Manifest.permission.RECORD_AUDIO)) {
            resolverPermiso(call);
            return;
        }
        requestPermissionForAliases(new String[]{ALIAS_RECORD}, call, "permisoResuelto");
    }

    @PermissionCallback
    private void permisoResuelto(PluginCall call) {
        resolverPermiso(call);
    }

    private void resolverPermiso(PluginCall call) {
        boolean ok = tienePermiso(Manifest.permission.RECORD_AUDIO);
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (currentCall != null) {
            call.reject("busy");
            return;
        }
        currentCall = call;
        reintentoBusy = false;
        if (tienePermiso(Manifest.permission.RECORD_AUDIO)) {
            comenzar(call.getString("language"), call.getBoolean("offline", false));
        } else {
            requestPermissionForAliases(new String[]{ALIAS_RECORD}, call, "permisoResueltoStart");
        }
    }

    @PermissionCallback
    private void permisoResueltoStart(PluginCall call) {
        if (tienePermiso(Manifest.permission.RECORD_AUDIO)) {
            comenzar(call.getString("language"), call.getBoolean("offline", false));
        } else {
            currentCall = null;
            call.reject("permission_denied");
        }
    }

    private void comenzar(String language, boolean offline) {
        final String idioma = (language == null || language.isEmpty()) ? null : language;
        final boolean esOffline = offline;
        // Cancela reintentos pendientes de una prueba anterior.
        handler.removeCallbacksAndMessages(null);
        servicioActual = servicioReconocimiento();
        getActivity().runOnUiThread(() -> {
            try {
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
                    if (currentCall != null) {
                        currentCall.reject("not_available");
                        currentCall = null;
                    }
                    return;
                }
                cleanupRecognizer();
                lastPartialText = "";
                lastPartialMatches.clear();
                partialContados = 0;
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                if (recognizer == null) {
                    if (currentCall != null) {
                        currentCall.reject("not_available");
                        currentCall = null;
                    }
                    return;
                }
                Intent intent = construirIntent(idioma, esOffline);
                startTime = System.currentTimeMillis();

                // Traza: un solo intento, sin variantes de fallback.
                JSArray variantes = new JSArray();
                variantes.put(nombreVariante(idioma, esOffline));
                JSObject planDatos = new JSObject();
                planDatos.put("variantes", variantes);
                planDatos.put("servicio", servicioActual == null ? "" : servicioActual);
                planDatos.put("onDevice", onDeviceDisponible());
                planDatos.put("sdk", Build.VERSION.SDK_INT);
                emitir("plan", planDatos);
                emitir("start", datosIntento(idioma, esOffline));

                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override
                    public void onReadyForSpeech(Bundle params) {
                        // El micrófono ya captura: la UI puede decir "Habla ahora".
                        try {
                            notifyListeners("ready", new JSObject());
                        } catch (Exception ignored) { }
                        emitir("ready", datosIntento(idioma, esOffline));
                    }

                    @Override
                    public void onBeginningOfSpeech() {
                        emitir("beginning", datosIntento(idioma, esOffline));
                    }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches == null || matches.isEmpty()) return;
                        String text = matches.get(0);
                        if (text != null && !text.trim().isEmpty()) {
                            lastPartialText = text.trim();
                            lastPartialMatches = new ArrayList<>(matches);
                            partialContados++;
                        }
                        try {
                            JSObject data = new JSObject();
                            data.put("text", text == null ? "" : text);
                            notifyListeners("partialResult", data);
                        } catch (Exception ignored) { }
                        JSObject datos = datosIntento(idioma, esOffline);
                        datos.put("texto", text == null ? "" : text);
                        datos.put("parciales", partialContados);
                        emitir("partial", datos);
                    }

                    @Override
                    public void onRmsChanged(float rmsdB) {
                        // Nivel de voz para animar las ondas de la interfaz (máx. ~20/s).
                        long ahora = System.currentTimeMillis();
                        if (ahora - ultimoNivelMs < 50) return;
                        ultimoNivelMs = ahora;
                        try {
                            JSObject data = new JSObject();
                            data.put("rms", rmsdB);
                            notifyListeners("level", data);
                        } catch (Exception ignored) { }
                    }

                    @Override public void onBufferReceived(byte[] buffer) {}

                    @Override
                    public void onEndOfSpeech() {
                        emitir("end", datosIntento(idioma, esOffline));
                    }

                    @Override public void onEvent(int eventType, Bundle params) {}

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results != null ? results.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION) : null;
                        float[] scores = results != null ? results.getFloatArray(
                            SpeechRecognizer.CONFIDENCE_SCORES) : null;
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        float confidence = (scores != null && scores.length > 0) ? scores[0] : 0f;

                        // Rescatar transcripción parcial si el resultado final viene vacío.
                        if ((text == null || text.trim().isEmpty()) && !lastPartialText.isEmpty()) {
                            text = lastPartialText;
                            confidence = 0.8f;
                            if (matches == null || matches.isEmpty()) {
                                matches = lastPartialMatches;
                            }
                        }

                        long duration = System.currentTimeMillis() - startTime;
                        emitir("result", datosTexto(text, confidence, duration, matches));

                        if (currentCall != null) {
                            JSObject data = new JSObject();
                            data.put("text", text != null ? text : "");
                            data.put("confidence", confidence);
                            data.put("durationMs", duration);
                            JSArray alternativas = new JSArray();
                            if (matches != null) {
                                int limite = Math.min(matches.size(), 5);
                                for (int i = 0; i < limite; i++) {
                                    JSObject alt = new JSObject();
                                    alt.put("text", matches.get(i));
                                    float sc = (scores != null && i < scores.length) ? scores[i] : 0.8f;
                                    alt.put("confidence", sc);
                                    alternativas.put(alt);
                                }
                            } else if (text != null && !text.isEmpty()) {
                                JSObject alt = new JSObject();
                                alt.put("text", text);
                                alt.put("confidence", confidence);
                                alternativas.put(alt);
                            }
                            data.put("alternativas", alternativas);
                            currentCall.resolve(data);
                            currentCall = null;
                        }
                        cleanupRecognizer();
                    }

                    @Override
                    public void onError(int error) {
                        JSObject diagnostico = datosIntento(idioma, esOffline);
                        diagnostico.put("code", error);
                        diagnostico.put("mensaje", mensajeError(error));
                        diagnostico.put("parcial", lastPartialText);
                        diagnostico.put("parciales", partialContados);
                        emitir("error", diagnostico);

                        // Si ya capturamos voz, lo dicho vale más que el fallo final
                        // del motor. Se resuelve con la transcripción parcial.
                        if (!lastPartialText.isEmpty() && esRescatableConParcial(error)) {
                            Log.d(TAG, "rescate parcial code=" + error
                                    + " parciales=" + partialContados
                                    + " texto=" + lastPartialText);
                            JSObject rescate = datosIntento(idioma, esOffline);
                            rescate.put("code", error);
                            rescate.put("texto", lastPartialText);
                            rescate.put("parciales", partialContados);
                            emitir("rescue", rescate);
                            if (currentCall != null) {
                                currentCall.resolve(datosResultadoParcial());
                                currentCall = null;
                            }
                            cleanupRecognizer();
                            return;
                        }

                        // Reconocedor ocupado justo después de otra sesión: un solo
                        // reintento silencioso a los 400 ms. No se rechaza la
                        // llamada para que el JS no vea un error espurio.
                        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY && !reintentoBusy) {
                            reintentoBusy = true;
                            Log.d(TAG, "recognizer_busy: reintento en 400 ms");
                            cleanupRecognizer();
                            handler.postDelayed(() -> comenzar(idioma, esOffline), 400);
                            return;
                        }

                        // Un solo intento: se rechaza y no se prueba otra variante.
                        String msg = mensajeError(error);
                        Log.d(TAG, "onError code=" + error + " (" + msg + ")");
                        if (currentCall != null) {
                            currentCall.reject(msg, String.valueOf(error));
                            currentCall = null;
                        }
                        cleanupRecognizer();
                    }
                });
                recognizer.startListening(intent);
            } catch (Exception ex) {
                JSObject fallo = datosIntento(idioma, esOffline);
                fallo.put("detalle", ex.getMessage() == null ? "" : ex.getMessage());
                emitir("start_failed", fallo);
                if (currentCall != null) {
                    currentCall.reject("start_failed: " + ex.getMessage(), ex);
                    currentCall = null;
                }
                cleanupRecognizer();
            }
        });
    }

    /**
     * Construye el Intent del reconocedor para un intento único.
     * No se usa EXTRA_LANGUAGE_PREFERENCE (deprecado y fuente de conflictos).
     */
    private Intent construirIntent(String idioma, boolean offline) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        if (idioma != null) {
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
            // El servicio de reconocimiento de este teléfono necesita también
            // la preferencia de idioma; sin ella el online devolvía no_match.
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, idioma);
        }
        // Online puro u offline puro. Sin plan de fallback.
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, offline);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        try {
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
        } catch (Exception ignored) {}
        // Valores del plugin que funcionaba (8f2134b / e5d2a62).
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 3000);
        return intent;
    }

    /** Si ya hay voz capturada, casi cualquier fallo final permite rescatarla. */
    private static boolean esRescatableConParcial(int error) {
        return error != SpeechRecognizer.ERROR_RECOGNIZER_BUSY
            && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS;
    }

    /** Resultado con la última transcripción parcial (texto + alternativas). */
    private JSObject datosResultadoParcial() {
        JSObject data = new JSObject();
        data.put("text", lastPartialText);
        data.put("confidence", 0.8f);
        data.put("durationMs", System.currentTimeMillis() - startTime);
        JSArray alternativas = new JSArray();
        for (String m : lastPartialMatches) {
            JSObject alt = new JSObject();
            alt.put("text", m);
            alt.put("confidence", 0.8f);
            alternativas.put(alt);
        }
        if (alternativas.length() == 0) {
            JSObject alt = new JSObject();
            alt.put("text", lastPartialText);
            alt.put("confidence", 0.8f);
            alternativas.put(alt);
        }
        data.put("alternativas", alternativas);
        return data;
    }

    /** El dispositivo soporta reconocimiento on-device (API 31+). Solo diagnóstico. */
    private boolean onDeviceDisponible() {
        if (Build.VERSION.SDK_INT < 31) return false;
        try {
            return SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        } catch (Exception e) {
            return false;
        }
    }

    /** Componente del reconocedor por defecto ("paquete/clase") o "". */
    private String servicioReconocimiento() {
        try {
            String s = Settings.Secure.getString(
                getContext().getContentResolver(), "voice_recognition_service");
            return s == null ? "" : s;
        } catch (Exception e) {
            return "";
        }
    }

    /** Servicios de reconocimiento visibles para la app. */
    private JSArray serviciosReconocimiento() {
        JSArray arr = new JSArray();
        try {
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            List<ResolveInfo> lista = getContext().getPackageManager().queryIntentServices(i, 0);
            for (ResolveInfo ri : lista) {
                if (ri != null && ri.serviceInfo != null) {
                    arr.put(ri.serviceInfo.packageName + "/" + ri.serviceInfo.name);
                }
            }
        } catch (Exception ignored) {}
        return arr;
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            handler.removeCallbacksAndMessages(null);
            emitir("stop", null);
            if (recognizer != null) {
                try { recognizer.cancel(); } catch (Exception ignored) {}
            }
            cleanupRecognizer();
            if (currentCall != null) {
                currentCall.reject("cancelled");
                currentCall = null;
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        });
    }

    // Finaliza la escucha para consumir el resultado actual (push-to-talk).
    // NO cancela el reconocedor: el `start` pendiente resuelve con la
    // transcripcion cuando el motor termina. Base para push-to-talk.
    @PluginMethod
    public void finish(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            emitir("finish", null);
            if (recognizer != null) {
                try { recognizer.stopListening(); } catch (Exception ignored) {}
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        });
    }

    private void cleanupRecognizer() {
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    private static String mensajeError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO: return "error_audio";
            case SpeechRecognizer.ERROR_CLIENT: return "error_client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "insufficient_permissions";
            case SpeechRecognizer.ERROR_NETWORK: return "error_network";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "network_timeout";
            case SpeechRecognizer.ERROR_NO_MATCH: return "no_match";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "recognizer_busy";
            case SpeechRecognizer.ERROR_SERVER: return "error_server";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "speech_timeout";
            case ERROR_TOO_MANY_REQUESTS_CODE: return "too_many_requests";
            case ERROR_SERVER_DISCONNECTED_CODE: return "server_disconnected";
            case ERROR_LANGUAGE_NOT_SUPPORTED_CODE: return "language_not_supported";
            case ERROR_LANGUAGE_UNAVAILABLE_CODE: return "language_unavailable";
            default: return "unknown_error_" + code;
        }
    }

    private boolean tienePermiso(String permiso) {
        return androidx.core.content.ContextCompat.checkSelfPermission(
            getContext(), permiso) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
}