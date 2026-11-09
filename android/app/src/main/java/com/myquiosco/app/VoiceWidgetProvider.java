package com.myquiosco.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

public class VoiceWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_voice);

            Intent quiIntent = new Intent(context, MainActivity.class);
            quiIntent.setAction(Intent.ACTION_VIEW);
            quiIntent.setData(android.net.Uri.parse("miqiosco://voice/quiosco?voice=1"));
            quiIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent quiPending = PendingIntent.getActivity(context, 1, quiIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widgetVoiceQuiosco, quiPending);

            Intent almIntent = new Intent(context, MainActivity.class);
            almIntent.setAction(Intent.ACTION_VIEW);
            almIntent.setData(android.net.Uri.parse("miqiosco://voice/almacen?voice=1"));
            almIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent almPending = PendingIntent.getActivity(context, 2, almIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widgetVoiceAlmacen, almPending);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
