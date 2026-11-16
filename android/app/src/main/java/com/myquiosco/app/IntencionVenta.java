package com.myquiosco.app;

import org.json.JSONObject;

import java.text.Normalizer;
import java.util.ArrayList;
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

        Intencion(Tipo tipo, String texto, String producto, int cantidad, String ubicacion, boolean varios) {
            this.tipo = tipo;
            this.texto = texto;
            this.producto = producto;
            this.cantidad = cantidad;
            this.ubicacion = ubicacion;
            this.varios = varios;
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
            return new Intencion(Tipo.SIN_PRODUCTO, plano, "", cantidad > 0 ? cantidad : 1, ubicacion, varios);
        }
        return new Intencion(Tipo.VENTA, plano, nombre, cantidad > 0 ? cantidad : 1, ubicacion, varios);
    }

    /** Número escrito en dígitos o en palabras ("2", "dos", "docena"). */
    public Integer enteroDe(String token) {
        if (token == null) return null;
        if (token.matches("\\d{1,4}")) {
            try { return Integer.parseInt(token); } catch (NumberFormatException e) { return null; }
        }
        return numeros.get(token);
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
