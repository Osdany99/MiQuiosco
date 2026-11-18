package com.myquiosco.app;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;

/**
 * OndaDibujo — la onda de voz, dibujada una sola vez para los dos sitios donde
 * se ve: la ventana del dictado (`VozOndaView`) y el widget de la pantalla de
 * inicio (`WidgetVoz`).
 *
 * Es la misma matemática de `app/components/voice/VoiceWave.vue`: tres capas de
 * senos cuya amplitud va atada al nivel del micrófono (`VozOnda.nivel()`), con
 * la paleta de cada modo.
 */
public final class OndaDibujo {

    /** Alpha con el que se pinta sin atenuar (la ventana del dictado). */
    public static final int ALPHA_COMPLETO = 255;

    private static final class Capa {
        final double frecuencia;
        final double velocidad;
        final double amplitud;
        final int grosor;
        final int opacidad;
        final double desfase;

        Capa(double frecuencia, double velocidad, double amplitud, int grosor, int opacidad, double desfase) {
            this.frecuencia = frecuencia;
            this.velocidad = velocidad;
            this.amplitud = amplitud;
            this.grosor = grosor;
            this.opacidad = opacidad;
            this.desfase = desfase;
        }
    }

    private static final Capa[] CAPAS = {
        new Capa(1.2, 0.8, 0.55, 3, 90, 0.0),
        new Capa(1.9, -1.1, 0.75, 3, 140, 1.7),
        new Capa(2.6, 1.5, 1.0, 4, 255, 3.1)
    };

    // Misma paleta que la onda de la app: [atrás, medio, frente] por modo.
    private static final int[][] PALETAS = {
        // escuchando: 56,189,248 · 16,185,129 · 52,211,153
        { Color.rgb(56, 189, 248), Color.rgb(16, 185, 129), Color.rgb(52, 211, 153) },
        // hablando: 167,139,250 · 99,102,241 · 129,140,248
        { Color.rgb(167, 139, 250), Color.rgb(99, 102, 241), Color.rgb(129, 140, 248) },
        // procesando: 148,163,184 · 100,116,139 · 203,213,225
        { Color.rgb(148, 163, 184), Color.rgb(100, 116, 139), Color.rgb(203, 213, 225) }
    };

    private OndaDibujo() { }

    /** Colores [atrás, medio, frente] del modo pedido. */
    public static int[] paleta(String modo) {
        if (VozOnda.MODO_HABLANDO.equals(modo)) return PALETAS[1];
        if (VozOnda.MODO_PROCESANDO.equals(modo)) return PALETAS[2];
        return PALETAS[0];
    }

    /** Amplitud objetivo (0..1) según el modo, igual que la onda de la app. */
    public static float objetivo(String modo, float nivel, long t) {
        if (VozOnda.MODO_HABLANDO.equals(modo)) {
            return (float) (0.10 + nivel * 0.9 + (Math.sin(t / 130.0) + 1) * 0.04);
        }
        if (VozOnda.MODO_PROCESANDO.equals(modo)) {
            return (float) (0.14 + Math.sin(t / 380.0) * 0.04);
        }
        return (float) (0.06 + Math.sin(t / 700.0) * 0.015 + nivel * 0.95);
    }

    /**
     * Pinta la onda centrada verticalmente en el lienzo.
     *
     * @param amplitud 0..1 ya suavizada por quien dibuja
     * @param fase     avance temporal (lo acumula quien dibuja, no este método)
     * @param alpha    0..255 global: el widget la usa baja para que el texto se lea encima
     * @param radio    esquinas a recortar en px (0 = sin recorte)
     * @param grosor   multiplicador de los trazos (1 = tamaño del dock)
     */
    public static void pintar(Canvas canvas, float ancho, float alto, float amplitud,
                              float fase, String modo, int alpha, float radio, float grosor) {
        if (canvas == null || ancho <= 0f || alto <= 0f) return;

        int[] colores = paleta(modo);
        Paint pincel = new Paint(Paint.ANTI_ALIAS_FLAG);
        pincel.setStyle(Paint.Style.STROKE);
        pincel.setStrokeCap(Paint.Cap.ROUND);
        pincel.setStrokeJoin(Paint.Join.ROUND);

        int guardado = canvas.save();
        if (radio > 0f) {
            // El widget tiene esquinas redondeadas: sin esto la onda se sale.
            Path marco = new Path();
            marco.addRoundRect(new RectF(0f, 0f, ancho, alto), radio, radio, Path.Direction.CW);
            canvas.clipPath(marco);
        }

        float medio = alto / 2f;
        float margen = Math.max(6f, alto * 0.12f);
        float recorrido = (alto / 2f) - margen;
        float paso = Math.max(2.5f, ancho / 120f);
        Path camino = new Path();

        for (int i = 0; i < CAPAS.length; i++) {
            Capa capa = CAPAS[i];
            int color = colores[i];
            int opacidad = Math.round(capa.opacidad * (alpha / (float) ALPHA_COMPLETO));
            pincel.setColor(Color.argb(Math.min(255, opacidad), Color.red(color), Color.green(color), Color.blue(color)));
            pincel.setStrokeWidth((capa.grosor + (i == CAPAS.length - 1 ? amplitud * 2f : 0f)) * grosor);

            camino.reset();
            for (float x = 0; x <= ancho; x += paso) {
                double normalizado = x / (double) ancho;
                // Se apaga en los bordes para que la onda no "corte" el marco.
                double envolvente = Math.sin(normalizado * Math.PI);
                double angulo = normalizado * Math.PI * 2 * capa.frecuencia
                    + fase * capa.velocidad * 60
                    + capa.desfase;
                float y = (float) (Math.sin(angulo) * amplitud * recorrido * envolvente * capa.amplitud);
                if (x == 0) camino.moveTo(x, medio + y);
                else camino.lineTo(x, medio + y);
            }
            canvas.drawPath(camino, pincel);
        }

        canvas.restoreToCount(guardado);
    }
}
