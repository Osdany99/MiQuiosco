package com.miquiosco.app;

import android.Manifest;
import android.app.AppOpsManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.provider.Telephony;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Puente JS &lt;-&gt; captura de SMS.
 *
 * Complementa a SmsReceiver (que escribe sin necesidad del WebView). Aquí el
 * frontend drena la cola y, si hace falta, barre el buzón del sistema.
 *
 * El barrido del buzón es la capa 3 del plan: cubre el caso en que el
 * BroadcastReceiver no llegó a dispararse (app force-stopped, o un fabricante
 * que bloquea la recepción en background). Se deduplica por hash igual que la
 * cola, así que repetir el barrido es idempotente.
 *
 * Nota sobre los permisos: Capacitor 8 ya NO trae plugin `Permissions`
 * (capacitor-android 8.4.1 solo empaqueta WebView, CapacitorHttp,
 * CapacitorCookies y SystemBars), así que.registerPlugin('Permissions') falla
 * en silencio y nunca llega al nativo. Los permisos se piden desde aquí, con
 * requestPermissionForAliases + un @PermissionCallback, que es la vía soportada.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS },
            alias = "sms"
        ),
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notificaciones"
        )
    }
)
public class SmsReaderPlugin extends Plugin {

    private static final String ALIAS_SMS = "sms";
    private static final String ALIAS_NOTIF = "notificaciones";

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
     * Pide RECEIVE_SMS y READ_SMS. Android los agrupa bajo un único diálogo
     * ("SMS"), así que se piden juntos con un solo alias.
     *
     * El @PermissionCallback responde con el estado real ya comprobado, para
     * que el JS distinga "concedido" de "el usuario dijo que no".
     */
    @PluginMethod
    public void pedirPermisos(PluginCall call) {
        if (tienePermiso(Manifest.permission.RECEIVE_SMS) && tienePermiso(Manifest.permission.READ_SMS)) {
            resolverPermisos(call);
            return;
        }
        requestPermissionForAliases(new String[]{ ALIAS_SMS }, call, "permisosResueltos");
    }

    @PermissionCallback
    private void permisosResueltos(PluginCall call) {
        resolverPermisos(call);
    }

    private void resolverPermisos(PluginCall call) {
        boolean recibir = tienePermiso(Manifest.permission.RECEIVE_SMS);
        boolean leer = tienePermiso(Manifest.permission.READ_SMS);
        JSObject r = new JSObject();
        r.put("permisoRecibir", recibir);
        r.put("permisoLeer", leer);
        r.put("concedidos", recibir || leer);
        JSObject res = new JSObject();
        res.put("ok", recibir || leer);
        res.put("data", r);
        call.resolve(res);
    }

    /**
     * Barrido del buzón (capa 3). Sin READ_SMS no puede ejecutarse, así que en
     * vez de abrir otro diálogo desde aquí devuelve permisoFalta y deja que el
     * JS lo pida con pedirPermisos(). Un solo camino para pedir permisos.
     */
    @PluginMethod
    public void barrerBuzon(PluginCall call) {
        if (!tienePermiso(Manifest.permission.READ_SMS)) {
            JSObject r = new JSObject();
            r.put("permisoFalta", true);
            JSObject res = new JSObject();
            res.put("ok", false);
            res.put("data", r);
            call.resolve(res);
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

    /**
     * Pide POST_NOTIFICATIONS para poder avisar cuando entra una recarga.
     *
     * Solo es runtime desde API 33. Por debajo el permiso se concede en la
     * instalacion, así que se responde granted sin abrir ningún diálogo (API 32
     * y anteriores ni siquiera tienen el permiso declarado).
     */
    @PluginMethod
    public void pedirPermisoNotificaciones(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject r = new JSObject();
            r.put("notificaciones", true);
            JSObject res = new JSObject();
            res.put("ok", true);
            res.put("data", r);
            call.resolve(res);
            return;
        }
        if (tienePermiso(Manifest.permission.POST_NOTIFICATIONS)) {
            resolverNotificaciones(call);
            return;
        }
        requestPermissionForAliases(new String[]{ ALIAS_NOTIF }, call, "notificacionesResueltas");
    }

    @PermissionCallback
    private void notificacionesResueltas(PluginCall call) {
        resolverNotificaciones(call);
    }

    private void resolverNotificaciones(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || tienePermiso(Manifest.permission.POST_NOTIFICATIONS);
        JSObject r = new JSObject();
        r.put("notificaciones", ok);
        JSObject res = new JSObject();
        res.put("ok", ok);
        res.put("data", r);
        call.resolve(res);
    }

    /**
     * ¿Siguen restringidos los permisos de esta app?
     *
     * Android considera "sideloaded" a cualquier app que no venga de Google
     * Play y le bloquea los permisos sensibles tras un candado (Ajustes → Apps →
     * app → ⋮ → "Permitir ajustes restringidos"). Mientras el candado siga
     * puesto, el permiso de SMS aparece gris en Ajustes y el diálogo del
     * sistema no concede nada, aunque el AppOp esté en allow.
     *
     * Por eso el onboarding tiene dos pasos reales y no uno: desbloquear
     * primero, pedir el permiso después.
     */
    @PluginMethod
    public void estaRestringido(PluginCall call) {
        JSObject r = new JSObject();
        r.put("restringido", estaRestringido());
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    private boolean estaRestringido() {
        try {
            AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return false;
            int mode = ops.unsafeCheckOpNoThrow(
                "android:access_restricted_settings",
                android.os.Process.myUid(),
                getContext().getPackageName()
            );
            // Una app normal cae en MODE_DEFAULT; el candado se levanta cuando
            // el usuario activa "Permitir ajustes restringidos" y pasa a ALLOWED.
            return mode != AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Abre Ajustes en la lista de "ajustes restringidos" de esta app.
     *
     * Contexto: Android marca como *restringidos* los permisos sensibles de apps
     * instaladas fuera de Google Play (sideload). Mientras la app se considere
     * sideloaded, el interruptor de SMS aparece bloqueado con el aviso "A la app
     * se le negó el acceso a SMS" y no se puede activar: hay que habilitar antes
     * "Permitir ajustes restringidos" en Ajustes → Apps → MiQuiosco → ⋮.
     *
     * Esta app se distribuye por APK directo, así que ese es siempre el caso y
     * el diálogo del sistema nunca concede el permiso por sí solo. Por eso el
     * paso tiene que ser explícito en el onboarding en vez de confiar en él.
     *
     * @param opcion "restringidos" (default) | "permisos"
     */
    @PluginMethod
    public void abrirAjustesPermisos(PluginCall call) {
        try {
            String opcion = call.getString("opcion", "restringidos");
            Intent intent = "permisos".equals(opcion)
                    ? new Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()))
                    : new Intent(
                        // El string literal a proposito: la constante pública es
                        // Settings.ACTION_MANAGE_APP_ALL_RESTRICTED_SETTINGS
                        // (API 30+), pero minSdk de la app es 24 y compilar
                        // contra ella no la resuelve. El valor es estable y
                        // está en AOSP desde Android 11.
                        "android.settings.RESTRICTED_SETTINGS",
                        Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception ex) {
            call.reject("No se pudieron abrir los ajustes: " + ex.getMessage(), ex);
        }
    }

    private boolean tienePermiso(String permiso) {
        return ContextCompat.checkSelfPermission(getContext(), permiso) == PackageManager.PERMISSION_GRANTED;
    }
}