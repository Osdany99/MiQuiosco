package com.myquiosco.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * IntencionCobro — lee «cobra 200 a Yunior» con la app cerrada.
 *
 * Subconjunto nativo de `extraerCobroSlots` (shared/voz/gramatica.js) y del
 * reparto FIFO de `distribuirCobro` (shared/voz/deudas.js). Puro: sin Android,
 * sin estado, se prueba con JUnit.
 */
public final class IntencionCobro {

    public enum Tipo {
        NO_COBRO,
        /** «cobra 200 a»: falta el cliente. */
        SIN_CLIENTE,
        COBRO
    }

    public static final class Intencion {
        public final Tipo tipo;
        public final String cliente;
        /** 0 cuando es «todo»: el importe lo decide el saldo del cliente. */
        public final double monto;
        public final boolean todo;
        public final String formaPago;

        Intencion(Tipo tipo, String cliente, double monto, boolean todo, String formaPago) {
            this.tipo = tipo;
            this.cliente = cliente;
            this.monto = monto;
            this.todo = todo;
            this.formaPago = formaPago;
        }
    }

    public static final class Pago {
        public final String cuentaId;
        public final double monto;

        public Pago(String cuentaId, double monto) {
            this.cuentaId = cuentaId;
            this.monto = monto;
        }
    }

    private static final Set<String> VERBOS = new HashSet<>(Arrays.asList(
        "cobra", "cobrame", "cobrale", "cobrar", "cobre", "cobren",
        "abona", "aboname", "abonale", "abonar", "abono",
        "paga", "pagame", "pagale", "pagar", "pago", "pague", "pagaron"));

    private static final Set<String> VERBOS_EN_MEDIO = new HashSet<>(Arrays.asList(
        "pago", "pague", "pagaron", "abono"));

    private static final Set<String> RELLENO_CLIENTE = new HashSet<>(Arrays.asList(
        "de", "del", "la", "el", "los", "las", "deuda", "deudas", "fiado", "me", "nos"));

    private IntencionCobro() {
    }

    /** ¿La frase manda cobrar? «cobra 2 panes» no: eso es una venta. */
    public static boolean esCobro(String texto) {
        return leer(texto, null).tipo == Tipo.COBRO;
    }

    public static Intencion leer(String texto) {
        return leer(texto, null);
    }

    /**
     * @param lector lector de ventas para los números en palabras («doscientos»).
     *               Puede ser null: entonces solo se entienden dígitos.
     */
    public static Intencion leer(String texto, IntencionVenta lector) {
        String plano = IntencionVenta.normalizarFrase(texto);
        if (plano.isEmpty()) return new Intencion(Tipo.NO_COBRO, "", 0, true, "efectivo");
        String[] tokens = plano.split(" ");
        String formaPago = Arrays.asList(tokens).contains("transferencia") ? "transferencia" : "efectivo";

        // «cuánto pagó Juan» es una consulta, no un cobro.
        if ("cuanto".equals(tokens[0]) || "cuanta".equals(tokens[0])
            || "cuantos".equals(tokens[0]) || "cuantas".equals(tokens[0])) {
            return new Intencion(Tipo.NO_COBRO, "", 0, true, formaPago);
        }

        String verbo = tokens[0];
        int inicioCliente;
        int inicioMonto;
        String[] clienteTokens;

        if (!VERBOS.contains(verbo)) {
            int idx = -1;
            for (int i = 0; i < tokens.length; i++) {
                if (VERBOS_EN_MEDIO.contains(tokens[i])) { idx = i; break; }
            }
            if (idx <= 0) return new Intencion(Tipo.NO_COBRO, "", 0, true, formaPago);
            // «juan me pago 200»
            List<String> cliente = new ArrayList<>();
            for (int i = 0; i < idx; i++) {
                if (!"me".equals(tokens[i]) && !"nos".equals(tokens[i])) cliente.add(tokens[i]);
            }
            String nombre = String.join(" ", cliente).trim();
            return construir(nombre, Arrays.copyOfRange(tokens, idx + 1, tokens.length), formaPago, lector);
        }

        // Verbo inicial: hay que distinguir venta de cobro.
        boolean mencionaDeuda = Arrays.asList(tokens).contains("deuda")
            || Arrays.asList(tokens).contains("deudas")
            || Arrays.asList(tokens).contains("fiado");
        int idxCliente = -1;
        for (int i = 1; i < tokens.length; i++) {
            if ("a".equals(tokens[i]) || "para".equals(tokens[i])) { idxCliente = i; break; }
        }

        if (!mencionaDeuda && idxCliente < 0) return new Intencion(Tipo.NO_COBRO, "", 0, true, formaPago);

        if (idxCliente < 0) {
            // «cobra la deuda de juan»: el cliente va tras «de».
            for (int i = 1; i < tokens.length; i++) {
                if ("de".equals(tokens[i])) { idxCliente = i; break; }
            }
            if (idxCliente < 0) return new Intencion(Tipo.SIN_CLIENTE, "", 0, true, formaPago);
        }

        inicioCliente = idxCliente + 1;
        inicioMonto = 1;

        // «cobra 2 panes a Juan» es venta: hay producto después del número.
        if (!mencionaDeuda) {
            boolean conProducto = false;
            for (int i = inicioMonto; i < idxCliente; i++) {
                if (numero(tokens[i], lector) == null && !esMoneda(tokens[i])
                    && !"todo".equals(tokens[i]) && !"toda".equals(tokens[i])) {
                    conProducto = true;
                    break;
                }
            }
            boolean conImporte = false;
            for (int i = inicioMonto; i < idxCliente; i++) {
                if (numero(tokens[i], lector) != null || "todo".equals(tokens[i]) || "toda".equals(tokens[i])) {
                    conImporte = true;
                    break;
                }
            }
            if (!conImporte || conProducto) return new Intencion(Tipo.NO_COBRO, "", 0, true, formaPago);
        }

        clienteTokens = Arrays.copyOfRange(tokens, inicioCliente, tokens.length);
        String[] montoTokens = Arrays.copyOfRange(tokens, inicioMonto, idxCliente);
        return construir(String.join(" ", clienteTokens), montoTokens, formaPago, lector);
    }

    private static Intencion construir(String clienteBruto, String[] montoTokens, String formaPago, IntencionVenta lector) {
        List<String> cliente = new ArrayList<>();
        boolean cortado = false;
        for (String t : clienteBruto.isEmpty() ? new String[0] : clienteBruto.split(" ")) {
            // El método de pago no es parte del nombre.
            if ("por".equals(t) || "con".equals(t) || "transferencia".equals(t) || "efectivo".equals(t)) {
                cortado = true;
            }
            if (cortado) continue;
            if (!RELLENO_CLIENTE.contains(t) || "de".equals(t)) cliente.add(t);
        }
        String nombre = String.join(" ", cliente).trim();
        if (nombre.isEmpty()) return new Intencion(Tipo.SIN_CLIENTE, "", 0, true, formaPago);

        boolean todo = true;
        double monto = 0;
        for (String t : montoTokens) {
            if ("todo".equals(t) || "toda".equals(t)) { todo = true; monto = 0; break; }
            if (esMoneda(t)) continue;
            Double n = numero(t, lector);
            if (n != null && n > 0) { monto = n; todo = false; }
        }
        return new Intencion(Tipo.COBRO, nombre, monto, todo, formaPago);
    }

    private static boolean esMoneda(String t) {
        return "pesos".equals(t) || "peso".equals(t);
    }

    private static Double numero(String token, IntencionVenta lector) {
        if (token == null) return null;
        if (token.matches("\\d{1,7}")) {
            try { return Double.valueOf(token); } catch (NumberFormatException e) { return null; }
        }
        if (lector != null) {
            Integer n = lector.enteroDe(token);
            return n == null ? null : n.doubleValue();
        }
        return null;
    }

    /** Saldo pendiente de un cliente del snapshot (array `deudas`). */
    public static double saldo(JSONArray deudas) {
        if (deudas == null) return 0;
        double total = 0;
        for (int i = 0; i < deudas.length(); i++) {
            JSONObject d = deudas.optJSONObject(i);
            if (d != null) total += d.optDouble("saldo", 0);
        }
        return Math.round(total * 100) / 100.0;
    }

    /**
     * Reparte el cobro FIFO (la deuda más antigua primero) y devuelve un pago
     * por cuenta. Si el importe excede el saldo, `sobrante` lo dirá.
     */
    public static List<Pago> repartir(JSONArray deudas, double monto) {
        List<JSONObject> orden = new ArrayList<>();
        if (deudas != null) {
            for (int i = 0; i < deudas.length(); i++) {
                JSONObject d = deudas.optJSONObject(i);
                if (d != null) orden.add(d);
            }
        }
        orden.sort((a, b) -> Long.compare(a.optLong("creadoEn", 0), b.optLong("creadoEn", 0)));

        double restante = Math.round(Math.max(0, monto) * 100) / 100.0;
        List<Pago> pagos = new ArrayList<>();
        for (JSONObject d : orden) {
            if (restante <= 0) break;
            double saldo = Math.round(d.optDouble("saldo", 0) * 100) / 100.0;
            if (saldo <= 0) continue;
            double aplicar = Math.min(saldo, restante);
            if (aplicar <= 0) continue;
            pagos.add(new Pago(d.optString("id", ""), Math.round(aplicar * 100) / 100.0));
            restante = Math.round((restante - aplicar) * 100) / 100.0;
        }
        return pagos;
    }

    /** Lo que sobra de un importe tras repartirlo (0 si cuadra). */
    public static double sobrante(JSONArray deudas, double monto) {
        double aplicado = 0;
        for (Pago p : repartir(deudas, monto)) aplicado += p.monto;
        return Math.round((Math.max(0, monto) - aplicado) * 100) / 100.0;
    }
}
