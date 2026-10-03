package com.miquiosco.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Cola persistente de SMS entrantes.
 *
 * Existe para decoupling: el BroadcastReceiver escribe aquí de forma síncrona
 * (tiene ~10s para terminar) y el JS la drena cuando puede. Así el WebView no
 * tiene que estar vivo para no perder un SMS — si el proceso muere justo después
 * de llegar el mensaje, el dato sigue en SharedPreferences.
 *
 * Se usa SharedPreferences y no SQLite a propósito: el volumen es de unos
 * pocos mensajes al día y la escritura tiene que ser inmediata y sin await.
 */
public final class SmsAlmacen {

    private static final String PREFS = "sms_etecsa";
    private static final String K_COLA = "cola";
    private static final String K_REMITENTES = "remitentes";

    /** Tope de la cola. Es una cola de diagnóstico, no un archivo. */
    private static final int MAX = 200;

    /**
     * Remitentes aceptados por defecto. Verificado contra el buzón real del
     * dispositivo: `PAGOxMOVIL` es un alphanumeric sender ID (Banco
     * Metropolitano) y `+5353138610` es Monedero Mi Transfer.
     *
     * Se guardan ya normalizados (mayúsculas) porque se comparan así.
     */
    private static final String[] POR_DEFECTO = { "PAGOXMOVIL", "+5353138610" };

    private SmsAlmacen() {
    }

    // ---------------------------------------------------------------- remitentes

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Normaliza un remitente para comparar: recorta y pasa a mayúsculas. */
    static String norm(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }

    static String soloDigitos(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '0' && c <= '9') sb.append(c);
        }
        return sb.toString();
    }

    /**
     * Compara por igualdad tras normalizar, y además compara solo los dígitos
     * cuando ambos lados son numéricos. Necesario porque el mismo remitente
     * numérico puede llegar con o sin '+'.
     */
    static boolean remitenteAceptado(String remitente, List<String> aceptados) {
        String n = norm(remitente);
        String digitos = soloDigitos(n);
        for (String a : aceptados) {
            if (a.equalsIgnoreCase(n)) return true;
            String dAceptado = soloDigitos(a);
            if (!digitos.isEmpty() && !dAceptado.isEmpty() && digitos.equals(dAceptado)) return true;
        }
        return false;
    }

    public static List<String> remitentes(Context ctx) {
        Set<String> guardados = prefs(ctx).getStringSet(K_REMITENTES, null);
        List<String> out = new ArrayList<>();
        if (guardados != null && !guardados.isEmpty()) {
            for (String s : guardados) out.add(norm(s));
        } else {
            for (String s : POR_DEFECTO) out.add(norm(s));
        }
        return out;
    }

    public static void setRemitentes(Context ctx, List<String> remitentes) {
        ArrayList<String> norm = new ArrayList<>();
        for (String r : remitentes) {
            String n = norm(r);
            if (!n.isEmpty()) norm.add(n);
        }
        prefs(ctx).edit().putStringSet(K_REMITENTES, new HashSet<>(norm)).apply();
    }

    // ---------------------------------------------------------------- cola

    public static void encolar(Context ctx, String remitente, String cuerpo, long recibidoEn) {
        SharedPreferences p = prefs(ctx);
        JSONArray cola = leerCola(p);
        String hash = hash(remitente, cuerpo, recibidoEn);

        // Anti-duplicado: el mismo SMS puede volver a emitirse (reintento del
        // sistema, o varias ranuras SIM). Comparamos contra lo que ya está en cola.
        for (int i = 0; i < cola.length(); i++) {
            JSONObject o = cola.optJSONObject(i);
            if (o != null && hash.equals(o.optString("hash"))) return;
        }

        JSONObject item = new JSONObject();
        try {
            item.put("hash", hash);
            item.put("remitente", remitente);
            item.put("cuerpo", cuerpo);
            item.put("recibidoEn", recibidoEn);
            item.put("encoladoEn", System.currentTimeMillis());
            cola.put(item);
        } catch (Exception e) {
            return; // mejor perder el item que romper la recepción
        }

        while (cola.length() > MAX) cola.remove(0);
        p.edit().putString(K_COLA, cola.toString()).apply();
    }

    /** Vacía y devuelve la cola. */
    public static JSONArray drenar(Context ctx) {
        SharedPreferences p = prefs(ctx);
        JSONArray cola = leerCola(p);
        if (cola.length() > 0) p.edit().remove(K_COLA).apply();
        return cola;
    }

    public static JSONArray peek(Context ctx) {
        return leerCola(prefs(ctx));
    }

    public static void limpiar(Context ctx) {
        prefs(ctx).edit().remove(K_COLA).apply();
    }

    private static JSONArray leerCola(SharedPreferences p) {
        String raw = p.getString(K_COLA, null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /**
     * Hash de remitente + cuerpo + minuto de recepción.
     *
     * El bucket de un minuto evita que dos SMS legítimamente idénticos (mismo
     * texto, del mismo emisor, en minutos distintos) se pisen, pero sí colapsa
     * la re-emisión del mismo mensaje.
     */
    private static String hash(String remitente, String cuerpo, long recibidoEn) {
        String base = norm(remitente) + "|" + cuerpo + "|" + (recibidoEn / 60000L);
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest(base.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(base.hashCode());
        }
    }
}