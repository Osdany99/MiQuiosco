package com.myquiosco.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

/**
 * WidgetVoz — la onda dentro del widget de la pantalla de inicio.
 *
 * Un widget no puede correr animaciones propias: `RemoteViews` solo infla
 * layouts y vistas del framework, así que ni `VozOndaView` ni un
 * `AnimationDrawable` arrancado por código funcionan ahí (se dibujan en el
 * proceso del launcher). Lo que sí se puede es cambiarle la imagen ~7 veces por
 * segundo, y eso es lo que hace este ticker: dibuja la misma onda del dock
 * (`OndaDibujo`) a un Bitmap y la empuja con `partiallyUpdateAppWidget`.
 *
 * Para no gastar nada cuando nadie dicta, el ticker no corre solo: el servicio
 * le avisa mientras hay un dictado en curso (la escucha de «oye nova» dura todo
 * el día y no tiene que animar nada) y un watchdog lo apaga si esos avisos
 * dejan de llegar. Cuando para, devuelve el micrófono estático.
 *
 * El frame se dibuja a media resolución y el `ImageView` lo escala: la mitad de
 * bytes por IPC y a esta escala la diferencia no se nota.
 */
final class WidgetVoz {

    /** ~7 fps: más rápido y varios launchers (One UI, MIUI) descartan updates. */
    private static final long MS_FRAME = 140L;
    /** Cuánto sigue la onda después del último aviso de progreso del servicio. */
    private static final long MS_SIN_PROGRESO = 2000L;
    /** Cada cuánto se re-chequea si hay widgets puestos cuando no hay ninguno. */
    private static final long MS_REVISION_WIDGETS = 30000L;
    /** Tenue: los textos de la tarjeta van encima. */
    private static final float ALPHA_ONDA = 0.42f;
    private static final float GROSOR_ONDA = 1.7f;
    private static final int DIVISOR_RESOLUCION = 2;
    private static final float RADIO_DP = 20f;
    private static final int ANCHO_DP_POR_DEFECTO = 140;
    private static final int ALTO_DP_POR_DEFECTO = 52;

    private static final Handler handler = new Handler(Looper.getMainLooper());

    private static boolean corriendo = false;
    /** El widget ya está limpio: evita repintarlo en cada silencio. */
    private static boolean enReposo = false;
    /** Última vez que el servicio avisó que había dictado (watchdog del ticker). */
    private static long ultimoSeguir = 0L;
    /** ¿Hay algún widget puesto? Si no, el ticker ni arranca (y se re-chequea cada tanto). */
    private static boolean hayWidgets = true;
    private static long ultimoChequeo = 0L;
    private static Context contexto = null;
    private static long ultimoFrame = 0L;
    private static float fase = 0f;
    private static float amplitud = 0.05f;

    /** Dos bitmaps se van turnando: el que se acaba de mandar no se puede seguir dibujando. */
    private static Bitmap bufferA;
    private static Bitmap bufferB;
    private static boolean turnoA = true;

    private WidgetVoz() { }

    private static final Runnable TICKER = new Runnable() {
        @Override
        public void run() {
            Context ctx = contexto;
            if (!corriendo || ctx == null) return;
            if (!pintar(ctx)) {
                detener(ctx);
                return;
            }
            handler.postDelayed(this, MS_FRAME);
        }
    };

    /**
     * Arranca (o mantiene) el ticker. Idempotente y barato: el servicio la llama
     * a 4 Hz mientras hay un dictado en curso, y eso es lo que mantiene vivo el
     * watchdog (`MS_SIN_PROGRESO`).
     */
    static void seguir(Context ctx) {
        if (ctx == null) return;
        ultimoSeguir = SystemClock.uptimeMillis();
        if (corriendo) return;
        if (!tieneWidgets(ctx)) return;
        contexto = ctx.getApplicationContext();
        corriendo = true;
        enReposo = false;
        ultimoFrame = 0L;
        handler.removeCallbacks(TICKER);
        handler.post(TICKER);
    }

    /**
     * Sin widgets puestos no hay nada que animar. Se comprueba de vez en cuando
     * (no en cada publicación del servicio), y `onUpdate` lo marca al agregarlo.
     */
    private static boolean tieneWidgets(Context ctx) {
        if (hayWidgets) return true;
        long ahora = SystemClock.uptimeMillis();
        if (ahora - ultimoChequeo < MS_REVISION_WIDGETS) return false;
        ultimoChequeo = ahora;
        hayWidgets = AppWidgetManager.getInstance(ctx)
            .getAppWidgetIds(componente(ctx)).length > 0;
        return hayWidgets;
    }

    /** Corta el ticker y devuelve el widget a reposo. */
    static void detener(Context ctx) {
        corriendo = false;
        handler.removeCallbacks(TICKER);
        Context app = contexto != null ? contexto : (ctx == null ? null : ctx.getApplicationContext());
        contexto = null;
        if (app != null) reposo(app, false);
    }

    /**
     * ¿Sigue habiendo dictado? Mientras se escucha, el servicio llama a
     * `seguir()` varias veces por segundo; si deja de llamarlo (o el estado se
     * quedó pegado) el watchdog apaga la onda. «Hablando» y «procesando» se
     * sostienen solos porque el micrófono está en pausa.
     */
    private static boolean hayActividad() {
        String modo = VozOnda.modo();
        if (VozOnda.MODO_HABLANDO.equals(modo) || VozOnda.MODO_PROCESANDO.equals(modo)) return true;
        return SystemClock.uptimeMillis() - ultimoSeguir <= MS_SIN_PROGRESO;
    }

    /** Widget en reposo: sin onda, micrófono estático y el subtítulo de siempre. */
    static void reposo(Context ctx, boolean forzar) {
        if (ctx == null) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(componente(ctx));
        if (ids.length == 0) {
            hayWidgets = false;
            ultimoChequeo = SystemClock.uptimeMillis();
            enReposo = true;
            return;
        }
        hayWidgets = true;
        // Sin cambios desde la última vez: no se reinfla el widget por nada.
        if (enReposo && !forzar) return;

        enReposo = true;
        ultimoFrame = 0L;
        fase = 0f;
        amplitud = 0.05f;

        RemoteViews vistas = VoiceWidgetProvider.vistas(ctx);
        vistas.setViewVisibility(R.id.widgetVozOnda, View.GONE);
        vistas.setTextViewText(R.id.widgetVozSubtitulo, ctx.getString(R.string.widget_voz_subtitulo));
        // Update completo: además de limpiar la onda, reinstala los toques.
        manager.updateAppWidget(ids, vistas);
    }

    /**
     * Dibuja un frame y lo empuja a todos los widgets.
     *
     * @return false cuando ya no hay nada que animar (o no hay widgets puestos)
     */
    private static boolean pintar(Context ctx) {
        if (!hayActividad()) return false;
        String modo = VozOnda.modo();

        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(componente(ctx));
        if (ids.length == 0) {
            hayWidgets = false;
            return false;
        }

        long ahora = SystemClock.uptimeMillis();
        long dt = ultimoFrame == 0L ? MS_FRAME : Math.min(400L, ahora - ultimoFrame);
        ultimoFrame = ahora;

        float meta = OndaDibujo.objetivo(modo, VozOnda.nivel(), ahora);
        amplitud += (meta - amplitud) * (meta > amplitud ? 0.35f : 0.10f);
        fase += (float) (dt * (0.0025 + amplitud * 0.004));

        CharSequence subtitulo = subtitulo(ctx, modo);
        int alpha = Math.round(OndaDibujo.ALPHA_COMPLETO * ALPHA_ONDA);
        float radio = dp(ctx, RADIO_DP) / DIVISOR_RESOLUCION;

        for (int id : ids) {
            Bundle opciones = manager.getAppWidgetOptions(id);
            int ancho = Math.max(1, px(ctx, opciones, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, ANCHO_DP_POR_DEFECTO) / DIVISOR_RESOLUCION);
            int alto = Math.max(1, px(ctx, opciones, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, ALTO_DP_POR_DEFECTO) / DIVISOR_RESOLUCION);

            Bitmap onda = lienzo(ancho, alto);
            Canvas canvas = new Canvas(onda);
            canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);
            OndaDibujo.pintar(canvas, onda.getWidth(), onda.getHeight(), amplitud, fase, modo, alpha, radio, GROSOR_ONDA);

            // Update parcial: no toca los toques ya instalados ni reinfla el layout.
            RemoteViews vistas = new RemoteViews(ctx.getPackageName(), R.layout.widget_voice);
            vistas.setViewVisibility(R.id.widgetVozOnda, View.VISIBLE);
            vistas.setImageViewBitmap(R.id.widgetVozOnda, onda);
            vistas.setTextViewText(R.id.widgetVozSubtitulo, subtitulo);
            manager.partiallyUpdateAppWidget(id, vistas);
        }
        return true;
    }

    private static CharSequence subtitulo(Context ctx, String modo) {
        if (VozOnda.MODO_HABLANDO.equals(modo)) return ctx.getString(R.string.widget_voz_hablando);
        if (VozOnda.MODO_PROCESANDO.equals(modo)) return ctx.getString(R.string.widget_voz_procesando);
        String texto = VozOnda.texto();
        if (texto != null && !texto.isEmpty()) return "«" + texto + "»";
        return ctx.getString(R.string.widget_voz_escuchando);
    }

    private static Bitmap lienzo(int ancho, int alto) {
        Bitmap actual = turnoA ? bufferA : bufferB;
        if (actual == null || actual.isRecycled() || actual.getWidth() != ancho || actual.getHeight() != alto) {
            actual = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888);
            if (turnoA) bufferA = actual;
            else bufferB = actual;
        }
        turnoA = !turnoA;
        return actual;
    }

    private static ComponentName componente(Context ctx) {
        return new ComponentName(ctx, VoiceWidgetProvider.class);
    }

    private static float dp(Context ctx, float valor) {
        return valor * ctx.getResources().getDisplayMetrics().density;
    }

    private static int px(Context ctx, Bundle opciones, String clave, int defectoDp) {
        int valorDp = opciones == null ? 0 : opciones.getInt(clave);
        if (valorDp <= 0) valorDp = defectoDp;
        return Math.max(1, Math.round(dp(ctx, valorDp)));
    }
}
