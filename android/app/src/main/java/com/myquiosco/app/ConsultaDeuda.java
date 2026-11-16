package com.myquiosco.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * ConsultaDeuda — responde «cuánto debe Juan» con la app cerrada.
 *
 * Es el subconjunto nativo de `shared/voz/deudas.js`, sobre el resumen que la
 * app deja en `snapshot.json` (`deudas`). El servicio NO calcula saldos: solo
 * lee el JSON y habla. Puro: sin Android, sin estado, se prueba con JUnit.
 */
public final class ConsultaDeuda {

    /** Mismo umbral que el JS: un nombre mal oído no elige al cliente. */
    public static final double UMBRAL = 0.72;
    private static final double MARGEN = 0.05;
    private static final int MAXIMO_PARECIDOS = 3;

    private static final Set<String> RELLENO_INICIAL = new HashSet<>(Arrays.asList(
        "cuanto", "cuanta", "cuantos", "cuantas", "debe", "deben", "deuda", "deudas",
        "fiado", "fiados", "me", "le", "les", "se", "tiene", "tienen",
        "queda", "quedan", "saldo", "pendiente", "pendientes", "cual", "cuales",
        "que", "quien", "quienes", "es", "son", "el", "la", "los", "las",
        "de", "del", "al", "a", "total", "hay", "y", "mas"));

    private static final Set<String> RELLENO_FINAL = new HashSet<>(Arrays.asList(
        "por", "favor", "gracias", "hoy", "ahora", "ahorita", "total", "y", "mas"));

    private ConsultaDeuda() {
    }

    /**
     * ¿La frase pregunta por deudas? «debo» queda fuera: puede ser una compra
     * del negocio y una cifra inventada sería peor que el silencio.
     */
    public static boolean esConsulta(String frase) {
        String t = IntencionVenta.normalizarFrase(frase);
        if (t.isEmpty()) return false;
        if (contiene(t, "debo")) return false;
        return contiene(t, "debe") || contiene(t, "deben")
            || contiene(t, "deuda") || contiene(t, "deudas");
    }

    /**
     * Respuesta hablada, o `null` si la frase no pregunta por deudas.
     *
     * @param frase texto ya transcrito (se normaliza aquí).
     * @param deudas `snapshot.deudas`; si falta, se pide abrir la app.
     */
    public static String responder(String frase, JSONObject deudas) {
        String plano = IntencionVenta.normalizarFrase(frase);
        if (!esConsulta(plano)) return null;
        if (deudas == null) return "Abre la app para ver las deudas";

        JSONArray clientes = deudas.optJSONArray("clientes");
        int cantidad = deudas.optInt("cantidad", 0);
        String hint = extraerCliente(plano);

        if (hint.isEmpty()) {
            if (cantidad <= 0 || clientes == null || clientes.length() == 0) {
                return "No hay deudas pendientes";
            }
            JSONObject mayor = clientes.optJSONObject(0);
            if (mayor == null) return "No hay deudas pendientes";
            String resumenTotal = "En total me deben " + formatearMonto(deudas.optDouble("total", 0))
                + " pesos entre " + cantidad + (cantidad == 1 ? " cliente" : " clientes") + ".";
            String mayorTexto = "El que más debe es " + mayor.optString("nombre", "un cliente")
                + ", con " + formatearMonto(mayor.optDouble("saldo", 0)) + " pesos.";
            boolean pideMayor = contiene(plano, "quien") || contiene(plano, "mas");
            return pideMayor ? mayorTexto + " " + resumenTotal : resumenTotal + " " + mayorTexto;
        }

        List<JSONObject> parecidos = parecidos(hint, clientes);
        if (parecidos.isEmpty()) {
            return "No tengo deudas pendientes de " + hint;
        }

        JSONObject mejor = parecidos.get(0);
        boolean mismoNombreDePila = !hint.contains(" ") && contarNombreDePila(hint, clientes) >= 2;
        boolean ambiguo = mismoNombreDePila
            || (parecidos.size() > 1
                && similitud(hint, mejor.optString("nombre", ""))
                    - similitud(hint, parecidos.get(1).optString("nombre", "")) < MARGEN);
        if (ambiguo) {
            List<JSONObject> candidatos = mismoNombreDePila
                ? nombresDePila(hint, clientes)
                : parecidos;
            StringBuilder resp = new StringBuilder("Tengo ")
                .append(candidatos.size())
                .append(" clientes parecidos: ");
            for (int i = 0; i < candidatos.size(); i++) {
                if (i > 0) resp.append("; ");
                JSONObject c = candidatos.get(i);
                resp.append(c.optString("nombre", "un cliente"))
                    .append(" debe ")
                    .append(formatearMonto(c.optDouble("saldo", 0)))
                    .append(" pesos");
            }
            return resp.append(". Di el nombre completo").toString();
        }

        int cuentas = mejor.optInt("cuentas", 0);
        String base = mejor.optString("nombre", "un cliente") + " debe "
            + formatearMonto(mejor.optDouble("saldo", 0)) + " pesos";
        return cuentas > 1 ? base + " en " + cuentas + " deudas" : base;
    }

    /** Nombre dicho en la frase ("" = no se dijo: se responde el total). */
    public static String extraerCliente(String frase) {
        String plano = IntencionVenta.normalizarFrase(frase);
        if (plano.isEmpty()) return "";
        String[] tokens = plano.split(" ");
        int desde = 0;
        while (desde < tokens.length && RELLENO_INICIAL.contains(tokens[desde])) desde++;
        int hasta = tokens.length;
        while (hasta > desde && RELLENO_FINAL.contains(tokens[hasta - 1])) hasta--;
        if (desde >= hasta) return "";
        return String.join(" ", Arrays.copyOfRange(tokens, desde, hasta)).trim();
    }

    private static List<JSONObject> parecidos(String hint, JSONArray clientes) {
        List<JSONObject> lista = new ArrayList<>();
        if (clientes == null) return lista;
        for (int i = 0; i < clientes.length(); i++) {
            JSONObject c = clientes.optJSONObject(i);
            if (c == null) continue;
            if (similitud(hint, c.optString("nombre", "")) >= UMBRAL) lista.add(c);
        }
        lista.sort(Comparator.comparingDouble(
            (JSONObject c) -> -similitud(hint, c.optString("nombre", ""))));
        return lista.size() > MAXIMO_PARECIDOS ? lista.subList(0, MAXIMO_PARECIDOS) : lista;
    }

    /** Clientes cuyo nombre de pila empieza por lo dicho («juan» → «juanita»). */
    private static List<JSONObject> nombresDePila(String hint, JSONArray clientes) {
        List<JSONObject> lista = new ArrayList<>();
        if (clientes == null) return lista;
        for (int i = 0; i < clientes.length(); i++) {
            JSONObject c = clientes.optJSONObject(i);
            if (c == null) continue;
            String nombre = IntencionVenta.normalizarFrase(c.optString("nombre", ""));
            int fin = nombre.indexOf(' ');
            String primero = fin < 0 ? nombre : nombre.substring(0, fin);
            if (!primero.isEmpty() && primero.startsWith(hint)) lista.add(c);
        }
        return lista.size() > MAXIMO_PARECIDOS ? lista.subList(0, MAXIMO_PARECIDOS) : lista;
    }

    private static int contarNombreDePila(String hint, JSONArray clientes) {
        return nombresDePila(hint, clientes).size();
    }

    /**
     * Parecido entre dos nombres, de 0 a 1. Misma fórmula que
     * `shared/clientes.js` (tokens, edición y sufijo de desambiguación).
     */
    static double similitud(String a, String b) {
        String na = IntencionVenta.normalizarFrase(a);
        String nb = IntencionVenta.normalizarFrase(b);
        if (na.isEmpty() || nb.isEmpty()) return 0;
        if (na.equals(nb)) return 1;

        Set<String> ta = new HashSet<>(Arrays.asList(na.split(" ")));
        Set<String> tb = new HashSet<>(Arrays.asList(nb.split(" ")));
        int comunes = 0;
        for (String t : ta) if (tb.contains(t)) comunes++;
        double dice = (2.0 * comunes) / (ta.size() + tb.size());

        double lev = 1.0 - ((double) distancia(na, nb)) / Math.max(na.length(), nb.length());

        double prefijo = 0;
        String corto = na.length() <= nb.length() ? na : nb;
        String largo = na.length() <= nb.length() ? nb : na;
        if (largo.startsWith(corto)) {
            String sufijo = largo.substring(corto.length()).trim();
            prefijo = sufijo.length() <= 3 ? 0.9 : 0.6;
        }
        return Math.max(Math.max(dice, lev), prefijo);
    }

    private static int distancia(String a, String b) {
        if (a.equals(b)) return 0;
        int[] previa = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) previa[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            int[] actual = new int[b.length() + 1];
            actual[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                int costo = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                actual[j] = Math.min(Math.min(previa[j] + 1, actual[j - 1] + 1), previa[j - 1] + costo);
            }
            previa = actual;
        }
        return previa[b.length()];
    }

    /** "350" o "350,50": el TTS lee la coma como se habla. */
    public static String formatearMonto(double valor) {
        double n = Math.round(valor * 100) / 100.0;
        if (n == Math.rint(n)) return String.valueOf((long) n);
        return String.format(Locale.US, "%.2f", n).replace('.', ',');
    }

    private static boolean contiene(String frase, String palabra) {
        for (String token : frase.split(" ")) {
            if (palabra.equals(token)) return true;
        }
        return false;
    }
}
