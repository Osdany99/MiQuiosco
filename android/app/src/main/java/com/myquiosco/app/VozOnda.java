package com.myquiosco.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * VozOnda — puente entre el servicio y la ventana de la onda.
 *
 * El servicio corre sin UI; cuando el jefe activa «Mostrar la onda al dictar» se
 * abre `VozDialogoActivity` sobre el bloqueo y este puente le pasa el nivel del
 * micrófono y lo que se va entendiendo. También decide si la función está
 * activada, leyendo la preferencia de Capacitor (mismo SharedPreferences que el
 * resto de ajustes).
 */
public final class VozOnda {

    /** Grupo de Preferences de Capacitor en Android. */
    private static final String PREF_GRUPO = "CapacitorStorage";
    public static final String PREF_ONDA = "voz.servicio.onda";

    public static final String MODO_ESCUCHANDO = "escuchando";
    public static final String MODO_HABLANDO = "hablando";
    public static final String MODO_PROCESANDO = "procesando";

    public interface Listener {
        void onCambio();
    }

    private static volatile float nivel = 0f;
    private static volatile String texto = "";
    private static volatile String modo = MODO_ESCUCHANDO;
    private static volatile Listener listener = null;

    private VozOnda() { }

    /** ¿El jefe activó la onda? Se lee en cada dictado: no hace falta reiniciar. */
    public static boolean activa(Context ctx) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREF_GRUPO, Context.MODE_PRIVATE);
            return "true".equals(prefs.getString(PREF_ONDA, "false"));
        } catch (Exception e) {
            return false;
        }
    }

    public static float nivel() {
        return nivel;
    }

    public static String texto() {
        return texto;
    }

    public static String modo() {
        return modo;
    }

    public static void publicar(float nuevoNivel, String nuevoTexto, String nuevoModo) {
        nivel = Math.max(0f, Math.min(1f, nuevoNivel));
        if (nuevoTexto != null) texto = nuevoTexto;
        if (nuevoModo != null) modo = nuevoModo;
        Listener actual = listener;
        if (actual != null) {
            try { actual.onCambio(); } catch (Exception ignored) { }
        }
    }

    public static void registrar(Listener l) {
        listener = l;
    }

    public static void quitar(Listener l) {
        if (listener == l) listener = null;
    }
}
