package com.myquiosco.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * IntencionVenta — lee una venta dictada. Puro: sin Android, sin estado.
 *
 * Es el subconjunto nativo de la gramática de `shared/voz/gramatica.js`, el que
 * hace falta cuando la app está cerrada. Verbos, números en palabras, artículos
 * y ubicaciones vienen de `assets/voz/dialogo.json` (`shared/voz/dialogo.json`),
 * la misma fuente que usa el JS: así no se separan las reglas.
 *
 * Sólo entiende ventas directas simples ("vende dos panes del almacén"). Fiado,
 * cliente, precio dictado y demás se resuelven con la app abierta.
 */
public final class IntencionVenta {

    public enum Tipo {
        /** No es una venta (charla del mostrador): se ignora. */
        NO_VENTA,
        /** Trae verbo de venta pero no se le entendió el producto. */
        SIN_PRODUCTO,
        /** Venta clara: producto, cantidad y ubicación. */
        VENTA
    }

    public static final class Intencion {
        public final Tipo tipo;
        public final String texto;
        public final String producto;
        public final int cantidad;
        /** "almacen" (por defecto) o "quiosco" si se dijo. */
        public final String ubicacion;
        /** "dos panes y un refresco": se atiende de uno en uno. */
        public final boolean varios;
        /** "directa" | "casa" | "familiar" | "regalo" (precio distinto en la app). */
        public final String tipoVenta;

        Intencion(Tipo tipo, String texto, String producto, int cantidad, String ubicacion, boolean varios) {
            this(tipo, texto, producto, cantidad, ubicacion, varios, "directa");
        }

        Intencion(Tipo tipo, String texto, String producto, int cantidad, String ubicacion, boolean varios, String tipoVenta) {
            this.tipo = tipo;
            this.texto = texto;
            this.producto = producto;
            this.cantidad = cantidad;
            this.ubicacion = ubicacion;
            this.varios = varios;
            this.tipoVenta = tipoVenta == null ? "directa" : tipoVenta;
        }
    }

    private final Set<String> verbos = new HashSet<>();
    private final Map<String, Integer> numeros = new HashMap<>();
    private final Set<String> articulos = new HashSet<>();
    private final Map<String, String> ubicaciones = new HashMap<>();

    /** Valores por defecto, usados si el asset no está (build sin el script). */
    public static IntencionVenta porDefecto() {
        return new IntencionVenta(null);
    }

    public IntencionVenta(JSONObject datos) {
        JSONObject d = datos == null ? new JSONObject() : datos;

        leerLista(verbos, d, "verbosVenta",
            new String[]{ "vende", "vendeme", "vender", "venta", "registra", "anota", "saca", "despacha" });
        leerLista(articulos, d, "articulos",
            new String[]{ "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas" });

        JSONObject nums = d.optJSONObject("numeros");
        numeros.put("un", 1); numeros.put("uno", 1); numeros.put("una", 1);
        numeros.put("dos", 2); numeros.put("tres", 3); numeros.put("cuatro", 4);
        numeros.put("cinco", 5); numeros.put("seis", 6); numeros.put("siete", 7);
        numeros.put("ocho", 8); numeros.put("nueve", 9); numeros.put("diez", 10);
        numeros.put("once", 11); numeros.put("doce", 12); numeros.put("trece", 13);
        numeros.put("catorce", 14); numeros.put("quince", 15); numeros.put("dieciseis", 16);
        numeros.put("diecisiete", 17); numeros.put("dieciocho", 18); numeros.put("diecinueve", 19);
        numeros.put("veinte", 20);
        numeros.put("treinta", 30); numeros.put("cuarenta", 40); numeros.put("cincuenta", 50);
        numeros.put("sesenta", 60); numeros.put("setenta", 70); numeros.put("ochenta", 80);
        numeros.put("noventa", 90);
        numeros.put("doscientos", 200); numeros.put("doscientas", 200);
        numeros.put("trescientos", 300); numeros.put("trescientas", 300);
        numeros.put("cuatrocientos", 400); numeros.put("cuatrocientas", 400);
        numeros.put("quinientos", 500); numeros.put("quinientas", 500);
        numeros.put("seiscientos", 600); numeros.put("seiscientas", 600);
        numeros.put("setecientos", 700); numeros.put("setecientas", 700);
        numeros.put("ochocientos", 800); numeros.put("ochocientas", 800);
        numeros.put("novecientos", 900); numeros.put("novecientas", 900);
        numeros.put("mil", 1000);
        numeros.put("docena", 12);
        if (nums != null) {
            for (java.util.Iterator<String> it = nums.keys(); it.hasNext(); ) {
                String clave = it.next();
                numeros.put(normalizar(clave), nums.optInt(clave, 0));
            }
        }

        ubicaciones.put("almacen", "almacen");
        ubicaciones.put("deposito", "almacen");
        ubicaciones.put("quiosco", "quiosco");
        ubicaciones.put("kiosco", "quiosco");
        JSONObject ubi = d.optJSONObject("ubicaciones");
        if (ubi != null) {
            for (java.util.Iterator<String> it = ubi.keys(); it.hasNext(); ) {
                String clave = it.next();
                String valor = ubi.optString(clave, "almacen");
                ubicaciones.put(normalizar(clave), "quiosco".equals(valor) ? "quiosco" : "almacen");
            }
        }
    }

    private static void leerLista(Set<String> destino, JSONObject datos, String clave, String[] porDefecto) {
        org.json.JSONArray lista = datos.optJSONArray(clave);
        if (lista == null) {
            for (String v : porDefecto) destino.add(normalizar(v));
            return;
        }
        for (int i = 0; i < lista.length(); i++) {
            String valor = lista.optString(i, "");
            if (!valor.isEmpty()) destino.add(normalizar(valor));
        }
    }

    /**
     * Sustituye los verbos de venta por los del léxico administrable (llegan
     * dentro del snapshot). Una lista vacía conserva la de `dialogo.json`.
     */
    public void aplicarLexico(JSONObject lexico) {
        if (lexico == null) return;
        Set<String> nuevos = new HashSet<>();
        leerValores(nuevos, lexico.optJSONArray("ventaFuerte"));
        if (nuevos.isEmpty()) return;
        verbos.clear();
        verbos.addAll(nuevos);
    }

    /** Lee una lista de palabras del léxico ya normalizadas (sin espacios). */
    static void leerValores(Set<String> destino, JSONArray lista) {
        if (lista == null) return;
        for (int i = 0; i < lista.length(); i++) {
            String valor = lista.optString(i, "");
            if (!valor.isEmpty()) destino.add(normalizar(valor));
        }
    }

    /**
     * Lee la frase. Devuelve `NO_VENTA` si no hay verbo de venta: eso es lo que
     * evita anotar cualquier cosa que se diga cerca del teléfono.
     */
    public Intencion leer(String texto) {
        String plano = normalizarFrase(texto);
        if (plano.isEmpty()) {
            return new Intencion(Tipo.NO_VENTA, "", "", 0, null, false);
        }

        String[] tokens = plano.split(" ");
        int indiceVerbo = -1;
        for (int i = 0; i < tokens.length; i++) {
            if (verbos.contains(tokens[i])) { indiceVerbo = i; break; }
        }
        if (indiceVerbo < 0) {
            return new Intencion(Tipo.NO_VENTA, plano, "", 0, null, false);
        }

        int cantidad = 0;
        // Una venta dictada sale del almacén salvo que se diga el quiosco.
        String ubicacion = "almacen";
        boolean varios = false;
        // Tipo de venta: casa/familiar/regalo cambian el precio en la app.
        String tipoVenta = "directa";
        List<String> producto = new ArrayList<>();

        for (int i = indiceVerbo + 1; i < tokens.length; i++) {
            String token = tokens[i];
            if (token.isEmpty()) continue;

            Integer numero = enteroDe(token);
            if (numero != null && numero > 0) {
                // "una docena" vale 12: la palabra manda sobre el "una" previo.
                if ("docena".equals(token) || cantidad == 0) cantidad = numero;
                continue;
            }
            if ("y".equals(token) && !producto.isEmpty()) {
                varios = true;
                continue;
            }
            // «de regalo», «familiar», «para la casa»: se quitan del producto y
            // se conservan como tipo. La preposición que los acompaña sobra.
            if ("regalo".equals(token) || "familiar".equals(token) || "casa".equals(token)) {
                tipoVenta = token;
                for (int k = 0; k < 2 && !producto.isEmpty(); k++) {
                    String previo = producto.get(producto.size() - 1);
                    if ("de".equals(previo) || "para".equals(previo) || "como".equals(previo)
                        || "en".equals(previo) || "la".equals(previo)) {
                        producto.remove(producto.size() - 1);
                    } else {
                        break;
                    }
                }
                continue;
            }
            if ("normal".equals(token)) continue;
            String ubic = ubicaciones.get(token);
            if (ubic != null) {
                ubicacion = ubic;
                continue;
            }
            producto.add(token);
        }

        // Los artículos se quitan solo al principio y al final: "pan de leche"
        // conserva el "de", que es parte del nombre.
        while (!producto.isEmpty() && articulos.contains(producto.get(0))) {
            producto.remove(0);
        }
        while (!producto.isEmpty() && articulos.contains(producto.get(producto.size() - 1))) {
            producto.remove(producto.size() - 1);
        }
        String nombre = String.join(" ", producto).trim();
        if (nombre.isEmpty()) {
            return new Intencion(Tipo.SIN_PRODUCTO, plano, "", cantidad > 0 ? cantidad : 1, ubicacion, varios, tipoVenta);
        }
        return new Intencion(Tipo.VENTA, plano, nombre, cantidad > 0 ? cantidad : 1, ubicacion, varios, tipoVenta);
    }

    /** Número escrito en dígitos o en palabras ("2", "dos", "docena"). */
    public Integer enteroDe(String token) {
        if (token == null) return null;
        if (token.matches("\\d{1,4}")) {
            try { return Integer.parseInt(token); } catch (NumberFormatException e) { return null; }
        }
        return numeros.get(token);
    }

    /** Marcas que convierten una respuesta en corrección, no en un "no". */
    private static final Set<String> MARCAS_CORRECCION = new HashSet<>(Arrays.asList(
        "no", "eran", "era", "son", "cambia", "cambialo", "cambiar", "pon", "ponme", "mejor"));

    /**
     * Cantidad nueva si la frase corrige la anterior ("no, eran tres"), o -1.
     *
     * Se usa solo durante la confirmación: exige una marca de corrección y un
     * número distinto del actual. Así un "no" o un "sí" normales no cambian nada.
     */
    public int cantidadCorregida(String texto, int actual) {
        String plano = normalizarFrase(texto);
        if (plano.isEmpty()) return -1;
        String[] tokens = plano.split(" ");
        boolean marca = false;
        for (String t : tokens) {
            if (MARCAS_CORRECCION.contains(t)) {
                marca = true;
                break;
            }
        }
        if (!marca) return -1;

        // "una docena" vale 12: el artículo no puede ganarle a la docena.
        int idxDocena = Arrays.asList(tokens).indexOf("docena");
        if (idxDocena < 0) idxDocena = Arrays.asList(tokens).indexOf("docenas");
        if (idxDocena >= 0) {
            int factor = 1;
            for (int i = 0; i < idxDocena; i++) {
                String t = tokens[i];
                if ("un".equals(t) || "una".equals(t) || "uno".equals(t)) continue;
                Integer n = enteroDe(t);
                if (n != null && n > 0) {
                    factor = n;
                    break;
                }
            }
            int total = 12 * Math.max(1, factor);
            return total <= 9999 && total != actual ? total : -1;
        }

        for (String t : tokens) {
            Integer n = enteroDe(t);
            if (n != null && n > 0) {
                if (n == actual || n > 9999) return -1;
                return n;
            }
        }
        return -1;
    }

    // ── Utilidades ─────────────────────────────────────────────────────────

    public static String normalizarFrase(String valor) {
        String s = valor == null ? "" : valor.trim().toLowerCase(Locale.ROOT);
        String nfd = Normalizer.normalize(s, Normalizer.Form.NFD);
        return nfd.replaceAll("\\p{M}+", "")
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
    }

    static String normalizar(String valor) {
        return normalizarFrase(valor).replace(" ", "");
    }
}
