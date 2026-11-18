package com.myquiosco.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Ayuda en capas con la app cerrada.
 *
 * La ayuda no es una lista de trece comandos: es un menú. «ayuda» dice a
 * grandes rasgos qué sabe hacer y pregunta de qué se quiere el detalle; solo
 * entonces se explica un grupo. El catálogo llega en `dialogo.json:ayuda`,
 * inyectado por `scripts/copiar-voz.mjs` desde `shared/voz/ayuda.js`, así que
 * el APK y la app abierta no pueden divergir.
 *
 * Sin Android: se prueba con JUnit.
 */
public final class AyudaVoz {

    private AyudaVoz() {
    }

    /** Frases que abren la ayuda. Detrás puede venir el tema o nada. */
    private static final Pattern DISPARADOR = Pattern.compile(
        "^(?:ayuda|que puedes hacer|que sabes hacer|comandos|que comandos"
            + "|como te uso|como funciona|como se usa|para que sirves)\\b"
    );

    private static final Pattern CONECTOR = Pattern.compile(
        "^(?:de|del|sobre|para|con|el|la|los|las|lo|un|una)\\s+"
    );

    private static final Set<String> COMODINES = new HashSet<>(Arrays.asList(
        "todo", "todos", "todas", "mas", "siguiente", "otro", "otra", "voz", "hacer"
    ));

    private static final Set<String> CONECTORES = new HashSet<>(Arrays.asList(
        "de", "del", "sobre", "para", "con", "el", "la", "los", "las", "lo", "un", "una"
    ));

    /**
     * ¿La frase pide ayuda? Solo si detrás del disparador no viene nada o viene
     * un tema conocido: «ayuda a vender dos panes» es una venta, no una ayuda.
     */
    public static boolean pideAyuda(String texto, JSONObject ayuda) {
        String plano = IntencionVenta.normalizarFrase(texto);
        if (plano.isEmpty()) return false;
        Matcher disparador = DISPARADOR.matcher(plano);
        if (!disparador.find()) return false;
        String resto = CONECTOR.matcher(plano.substring(disparador.end()).trim()).replaceFirst("");
        if (resto.isEmpty()) return true;
        Set<String> permitidas = palabrasPermitidas(ayuda);
        for (String token : resto.split("\\s+")) {
            if (!permitidas.contains(token)) return false;
        }
        return true;
    }

    /**
     * Tema pedido: id de grupo, `todo`, `mas` o `null` (mostrar el menú).
     * Gana el grupo que más palabras comparte, para que «cambiar precio» sea
     * preparar y no consultar.
     */
    public static String tema(String texto, JSONObject ayuda) {
        String plano = IntencionVenta.normalizarFrase(texto);
        if (plano.isEmpty()) return null;
        if (plano.matches("^(?:como te uso|como funciona|como se usa|para que sirves)\\b.*")) {
            return "sistema";
        }

        String resto = plano;
        Matcher disparador = DISPARADOR.matcher(plano);
        if (disparador.find()) resto = plano.substring(disparador.end()).trim();
        resto = CONECTOR.matcher(resto).replaceFirst("");
        if (resto.isEmpty()) return null;

        String[] tokens = resto.split("\\s+");
        for (String token : tokens) {
            if ("todo".equals(token) || "todos".equals(token) || "todas".equals(token)) return "todo";
        }
        for (String token : tokens) {
            if ("mas".equals(token) || "siguiente".equals(token)
                || "otro".equals(token) || "otra".equals(token)) return "mas";
        }

        JSONArray grupos = ayuda == null ? null : ayuda.optJSONArray("grupos");
        if (grupos == null) return null;
        String mejor = null;
        int puntaje = 0;
        for (int i = 0; i < grupos.length(); i++) {
            JSONObject grupo = grupos.optJSONObject(i);
            if (grupo == null) continue;
            JSONArray palabras = grupo.optJSONArray("palabras");
            if (palabras == null) continue;
            int coinciden = 0;
            for (int j = 0; j < palabras.length(); j++) {
                String palabra = IntencionVenta.normalizarFrase(palabras.optString(j, ""));
                if (palabra.isEmpty()) continue;
                for (String token : tokens) {
                    if (palabra.equals(token)) coinciden++;
                }
            }
            if (coinciden > puntaje) {
                puntaje = coinciden;
                mejor = grupo.optString("id", null);
            }
        }
        return mejor;
    }

    /** Grupo por id, o `null` si el catálogo no lo trae. */
    public static JSONObject grupo(JSONObject ayuda, String id) {
        if (ayuda == null || id == null || id.isEmpty()) return null;
        JSONArray grupos = ayuda.optJSONArray("grupos");
        if (grupos == null) return null;
        for (int i = 0; i < grupos.length(); i++) {
            JSONObject grupo = grupos.optJSONObject(i);
            if (grupo != null && id.equals(grupo.optString("id", ""))) return grupo;
        }
        return null;
    }

    /**
     * ¿Ese grupo funciona en este contexto? «entradas» y «deudas» necesitan la
     * app abierta: no se explican para después contestar «abre la app».
     */
    public static boolean disponible(JSONObject ayuda, String contexto, String id) {
        JSONObject disponibles = ayuda == null ? null : ayuda.optJSONObject("disponibles");
        JSONArray ids = disponibles == null ? null : disponibles.optJSONArray(contexto);
        if (ids == null || id == null) return false;
        for (int i = 0; i < ids.length(); i++) {
            if (id.equals(ids.optString(i, ""))) return true;
        }
        return false;
    }

    /**
     * Grupo siguiente al último explicado, para «más». «Lo básico» no entra en
     * la rotación: se pide por su nombre, no se ofrece.
     */
    public static JSONObject siguiente(JSONObject ayuda, String actual) {
        JSONArray grupos = ayuda == null ? null : ayuda.optJSONArray("grupos");
        if (grupos == null || grupos.length() == 0) return null;
        int actualIndice = -1;
        for (int i = 0; i < grupos.length(); i++) {
            JSONObject grupo = grupos.optJSONObject(i);
            if (grupo != null && actual != null && actual.equals(grupo.optString("id", ""))) {
                actualIndice = i;
                break;
            }
        }
        int inicio = actualIndice < 0 ? 0 : actualIndice + 1;
        for (int paso = 0; paso < grupos.length(); paso++) {
            JSONObject grupo = grupos.optJSONObject((inicio + paso) % grupos.length());
            if (grupo != null && !"sistema".equals(grupo.optString("id", ""))) return grupo;
        }
        return null;
    }

    /** «De todo» con la app cerrada: un ejemplo por grupo disponible. */
    public static String todo(JSONObject ayuda) {
        JSONObject todo = ayuda == null ? null : ayuda.optJSONObject("todo");
        String texto = todo == null ? "" : todo.optString("cerrada", "").trim();
        return texto.isEmpty() ? null : texto;
    }

    /** Palabras que se aceptan como respuesta al menú. */
    private static Set<String> palabrasPermitidas(JSONObject ayuda) {
        Set<String> permitidas = new HashSet<>(CONECTORES);
        permitidas.addAll(COMODINES);
        JSONArray grupos = ayuda == null ? null : ayuda.optJSONArray("grupos");
        if (grupos == null) return permitidas;
        for (int i = 0; i < grupos.length(); i++) {
            JSONObject grupo = grupos.optJSONObject(i);
            JSONArray palabras = grupo == null ? null : grupo.optJSONArray("palabras");
            if (palabras == null) continue;
            for (int j = 0; j < palabras.length(); j++) {
                String palabra = IntencionVenta.normalizarFrase(palabras.optString(j, ""));
                if (!palabra.isEmpty()) permitidas.add(palabra);
            }
        }
        return permitidas;
    }
}
