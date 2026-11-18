package com.myquiosco.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Widget de voz: un toque y se dicta una venta al almacén sin abrir la app.
 *
 * - Con la app cerrada arranca el servicio en modo directo (`EXTRA_DIRECTO`):
 *   no hay que decir «oye nova» y la ventana de la onda muestra lo que se va
 *   entendiendo y el «¿confirmo?».
 * - Con la app abierta el dictado lo lleva el dock, así que el toque abre la
 *   app en modo voz (no se abren dos micrófonos a la vez).
 *
 * El widget no puede animar sus vistas (RemoteViews): la animación vive en la
 * ventana de la onda, que es donde tiene sentido.
 */
public class VoiceWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_voice);
            PendingIntent pi = crearIntento(context);

            // Toda la tarjeta es el botón: un solo control, un solo toque.
            views.setOnClickPendingIntent(R.id.widgetVozRaiz, pi);
            views.setOnClickPendingIntent(R.id.widgetVozIcono, pi);
            views.setOnClickPendingIntent(R.id.widgetVozTextos, pi);
            views.setOnClickPendingIntent(R.id.widgetVozTitulo, pi);
            views.setOnClickPendingIntent(R.id.widgetVozSubtitulo, pi);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    private PendingIntent crearIntento(Context context) {
        if (MainActivity.visible) {
            // `t` (epoch ms) hace única cada actualización: con una URL fija
            // Android reutilizaba el PendingIntent y el segundo toque podía
            // entregar el mismo intent.
            Intent app = new Intent(context, MainActivity.class);
            app.setAction(Intent.ACTION_VIEW);
            app.setData(Uri.parse("miqiosco://voice/almacen?voice=1&t=" + System.currentTimeMillis()));
            app.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            return PendingIntent.getActivity(context, 1, app, flags());
        }

        Intent servicio = new Intent(context, VozEscuchaService.class);
        servicio.setAction(VozEscuchaService.ACTION_INICIAR);
        servicio.putExtra(VozEscuchaService.EXTRA_DIRECTO, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return PendingIntent.getForegroundService(context, 1, servicio, flags());
        }
        return PendingIntent.getService(context, 1, servicio, flags());
    }

    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }
}
