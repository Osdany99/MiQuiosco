package com.miquiosco.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.Telephony;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Puente JS <-> captura de SMS.
 *
 * Complementa a SmsReceiver (que escribe sin necesidad del WebView). Aquí el
 * frontend drena la cola y, si hace falta, barre el buzón del sistema.
 *
 * El barrido del buzón es la capa 3 del plan: cubre el caso en que el
 * BroadcastReceiver no llegó a dispararse (app force-stopped, o un fabricante
 * que bloquea la recepción en background). Se deduplica por hash igual que la
 * cola, así que repetir el barrido es idempotente.
 */
@CapacitorPlugin(name = "SmsReader")
public class SmsReaderPlugin extends Plugin {

    /** Cuántos mensajes trays del buzón en un barrido. */
    private static final int LIMITE_BARRIDO = 100;

    /**
     * Estado del subsistema de SMS: permisos, remitentes aceptados y tamaño de
     * la cola. La pantalla de diagnóstico lo pinta para poder ver de un vistazo
     * si algo está fallando antes de mirar un solo mensaje.
     */
    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        boolean leer = tienePermiso(Manifest.permission.READ_SMS);
        boolean recibir = tienePermiso(Manifest.permission.RECEIVE_SMS);
        r.put("permisoRecibir", recibir);
        r.put("permisoLeer", leer);

        JSArray remitentes = new JSArray();
        for (String s : SmsAlmacen.remitentes(getContext())) remitentes.put(s);
        r.put("remitentes", remitentes);
        r.put("pendientes", SmsAlmacen.peek(getContext()).length());

        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    /**
     * Devuelve la cola pendiente y la vacía. Es la vía normal: el frontend la
     * llama al abrir la app y en cada resume.
     */
    @PluginMethod
    public void leerPendientes(PluginCall call) {
        JSONArray cola = SmsAlmacen.drenar(getContext());
        JSArray mensajes = new JSArray();
        for (int i = 0; i < cola.length(); i++) {
            JSONObject o = cola.optJSONObject(i);
            if (o == null) continue;
            JSObject m = new JSObject();
            m.put("hash", o.optString("hash"));
            m.put("remitente", o.optString("remitente"));
            m.put("cuerpo", o.optString("cuerpo"));
            m.put("recibidoEn", o.optLong("recibidoEn"));
            mensajes.put(m);
        }
        JSObject r = new JSObject();
        r.put("mensajes", mensajes);
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    /** Mira la cola sin vaciarla. Para inspección. */
    @PluginMethod
    public void verPendientes(PluginCall call) {
        JSONArray cola = SmsAlmacen.peek(getContext());
        JSArray mensajes = new JSArray();
        for (int i = 0; i < cola.length(); i++) {
            JSONObject o = cola.optJSONObject(i);
            if (o == null) continue;
            JSObject m = new JSObject();
            m.put("hash", o.optString("hash"));
            m.put("remitente", o.optString("remitente"));
            m.put("cuerpo", o.optString("cuerpo"));
            m.put("recibidoEn", o.optLong("recibidoEn"));
            mensajes.put(m);
        }
        JSObject r = new JSObject();
        r.put("mensajes", mensajes);
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    @PluginMethod
    public void limpiar(PluginCall call) {
        SmsAlmacen.limpiar(getContext());
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    /**
     * Reconfigura los remitentes aceptados. Vaciar la lista desactiva el
     * filtrado por remitente (útil para diagnóstico: "muéstrame todo lo que
     * llega y vemos qué hay").
     */
    @PluginMethod
    public void setRemitentes(PluginCall call) {
        List<String> lista = new ArrayList<>();
        JSArray arr = call.getArray("remitentes");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                try {
                    Object v = arr.get(i);
                    if (v instanceof String && !((String) v).trim().isEmpty()) lista.add((String) v);
                } catch (JSONException ex) {
                    // Un elemento que no sea un string se ignora; no vale la
                    // pena tumbar la configuración entera por eso.
                }
            }
        }
        SmsAlmacen.setRemitentes(getContext(), lista);
        JSObject res = new JSObject();
        res.put("ok", true);
        call.resolve(res);
    }

    /**
     * Barrido del buzón (capa 3). Requiere READ_SMS; si falta, pide el
     * permiso y devuelve un código para que el JS lo encaje en su flujo.
     */
    @PluginMethod
    public void barrerBuzon(PluginCall call) {
        if (!tienePermiso(Manifest.permission.READ_SMS)) {
            // Alias = nombre del método. El callback onReadSms reentra aquí con
            // el permiso ya concedido y hace el barrido real.
            requestPermissionForAliases(new String[]{ "barrerBuzon" }, call, "onReadSms");
            return;
        }
        long desde = call.getLong("desde", 0L);
        JSONArray cola = barrer(getContext(), desde);
        JSArray mensajes = new JSArray();
        for (int i = 0; i < cola.length(); i++) {
            JSONObject o = cola.optJSONObject(i);
            if (o == null) continue;
            JSObject m = new JSObject();
            m.put("hash", o.optString("hash"));
            m.put("remitente", o.optString("remitente"));
            m.put("cuerpo", o.optString("cuerpo"));
            m.put("recibidoEn", o.optLong("recibidoEn"));
            m.put("origen", "buzon");
            mensajes.put(m);
        }
        JSObject r = new JSObject();
        r.put("mensajes", mensajes);
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    // El alias que se pide en barrerBuzon tiene que coincidir con el callback.
    @PermissionCallback
    private void onReadSms(PluginCall call) {
        JSObject res = new JSObject();
        res.put("ok", tienePermiso(Manifest.permission.READ_SMS));
        res.put("data", new JSObject());
        call.resolve(res);
    }

    /**
     * Lee el buzón filtrando por los remitentes aceptados y desde una marca de
     * tiempo. Se apoya en SmsAlmacen.encolar para el anti-duplicado, así que
     * este método es seguro de repetir.
     *
     * Ojo con la columna date: viene en MILISEGUNDOS.
     */
    private JSONArray barrer(Context ctx, long desde) {
        JSONArray fuera = new JSONArray();
        List<String> aceptados = SmsAlmacen.remitentes(ctx);
        // Si el usuario vació la lista no hay filtro: no tiene sentido barrer
        // todo el buzón, así que no hacemos nada y devolvemos vacío.
        if (aceptados.isEmpty()) return fuera;

        // selectionArgs en vez de interpolar: los remitentes vienen de una
        // lista editable por el usuario y no deben tocarse como SQL.
        List<String> condiciones = new ArrayList<>();
        List<String> args = new ArrayList<>();
        for (String a : aceptados) {
            String d = SmsAlmacen.soloDigitos(a);
            if (!d.isEmpty()) {
                condiciones.add("address LIKE ?");
                args.add("%" + d + "%");
            } else {
                condiciones.add("address = ?");
                args.add(a);
            }
        }
        String where = "(" + String.join(" OR ", condiciones) + ")";
        if (desde > 0) {
            where += " AND date >= ?";
            args.add(String.valueOf(desde));
        }

        ContentResolver cr = ctx.getContentResolver();
        // Overload de 5 argumentos: el de 6 pide CancellationSignal, no un
        // límite. El tope se aplica cortando el bucle.
        try (Cursor c = cr.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                new String[]{ "_id", "address", "date", "body" },
                where, args.toArray(new String[0]), "date DESC")) {
            if (c == null || !c.moveToFirst()) return fuera;
            int leidos = 0;
            do {
                if (leidos++ >= LIMITE_BARRIDO) break;
                String addr = c.getString(1);
                long date = c.getLong(2);
                String body = c.getString(3);
                if (addr == null || body == null) continue;
                // El LIKE de los dígitos puede traer remitentes que no son
                // exactamente el configurado; se revalida aquí.
                if (!SmsAlmacen.remitenteAceptado(addr, aceptados)) continue;

                SmsAlmacen.encolar(ctx, addr, body, date);
                JSONObject o = new JSONObject();
                o.put("remitente", addr);
                o.put("cuerpo", body);
                o.put("recibidoEn", date);
                fuera.put(o);
            } while (c.moveToNext());
        } catch (Exception ex) {
            // El proveedor puede lanzar SecurityException si la app fue
            // revocada entre la comprobación y la consulta; o denegar por la
            // vista restringida del Android 15. No es fatal: la capa 1 sigue.
        }
        return fuera;
    }

    private boolean tienePermiso(String permiso) {
        return ContextCompat.checkSelfPermission(getContext(), permiso) == PackageManager.PERMISSION_GRANTED;
    }
}