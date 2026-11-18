package com.myquiosco.app;

import android.content.Context;

/**
 * VozOnda - puente entre el servicio y la ventana de la onda.
 *
 * El servicio corre sin UI; al dictar se abre `VozDialogoActivity` sobre el
 * bloqueo y este puente le pasa el nivel del micrófono y lo que se va
 * entendiendo. La onda ya no es opcional: se muestra siempre que se dicta.
 */
public final class VozOnda {

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

    /** ¿La onda se muestra al dictar con la app cerrada? Siempre. */
    public static boolean activa(Context ctx) {
        return true;
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
