package com.myquiosco.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * VozBootReceiver — vuelve a armar la escucha después de reiniciar el teléfono.
 *
 * Sin esto, apagar el teléfono de noche dejaba el servicio apagado hasta que el
 * jefe abriera la app. El servicio arranca en PAUSA y no abre el micrófono:
 * Android 14 no permite iniciar un servicio de micrófono desde segundo plano
 * (el arranque del sistema no es una excepción para el tipo `microphone`). Al
 * minimizar la app por primera vez, `useVozServicio` lo reanuda.
 *
 * La decisión del jefe está en `Preferences` de Capacitor, que en Android es el
 * SharedPreferences "CapacitorStorage" con la clave tal cual.
 */
public class VozBootReceiver extends BroadcastReceiver {

    private static final String PREF_GRUPO = "CapacitorStorage";
    private static final String PREF_ACTIVO = "voz.servicio.activo";
    private static final String PREF_MOTOR = "voz.motor";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String accion = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(accion)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(accion)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences(PREF_GRUPO, Context.MODE_PRIVATE);
        if (!"true".equals(prefs.getString(PREF_ACTIVO, "false"))) return;

        Intent servicio = new Intent(context, VozEscuchaService.class)
            .setAction(VozEscuchaService.ACTION_INICIAR)
            .putExtra(VozEscuchaService.EXTRA_PAUSADO, true)
            .putExtra(VozEscuchaService.EXTRA_MOTOR, motorDe(prefs));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(servicio);
            } else {
                context.startService(servicio);
            }
        } catch (Exception ignored) {
            // Si el sistema lo bloquea, la app lo rearma al abrirse.
        }
    }

    private static String motorDe(SharedPreferences prefs) {
        String motor = prefs.getString(PREF_MOTOR, "automatico");
        if ("vosk".equals(motor)) return "vosk";
        if ("google".equals(motor)) return "sistema";
        return "auto";
    }
}
