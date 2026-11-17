package com.myquiosco.app;

/**
 * «Repite» y «ayuda» con la app cerrada.
 *
 * El servicio no tiene pantalla ni catálogo de comandos: recuerda la última
 * frase que habló y la vuelve a decir. Si todavía no dijo nada, lo admite en vez
 * de inventar una respuesta.
 *
 * Sin Android: se prueba con JUnit.
 */
public final class RepeticionVoz {

    private RepeticionVoz() {
    }

    /** Frases completas que piden repetir; un «repite» a secas es lo normal. */
    private static final String REPETIR =
        "^(repite|repitelo|repetir|repite eso|otra vez|que dijiste|como dijiste)$";

    /** Frases que piden la ayuda hablada del servicio. */
    private static final String AYUDA =
        "^(ayuda|que puedes hacer|que sabes hacer|comandos|que comandos|como te uso|para que sirves)$";

    /** ¿La frase pide repetir la última respuesta? */
    public static boolean pideRepetir(String texto) {
        return IntencionVenta.normalizarFrase(texto).matches(REPETIR);
    }

    /** ¿La frase pide ayuda? */
    public static boolean pideAyuda(String texto) {
        return IntencionVenta.normalizarFrase(texto).matches(AYUDA);
    }

    /**
     * Lo que hay que repetir: la última frase hablada, o `null` si el servicio
     * aún no ha dicho nada (el llamador usa entonces el aviso de estado vacío).
     */
    public static String paraRepetir(String ultimaFrase) {
        String ultima = ultimaFrase == null ? "" : ultimaFrase.trim();
        return ultima.isEmpty() ? null : ultima;
    }
}
