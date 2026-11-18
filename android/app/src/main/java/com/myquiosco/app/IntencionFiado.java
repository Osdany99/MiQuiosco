package com.myquiosco.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * IntencionFiado — lee «fía dos panes a Juan» con la app cerrada.
 *
 * Es el subconjunto nativo de `extraerFiadoSlots` (`shared/voz/gramatica.js`).
 * El producto, la cantidad y la ubicación se leen con `IntencionVenta` (una
 * sola gramática); aquí solo se separa el cliente.
 *
 * Puro: sin Android, sin estado, se prueba con JUnit.
 */
public final class IntencionFiado {

    public enum Tipo {
        /** No es un fiado: la frase sigue su camino normal. */
        NO_FIADO,
        /** «fía a Juan»: falta el producto. */
        SIN_PRODUCTO,
        /** «fía dos panes»: falta a quién. */
        SIN_CLIENTE,
        /** Completo: producto, cantidad y cliente. */
        FIADO
    }

    public static final class Intencion {
        public final Tipo tipo;
        public final String texto;
        public final String producto;
        public final int cantidad;
        /** "almacen" (por defecto) o "quiosco" si se dijo. */
        public final String ubicacion;
        public final String cliente;

        Intencion(Tipo tipo, String texto, String producto, int cantidad, String ubicacion, String cliente) {
            this.tipo = tipo;
            this.texto = texto;
            this.producto = producto;
            this.cantidad = cantidad;
            this.ubicacion = ubicacion;
            this.cliente = cliente;
        }
    }

    private static final Set<String> VERBOS_FIADO = new HashSet<>(Arrays.asList(
        "fia", "fiale", "fiar", "fias", "fian", "fiame", "fiamelo", "fiarle"));

    private static final Set<String> VERBOS_VENTA_FIADO = new HashSet<>(Arrays.asList(
        "vende", "vendeme", "anota", "anotame", "apunta", "apuntame", "registra", "saca", "despacha"));

    private final IntencionVenta lector;

    /** Listas efectivas: arrancan con las de `dialogo.json` y el snapshot las pisa. */
    private final Set<String> verbosFiado = new HashSet<>(VERBOS_FIADO);
    private final Set<String> verbosVentaFiado = new HashSet<>(VERBOS_VENTA_FIADO);
    /** Palabras que el panel retiró de venta: no deben armar un fiado. */
    private final Set<String> retiradasVenta = new HashSet<>();

    public IntencionFiado(IntencionVenta lector) {
        this.lector = lector == null ? IntencionVenta.porDefecto() : lector;
    }

    /**
     * Aplica el léxico administrable del snapshot: verbos de fiado, verbos de
     * venta que aceptan «fiado» y las palabras retiradas de venta.
     */
    public void aplicarLexico(JSONObject lexico) {
        if (lexico == null) return;

        Set<String> fiado = new HashSet<>();
        IntencionVenta.leerValores(fiado, lexico.optJSONArray("fiadoVerbo"));
        if (!fiado.isEmpty()) {
            verbosFiado.clear();
            verbosFiado.addAll(fiado);
        }

        Set<String> venta = new HashSet<>();
        IntencionVenta.leerValores(venta, lexico.optJSONArray("fiadoVentaVerbo"));
        if (!venta.isEmpty()) {
            verbosVentaFiado.clear();
            verbosVentaFiado.addAll(venta);
        }

        retiradasVenta.clear();
        JSONArray retiradas = lexico.optJSONArray("retiradas");
        if (retiradas == null) return;
        for (int i = 0; i < retiradas.length(); i++) {
            JSONObject r = retiradas.optJSONObject(i);
            if (r == null) continue;
            if (!r.optString("categoria", "").startsWith("venta_")) continue;
            String valor = IntencionVenta.normalizar(r.optString("valor", ""));
            if (!valor.isEmpty()) retiradasVenta.add(valor);
        }
    }

    /** ¿La frase manda fiar? («cuánto tengo fiado» no lo es). */
    public static boolean esFiado(String texto) {
        String plano = IntencionVenta.normalizarFrase(texto);
        if (plano.isEmpty()) return false;
        String[] tokens = plano.split(" ");
        if (VERBOS_FIADO.contains(tokens[0])) return true;
        boolean verboVenta = VERBOS_VENTA_FIADO.contains(tokens[0]);
        return verboVenta && Arrays.asList(tokens).contains("fiado");
    }

    public Intencion leer(String texto) {
        String plano = IntencionVenta.normalizarFrase(texto);
        if (!esFiadoConLexico(plano)) return new Intencion(Tipo.NO_FIADO, plano, "", 0, null, "");
        if (plano.isEmpty()) return new Intencion(Tipo.NO_FIADO, plano, "", 0, null, "");

        String[] tokens = plano.split(" ");
        int inicio = 0;
        if (verbosFiado.contains(tokens[0])) {
            inicio = 1;
        } else {
            while (inicio < tokens.length && !"fiado".equals(tokens[inicio])) inicio++;
            inicio++;
        }

        // El cliente va tras la última «a»/«para» con algo detrás.
        int corte = -1;
        for (int i = tokens.length - 1; i > inicio; i--) {
            if ("a".equals(tokens[i - 1]) || "para".equals(tokens[i - 1])) {
                corte = i - 1;
                break;
            }
        }

        String cliente = corte >= 0
            ? String.join(" ", Arrays.copyOfRange(tokens, corte + 1, tokens.length)).trim()
            : "";

        List<String> producto = new ArrayList<>();
        int fin = corte >= 0 ? corte : tokens.length;
        for (int i = inicio; i < fin; i++) producto.add(tokens[i]);

        if (producto.isEmpty()) {
            return new Intencion(Tipo.SIN_PRODUCTO, plano, "", 1, "almacen", cliente);
        }

        IntencionVenta.Intencion venta = lector.leer("vende " + String.join(" ", producto));
        String nombre = venta.tipo == IntencionVenta.Tipo.NO_VENTA ? "" : venta.producto;
        int cantidad = venta.cantidad > 0 ? venta.cantidad : 1;
        String ubicacion = "quiosco".equals(venta.ubicacion) ? "quiosco" : "almacen";

        if (nombre == null || nombre.trim().isEmpty()) {
            return new Intencion(Tipo.SIN_PRODUCTO, plano, "", cantidad, ubicacion, cliente);
        }
        if (cliente.isEmpty()) {
            return new Intencion(Tipo.SIN_CLIENTE, plano, nombre, cantidad, ubicacion, "");
        }
        return new Intencion(Tipo.FIADO, plano, nombre, cantidad, ubicacion, cliente);
    }

    /** ¿La frase manda fiar con el léxico efectivo (panel + valores base)? */
    private boolean esFiadoConLexico(String plano) {
        if (plano.isEmpty()) return false;
        String[] tokens = plano.split(" ");
        if (tokens.length == 0) return false;
        if (verbosFiado.contains(tokens[0])) return true;
        // Una palabra retirada de venta no debe armar un fiado por la puerta de
        // atrás («saca fiado 2 panes»).
        if (retiradasVenta.contains(tokens[0])) return false;
        boolean verboVenta = verbosVentaFiado.contains(tokens[0]);
        return verboVenta && Arrays.asList(tokens).contains("fiado");
    }

    public static String normalizar(String valor) {
        return IntencionVenta.normalizarFrase(valor).replace(" ", "");
    }
}
