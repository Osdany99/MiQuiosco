package com.miquiosco.app;

import android.app.AppOpsManager;
import android.content.Context;
import android.os.Process;

/**
 * Permisos "restringidos" de Android.
 *
 * Android trata como *sideloaded* a cualquier app que no venga de Google Play
 * y le bloquea los permisos sensibles detrás de un candado (Ajustes → Apps →
 * app → ⋮ → "Permitir ajustes restringidos"). Mientras el candado siga
 * puesto, el diálogo del sistema no concede nada aunque el AppOp esté en
 * allow, y el interruptor aparece gris en la pantalla de permisos.
 *
 * Esta app se distribuye por APK directo, así que ese es siempre el caso: hay
 * que habilitar el candado a mano ANTES de pedir el permiso. Vive aquí (y no
 * en cada plugin) porque lo necesitan tanto el de SMS como el de contactos.
 */
final class Restricciones {

    private Restricciones() {
    }

    static boolean estaRestringido(Context ctx) {
        try {
            AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
            if (ops == null) return false;
            int mode = ops.unsafeCheckOpNoThrow(
                "android:access_restricted_settings",
                Process.myUid(),
                ctx.getPackageName()
            );
            // Una app normal cae en MODE_DEFAULT; el candado se levanta cuando
            // el usuario activa "Permitir ajustes restringidos" y pasa a ALLOWED.
            return mode != AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }
}