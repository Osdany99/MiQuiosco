package com.myquiosco.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Limpieza de muletillas y cortesías del dictado (Fase 6, F1b).
 *
 * Es el mismo trabajo que `shared/voz/limpieza.js` hace con la app abierta. Sin
 * esta clase, el modo con la app cerrada no mejora y las dos ramas divergen: el
 * mismo jefe dice lo mismo y una de las dos oye «por favor» y la otra no.
 *
 * Entrada: texto YA normalizado (minúsculas, sin tildes ni puntuación), que es
 * lo que devuelve `IntencionVenta.normalizarFrase`.
 *
 * Regla dura: no toca nada dentro del tramo de producto. «pan con ya» se queda
 * igual; «vende dos panes por favor» pierde el «por favor».
 *
 * El contrato entre esta clase y el JS es `assets/voz/limpiezaCasos.json`
 * (generado por `scripts/copiar-voz.mjs`). `LimpiarVozTest` lo recorre y exige
 * el 100 %: si un lado cambia de criterio, falla el build.
 */
public final class LimpiarVoz {

    private LimpiarVoz() {
    }

    /** Muletillas de arranque, de la más larga a la más corta. */
    private static final List<String> LEADING_FILLERS = Arrays.asList(
        "oye nova", "por favor", "a ver", "bueno", "mira", "oye", "ahora", "gracias");

    /** Muletillas de cierre. */
    private static final List<String> TRAILING_FILLERS = Arrays.asList(
        "por favor", "gracias", "ya", "ahora");

    /**
     * Palabras que no cierran una frase: si el «ya» va detrás de una de estas,
     * forma parte del producto («pan con ya») y no se toca.
     */
    private static final List<String> PREPOSICIONES = Arrays.asList(
        "con", "de", "del", "y", "al", "para", "a", "el", "la", "un", "los", "las", "en", "del");

    /**
     * Limpia la frase. Devuelve la entrada intacta si al quitar todo se queda
     * vacía: es preferible una frase con muletillas que una frase en blanco.
     */
    public static String limpiar(String textoNormalizado) {
        if (textoNormalizado == null) return "";
        String texto = textoNormalizado.trim();
        if (texto.isEmpty()) return "";

        String t = quitarPrefijo(texto);
        t = quitarCortesiaTrasVerbo(t);
        t = quitarSufijo(t);
        t = colapsarTartamudeo(t);
        return t.isEmpty() ? texto : t;
    }

    private static String quitarPrefijo(String texto) {
        String t = texto;
        boolean cambio = true;
        while (cambio) {
            cambio = false;
            for (String f : LEADING_FILLERS) {
                if (t.equals(f)) break;
                if (t.startsWith(f + " ")) {
                    t = t.substring(f.length()).trim();
                    cambio = true;
                    break;
                }
            }
        }
        return t;
    }

    private static String quitarSufijo(String texto) {
        String t = texto;
        boolean cambio = true;
        while (cambio && !t.isEmpty()) {
            cambio = false;
            for (String f : TRAILING_FILLERS) {
                if (t.equals(f)) break;
                if (t.endsWith(" " + f)) {
                    String antes = t.substring(0, t.length() - f.length() - 1).trim();
                    String ultimo = ultimaPalabra(antes);
                    // No comer un filler que sea parte del producto («pan con ya»).
                    if (!ultimo.isEmpty() && PREPOSICIONES.contains(ultimo)) break;
                    t = antes;
                    cambio = true;
                    break;
                }
            }
        }
        return t;
    }

    /**
     * «vende por favor dos panes» → «vende dos panes». El verbo es el primer
     * token; si los siguientes son «por favor», se quitan.
     */
    private static String quitarCortesiaTrasVerbo(String texto) {
        List<String> tokens = tokens(texto);
        if (tokens.size() < 2) return texto;

        int i = 1;
        while (i < tokens.size()) {
            if (i + 1 < tokens.size() && tokens.get(i).equals("por") && tokens.get(i + 1).equals("favor")) {
                tokens.remove(i + 1);
                tokens.remove(i);
                // No avanzar: puede haber otra cortesía seguida.
            } else {
                break;
            }
        }
        return String.join(" ", tokens).trim();
    }

    /** «vende vende dos panes» → «vende dos panes». */
    private static String colapsarTartamudeo(String texto) {
        List<String> tokens = tokens(texto);
        List<String> salida = new ArrayList<>();
        for (String token : tokens) {
            if (!salida.isEmpty() && salida.get(salida.size() - 1).equals(token)) continue;
            salida.add(token);
        }
        return String.join(" ", salida).trim();
    }

    private static List<String> tokens(String texto) {
        List<String> out = new ArrayList<>();
        if (texto == null) return out;
        for (String t : texto.trim().split("\\s+")) {
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    private static String ultimaPalabra(String texto) {
        List<String> tokens = tokens(texto);
        return tokens.isEmpty() ? "" : tokens.get(tokens.size() - 1);
    }
}
