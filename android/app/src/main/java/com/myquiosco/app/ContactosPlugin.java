package com.myquiosco.app;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.ContactsContract;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Lectura de contactos del dispositivo, para crear clientes rápido en vez de
 * teclearlos uno a uno.
 *
 * Devuelve nombre + TODOS los números de cada contacto (no solo el
 * principal): un cliente con dos números es el caso normal, porque el tope de
 * 360 CUP es por número. El JS normaliza y deduplica; aquí solo se lee.
 *
 * READ_CONTACTS es *dangerous* y, como la app es sideloaded, hay que haber
 * levantado antes el candado de "ajustes restringidos" (ver Restricciones).
 * Sin permiso el método devuelve vacíos en lugar de reventar: la pantalla de
 * clientes tiene que poder pintar igualmente.
 */
@CapacitorPlugin(
    name = "Contactos",
    permissions = {
        @Permission(
            strings = { Manifest.permission.READ_CONTACTS },
            alias = "contactos"
        )
    }
)
public class ContactosPlugin extends Plugin {

    private static final String ALIAS_CONTACTOS = "contactos";

    /** Tope de contactos devueltos: la lista completa de un teléfono real es larga. */
    private static final int LIMITE = 500;

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permiso", tienePermiso(Manifest.permission.READ_CONTACTS));
        r.put("restringido", Restricciones.estaRestringido(getContext()));
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        if (tienePermiso(Manifest.permission.READ_CONTACTS)) {
            resolver(call);
            return;
        }
        requestPermissionForAliases(new String[]{ ALIAS_CONTACTOS }, call, "permisoResuelto");
    }

    @PermissionCallback
    private void permisoResuelto(PluginCall call) {
        resolver(call);
    }

    private void resolver(PluginCall call) {
        boolean ok = tienePermiso(Manifest.permission.READ_CONTACTS);
        JSObject r = new JSObject();
        r.put("permiso", ok);
        JSObject res = new JSObject();
        res.put("ok", ok);
        res.put("data", r);
        call.resolve(res);
    }

    /**
     * Lista contactos como [{ id, nombre, telefonos: ["+535...", ...] }].
     * Un contacto sin número no se incluye: no sirve para crear un cliente.
     */
    @PluginMethod
    public void listar(PluginCall call) {
        JSArray lista = new JSArray();
        if (tienePermiso(Manifest.permission.READ_CONTACTS)) {
            try {
                leer(getContext(), lista);
            } catch (Exception ex) {
                // El proveedor puede lanzar SecurityException si se revocó el
                // permiso entre la comprobación y la consulta. Se devuelven los
                // contactos leídos hasta ese momento: mejor parcial que nada.
            }
        }
        JSObject r = new JSObject();
        r.put("contactos", lista);
        r.put("permiso", tienePermiso(Manifest.permission.READ_CONTACTS));
        JSObject res = new JSObject();
        res.put("ok", true);
        res.put("data", r);
        call.resolve(res);
    }

    private void leer(Context ctx, JSArray salida) throws Exception {
        // Un contacto puede tener varias filas (una por número), así que se
        // agrupa por id conservando el orden del proveedor.
        Map<String, String[]> porContacto = new LinkedHashMap<>();

        String[] columnas = {
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor c = ctx.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                columnas,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
            if (c == null) return;
            int leidos = 0;
            while (c.moveToNext() && leidos < LIMITE * 4) {
                leidos++;
                String id = c.getString(0);
                String nombre = c.getString(1);
                String numero = c.getString(2);
                if (id == null || numero == null) continue;

                String[] fila = porContacto.get(id);
                if (fila == null) {
                    porContacto.put(id, new String[]{ nombre == null ? "" : nombre, numero });
                } else {
                    porContacto.put(id, new String[]{ fila[0], fila[1] + "\n" + numero });
                }
            }
        }

        for (Map.Entry<String, String[]> e : porContacto.entrySet()) {
            if (salida.length() >= LIMITE) break;
            String nombre = e.getValue()[0].trim();
            String[] numeros = e.getValue()[1].split("\n");

            JSArray tels = new JSArray();
            for (String n : numeros) {
                String limpio = n.trim();
                if (!limpio.isEmpty()) tels.put(limpio);
            }
            if (tels.length() == 0) continue;

            JSObject c = new JSObject();
            c.put("id", e.getKey());
            c.put("nombre", nombre.isEmpty() ? "Sin nombre" : nombre);
            c.put("telefonos", tels);
            salida.put(c);
        }
    }

    private boolean tienePermiso(String permiso) {
        return ContextCompat.checkSelfPermission(getContext(), permiso) == PackageManager.PERMISSION_GRANTED;
    }
}