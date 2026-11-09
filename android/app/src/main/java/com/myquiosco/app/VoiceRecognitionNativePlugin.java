package com.myquiosco.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Plugin nativo de STT (baseline de Fase 0). No se sustituye al futuro
 * composable de voz: solo sirve para medir SpeechRecognizer de Android en
 * dispositivo real sin depender de npm ni de la red.
 *
 * API:
 *   VoiceRecognitionNative.check()
 *   VoiceRecognitionNative.requestPermission()
 *   VoiceRecognitionNative.start({ language: 'es-ES' }) -> { text, confidence, durationMs }
 *   VoiceRecognitionNative.stop()
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

    private SpeechRecognizer recognizer = null;
    private PluginCall currentCall = null;
    private long startTime = 0L;
    private long ultimoNivelMs = 0L;

    @PluginMethod
    public void check(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permission", tienePermiso(Manifest.permission.RECORD_AUDIO));
        r.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
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
        if (tienePermiso(Manifest.permission.RECORD_AUDIO)) {
            comenzar(call.getString("language", "es-ES"));
        } else {
            requestPermissionForAliases(new String[]{ALIAS_RECORD}, call, "permisoResueltoStart");
        }
    }

    @PermissionCallback
    private void permisoResueltoStart(PluginCall call) {
        if (tienePermiso(Manifest.permission.RECORD_AUDIO)) {
            comenzar(call.getString("language", "es-ES"));
        } else {
            currentCall = null;
            call.reject("permission_denied");
        }
    }

    private void comenzar(String language) {
        final PluginCall c = currentCall;
        if (c == null) return;
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
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                if (language != null && !language.isEmpty()) {
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                }
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                // Dar margen para que el usuario hable sin que el
                // reconocedor se rinda por silencio.
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3000);
                intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 3000);

                startTime = System.currentTimeMillis();
                final long t0 = startTime;
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {}
                    @Override public void onBeginningOfSpeech() {}
                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION);
                        if (matches == null || matches.isEmpty()) return;
                        String text = matches.get(0);
                        try {
                            JSObject data = new JSObject();
                            data.put("text", text == null ? "" : text);
                            notifyListeners("partialResult", data);
                        } catch (Exception ignored) { }
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
                    @Override public void onEndOfSpeech() {}
                    @Override public void onEvent(int eventType, Bundle params) {}

                    @Override
                    public void onResults(Bundle results) {
                        ArrayList<String> matches = results.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION);
                        float[] scores = results.getFloatArray(
                            SpeechRecognizer.CONFIDENCE_SCORES);
                        String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                        float confidence = (scores != null && scores.length > 0) ? scores[0] : 0f;
                        long duration = System.currentTimeMillis() - t0;

                        if (currentCall != null) {
                            JSObject data = new JSObject();
                            data.put("text", text);
                            data.put("confidence", confidence);
                            data.put("durationMs", duration);
                        JSArray alternativas = new JSArray();
                        if (matches != null) {
                            int limite = Math.min(matches.size(), 5);
                            for (int i = 0; i < limite; i++) {
                                JSObject alt = new JSObject();
                                alt.put("text", matches.get(i));
                                float sc = (scores != null && i < scores.length) ? scores[i] : 0f;
                                alt.put("confidence", sc);
                                alternativas.put(alt);
                            }
                        }
                        data.put("alternativas", alternativas);
                            currentCall.resolve(data);
                            currentCall = null;
                        }
                        cleanupRecognizer();
                    }

                    @Override
                    public void onError(int error) {
                        String msg = mensajeError(error);
                        if (currentCall != null) {
                            currentCall.reject(msg, String.valueOf(error));
                            currentCall = null;
                        }
                        cleanupRecognizer();
                    }
                });
                recognizer.startListening(intent);
            } catch (Exception ex) {
                if (currentCall != null) {
                    currentCall.reject("start_failed: " + ex.getMessage(), ex);
                    currentCall = null;
                }
                cleanupRecognizer();
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
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
            default: return "unknown_error_" + code;
        }
    }

    private boolean tienePermiso(String permiso) {
        return androidx.core.content.ContextCompat.checkSelfPermission(
            getContext(), permiso) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
}