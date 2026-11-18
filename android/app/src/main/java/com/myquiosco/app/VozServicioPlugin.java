package com.myquiosco.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.SpeechRecognizer;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * VozServicio — controla el servicio en primer plano que escucha con la app
 * cerrada.
 *
 * API:
 *   VozServicio.estado()            -> { activo, pausado, anotados, motor, permiso, notificaciones, disponible, exentoBateria }
 *   VozServicio.iniciar({ wake, idioma, motor, pausado })
 *   VozServicio.pausar()            -> la app está abierta: el dock usa el micrófono
 *   VozServicio.reanudar()
 *   VozServicio.detener()
 *   VozServicio.pedirExencionBateria()  -> diálogo del sistema para no ser "optimizado"
 *
 * El servicio no interpreta ni escribe en la base: deja la transcripción en
 * `files/voz/inbox` y la app la convierte en acción pendiente al abrir.
 */
@CapacitorPlugin(
    name = "VozServicio",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "record"
        ),
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notificaciones"
        )
    }
)
public class VozServicioPlugin extends Plugin {

    private static final String ALIAS_RECORD = "record";
    private static final String ALIAS_NOTIFICACIONES = "notificaciones";

    private boolean tieneMicrofono() {
        return ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.RECORD_AUDIO)
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private boolean puedeNotificar() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return ContextCompat.checkSelfPermission(
            getContext(), "android.permission.POST_NOTIFICATIONS")
            == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private boolean exentoBateria() {
        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(
                android.content.Context.POWER_SERVICE);
            if (pm == null) return true;
            return pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        } catch (Exception e) {
            return true;
        }
    }

    /** Android 14+ puede negar la ventana a pantalla completa. */
    private boolean puedePantallaCompleta() {
        if (Build.VERSION.SDK_INT < 34) return true;
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager)
                getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            return nm == null || nm.canUseFullScreenIntent();
        } catch (Exception e) {
            return true;
        }
    }

    private JSObject estadoActual() {
        JSObject r = new JSObject();
        r.put("activo", VozEscuchaService.activo);
        r.put("pausado", VozEscuchaService.pausado);
        r.put("anotados", VozEscuchaService.anotados);
        r.put("motor", VozEscuchaService.motorActual);
        r.put("permiso", tieneMicrofono());
        r.put("notificaciones", puedeNotificar());
        r.put("disponible", SpeechRecognizer.isRecognitionAvailable(getContext())
            || VoskModelo.extraido(getContext()));
        // Separados: el panel quiere saber qué motor puede correr cada equipo.
        r.put("stt", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("vosk", VoskModelo.extraido(getContext()));
        r.put("exentoBateria", exentoBateria());
        // Onda del dock con la app cerrada.
        r.put("onda", VozOnda.activa(getContext()));
        r.put("pantallaCompleta", puedePantallaCompleta());
        r.put("sdk", Build.VERSION.SDK_INT);
        return r;
    }

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void iniciar(PluginCall call) {
        if (!tieneMicrofono()) {
            pedirPermisos(call);
            return;
        }
        // El permiso de notificaciones no bloquea la escucha, pero sin él no se
        // ve la notificación del servicio ni sus botones. En Android 13+ se
        // pide aquí, que es cuando el jefe activa el interruptor.
        if (!puedeNotificar()) {
            pedirPermisos(call);
            return;
        }
        arrancar(call);
    }

    private void pedirPermisos(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && !puedeNotificar()) {
            requestPermissionForAliases(
                new String[]{ ALIAS_RECORD, ALIAS_NOTIFICACIONES }, call, "permisoResuelto");
            return;
        }
        requestPermissionForAlias(ALIAS_RECORD, call, "permisoResuelto");
    }

    @PermissionCallback
    private void permisoResuelto(PluginCall call) {
        if (!tieneMicrofono()) {
            call.reject("permission_denied");
            return;
        }
        arrancar(call);
    }

    private void arrancar(PluginCall call) {
        Intent intent = new Intent(getContext(), VozEscuchaService.class)
            .setAction(VozEscuchaService.ACTION_INICIAR);
        String wake = call.getString("wake");
        if (wake != null) intent.putExtra(VozEscuchaService.EXTRA_WAKE, wake);
        String idioma = call.getString("idioma");
        if (idioma != null) intent.putExtra(VozEscuchaService.EXTRA_IDIOMA, idioma);
        String motor = call.getString("motor");
        if (motor != null) intent.putExtra(VozEscuchaService.EXTRA_MOTOR, motor);
        if (call.getBoolean("pausado", false)) {
            intent.putExtra(VozEscuchaService.EXTRA_PAUSADO, true);
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(getContext(), intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve(estadoActual());
        } catch (Exception e) {
            call.reject("No se pudo iniciar la escucha: " + e.getMessage(), e);
        }
    }

    /**
     * Aplica wake/idioma/motor con el servicio ya vivo (cambio de flota).
     * No arranca nada si está detenido: al arrancar leerá la configuración
     * guardada.
     */
    @PluginMethod
    public void configurar(PluginCall call) {
        if (!VozEscuchaService.activo) {
            call.resolve(estadoActual());
            return;
        }
        Intent intent = new Intent(getContext(), VozEscuchaService.class)
            .setAction(VozEscuchaService.ACTION_CONFIGURAR);
        String wake = call.getString("wake");
        if (wake != null) intent.putExtra(VozEscuchaService.EXTRA_WAKE, wake);
        String idioma = call.getString("idioma");
        if (idioma != null) intent.putExtra(VozEscuchaService.EXTRA_IDIOMA, idioma);
        String motor = call.getString("motor");
        if (motor != null) intent.putExtra(VozEscuchaService.EXTRA_MOTOR, motor);
        try {
            getContext().startService(intent);
            call.resolve(estadoActual());
        } catch (Exception e) {
            call.reject("No se pudo aplicar la configuración de voz: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void pausar(PluginCall call) {
        enviarAccion(VozEscuchaService.ACTION_PAUSAR);
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void reanudar(PluginCall call) {
        if (!VozEscuchaService.activo) {
            // Sin servicio vivo, reanudar equivale a arrancarlo.
            iniciar(call);
            return;
        }
        enviarAccion(VozEscuchaService.ACTION_REANUDAR);
        call.resolve(estadoActual());
    }

    @PluginMethod
    public void detener(PluginCall call) {
        enviarAccion(VozEscuchaService.ACTION_DETENER);
        call.resolve(estadoActual());
    }

    /**
     * Pide al sistema que no "optimice" (mate) la app. Sin esto, HyperOS y
     * similares apagan el servicio a los pocos minutos de apagar la pantalla.
     * El diálogo lo muestra el sistema; la decisión es del usuario.
     */
    @PluginMethod
    public void pedirExencionBateria(PluginCall call) {
        JSObject r = new JSObject();
        r.put("exento", exentoBateria());
        if (!exentoBateria()) {
            String pkg = getContext().getPackageName();
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + pkg));
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception e) {
                // Algunos fabricantes no exponen ese diálogo: se abre la lista
                // para que el jefe lo haga a mano.
                try {
                    Intent lista = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    lista.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(lista);
                } catch (Exception ignored) { }
            }
        }
        call.resolve(r);
    }

    /**
     * Abre los ajustes de «notificaciones a pantalla completa» (Android 14+).
     * Sin ese permiso la onda no puede aparecer sobre el bloqueo; es una
     * decisión del sistema, no de la app.
     */
    @PluginMethod
    public void pedirPantallaCompleta(PluginCall call) {
        Intent intent;
        try {
            intent = new Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            try {
                Intent lista = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                lista.setData(Uri.parse("package:" + getContext().getPackageName()));
                lista.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(lista);
            } catch (Exception ignored) { }
        }
        JSObject r = new JSObject();
        r.put("pantallaCompleta", puedePantallaCompleta());
        call.resolve(r);
    }

    /** Las acciones de control no necesitan volver a promover el servicio. */
    private void enviarAccion(String accion) {        try {
            Intent intent = new Intent(getContext(), VozEscuchaService.class).setAction(accion);
            if (VozEscuchaService.activo) {
                getContext().startService(intent);
            }
        } catch (Exception ignored) {
            // Servicio ya muerto: no hay nada que pausar ni detener.
        }
    }
}
