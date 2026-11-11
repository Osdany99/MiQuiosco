package com.myquiosco.app;

import android.os.Build;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * Plugin nativo de TTS para Capacitor.
 *
 * Resuelve el problema de que la WebView de Android no puede enumerar las voces
 * instaladas vía window.speechSynthesis.getVoices() (devuelve []).
 *
 * API JS:
 *   TtsNative.check()                        → { available, engineName }
 *   TtsNative.getVoices({ language?: 'es' }) → { voices: [...] }
 *   TtsNative.speak({ text, voiceName?, language?, rate? })  → { ok }
 *   TtsNative.stop()                         → { ok }
 */
@CapacitorPlugin(name = "TtsNative")
public class TtsNativePlugin extends Plugin {

    private TextToSpeech tts = null;
    private boolean ttsReady = false;
    private PluginCall pendingInit = null;

    // ──────────────────────────────────────────────
    //  Ciclo de vida
    // ──────────────────────────────────────────────

    @Override
    public void load() {
        initTts(null);
    }

    @Override
    public void handleOnDestroy() {
        shutdownTts();
    }

    private void initTts(PluginCall waitingCall) {
        ttsReady = false;
        pendingInit = waitingCall;
        shutdownTts();
        tts = new TextToSpeech(getContext(), status -> {
            ttsReady = (status == TextToSpeech.SUCCESS);
            if (ttsReady) {
                // Forzar idioma por defecto a español para el contexto de MiQuiosco.
                tts.setLanguage(new Locale("es", "ES"));
            }
            if (pendingInit != null) {
                PluginCall c = pendingInit;
                pendingInit = null;
                resolveCheck(c);
            }
        });
    }

    private void shutdownTts() {
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) {}
            try { tts.shutdown(); } catch (Exception ignored) {}
            tts = null;
        }
    }

    // ──────────────────────────────────────────────
    //  check() — ¿hay motor TTS?
    // ──────────────────────────────────────────────

    @PluginMethod
    public void check(PluginCall call) {
        if (tts == null || !ttsReady) {
            // Motor aún no listo: reiniciar y resolver cuando esté.
            initTts(call);
            return;
        }
        resolveCheck(call);
    }

    private void resolveCheck(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", ttsReady);
        if (tts != null && ttsReady) {
            try {
                String engine = tts.getDefaultEngine();
                r.put("engineName", engine != null ? engine : "");
            } catch (Exception e) {
                r.put("engineName", "");
            }
        } else {
            r.put("engineName", "");
        }
        call.resolve(r);
    }

    // ──────────────────────────────────────────────
    //  getVoices() — listar voces instaladas
    // ──────────────────────────────────────────────

    @PluginMethod
    public void getVoices(PluginCall call) {
        if (tts == null || !ttsReady) {
            call.reject("tts_not_ready");
            return;
        }

        String filtroLang = call.getString("language", "");
        JSArray arr = new JSArray();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        // Ignorar voces de red si el caller solo quiere offline.
                        // Incluir todas para que la UI pueda filtrar.
                        String lang = v.getLocale() != null
                                ? v.getLocale().toLanguageTag()
                                : "";

                        // Filtrar por idioma si se especificó (p. ej. "es").
                        if (filtroLang != null && !filtroLang.isEmpty()) {
                            if (!lang.toLowerCase().startsWith(filtroLang.toLowerCase())) {
                                continue;
                            }
                        }

                        JSObject item = new JSObject();
                        item.put("name", v.getName());
                        item.put("lang", lang);
                        item.put("offline", !v.isNetworkConnectionRequired());
                        item.put("quality", v.getQuality());
                        // Marcar si está instalada/descargada.
                        int features = v.getFeatures() != null ? v.getFeatures().size() : 0;
                        item.put("installed", !v.isNetworkConnectionRequired());
                        arr.put(item);
                    }
                }
            } catch (Exception e) {
                // Algunos motores TTS lanzan excepciones al listar voces;
                // devolver la lista vacía es mejor que fallar.
            }
        }

        // Fallback para API < 21 o si getVoices() devolvió vacío:
        // reportar al menos el idioma por defecto disponible.
        if (arr.length() == 0) {
            try {
                Locale[] locales = Locale.getAvailableLocales();
                for (Locale loc : locales) {
                    int avail = tts.isLanguageAvailable(loc);
                    if (avail >= TextToSpeech.LANG_AVAILABLE) {
                        String lang = loc.toLanguageTag();
                        if (filtroLang != null && !filtroLang.isEmpty()) {
                            if (!lang.toLowerCase().startsWith(filtroLang.toLowerCase())) {
                                continue;
                            }
                        }
                        JSObject item = new JSObject();
                        item.put("name", lang);
                        item.put("lang", lang);
                        item.put("offline", avail == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE
                                || avail == TextToSpeech.LANG_COUNTRY_AVAILABLE
                                || avail == TextToSpeech.LANG_AVAILABLE);
                        item.put("quality", 0);
                        item.put("installed", true);
                        arr.put(item);
                    }
                }
            } catch (Exception ignored) {}
        }

        JSObject result = new JSObject();
        result.put("voices", arr);
        call.resolve(result);
    }

    // ──────────────────────────────────────────────
    //  speak() — sintetizar voz
    // ──────────────────────────────────────────────

    @PluginMethod
    public void speak(PluginCall call) {
        if (tts == null || !ttsReady) {
            call.reject("tts_not_ready");
            return;
        }

        String text = call.getString("text", "");
        if (text.isEmpty()) {
            call.reject("text_required");
            return;
        }

        String voiceName = call.getString("voiceName", null);
        String language = call.getString("language", "es-ES");
        float rate = call.getFloat("rate", 1.0f);

        // Aplicar voz seleccionada.
        if (voiceName != null && !voiceName.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        if (voiceName.equals(v.getName())) {
                            tts.setVoice(v);
                            break;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }

        // Aplicar idioma (fallback si no se encontró la voz).
        if (language != null && !language.isEmpty()) {
            try {
                Locale loc = Locale.forLanguageTag(language);
                tts.setLanguage(loc);
            } catch (Exception ignored) {}
        }

        tts.setSpeechRate(rate);

        String utteranceId = UUID.randomUUID().toString();

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String id) {
                if (utteranceId.equals(id)) {
                    JSObject ev = new JSObject();
                    ev.put("event", "start");
                    notifyListeners("ttsEvent", ev);
                }
            }

            // Cada rango de palabras: empuja la animación de la onda.
            @Override
            public void onRangeStart(String id, int frame, int start, int end) {
                if (utteranceId.equals(id)) {
                    JSObject ev = new JSObject();
                    ev.put("event", "boundary");
                    notifyListeners("ttsEvent", ev);
                }
            }

            @Override
            public void onDone(String id) {
                if (utteranceId.equals(id)) {
                    JSObject ev = new JSObject();
                    ev.put("event", "end");
                    notifyListeners("ttsEvent", ev);
                    call.resolve(jsOk());
                }
            }

            @Override
            public void onError(String id) {
                if (utteranceId.equals(id)) {
                    JSObject ev = new JSObject();
                    ev.put("event", "error");
                    notifyListeners("ttsEvent", ev);
                    call.resolve(jsOk());
                }
            }
        });

        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (result == TextToSpeech.ERROR) {
            call.reject("speak_failed");
        }
        // Si result es SUCCESS, la promesa se resuelve en onDone/onError.
    }

    // ──────────────────────────────────────────────
    //  stop() — detener la reproducción
    // ──────────────────────────────────────────────

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) {}
        }
        call.resolve(jsOk());
    }

    // ──────────────────────────────────────────────
    //  Utilidades
    // ──────────────────────────────────────────────

    private static JSObject jsOk() {
        JSObject r = new JSObject();
        r.put("ok", true);
        return r;
    }
}

