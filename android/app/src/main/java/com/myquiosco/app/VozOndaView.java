package com.myquiosco.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

/**
 * VozOndaView — la onda del dock, dibujada de forma nativa.
 *
 * Réplica de `app/components/voice/VoiceWave.vue`: tres capas de senos que se
 * mueven con el nivel del micrófono (`VozOnda.nivel()`), con la paleta de cada
 * modo. Se dibuja solo mientras la ventana está visible, así que no consume
 * nada con la onda cerrada.
 */
public class VozOndaView extends View {

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

    private final Paint pincel = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path camino = new Path();
    private float amplitud = 0.05f;
    private long ultimoFrame = 0L;
    private float fase = 0f;

    public VozOndaView(Context contexto) {
        super(contexto);
        init();
    }

    public VozOndaView(Context contexto, AttributeSet attrs) {
        super(contexto, attrs);
        init();
    }

    private void init() {
        pincel.setStyle(Paint.Style.STROKE);
        pincel.setStrokeCap(Paint.Cap.ROUND);
        pincel.setStrokeJoin(Paint.Join.ROUND);
    }

    private int[] paleta() {
        String modo = VozOnda.modo();
        if (VozOnda.MODO_HABLANDO.equals(modo)) return PALETAS[1];
        if (VozOnda.MODO_PROCESANDO.equals(modo)) return PALETAS[2];
        return PALETAS[0];
    }

    /** Amplitud objetivo (0..1) según el modo, igual que la onda de la app. */
    private float objetivo(long t) {
        String modo = VozOnda.modo();
        float nivel = VozOnda.nivel();
        if (VozOnda.MODO_HABLANDO.equals(modo)) {
            return (float) (0.10 + nivel * 0.9 + (Math.sin(t / 130.0) + 1) * 0.04);
        }
        if (VozOnda.MODO_PROCESANDO.equals(modo)) {
            return (float) (0.14 + Math.sin(t / 380.0) * 0.04);
        }
        return (float) (0.06 + Math.sin(t / 700.0) * 0.015 + nivel * 0.95);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        long t = SystemClock.uptimeMillis();
        long dt = ultimoFrame == 0 ? 16 : Math.min(64, t - ultimoFrame);
        ultimoFrame = t;

        float meta = objetivo(t);
        float factor = meta > amplitud ? 0.35f : 0.10f;
        amplitud += (meta - amplitud) * factor;
        fase += (float) (dt * (0.0025 + amplitud * 0.004));

        int ancho = getWidth();
        int alto = getHeight();
        if (ancho <= 0 || alto <= 0) return;

        float medio = alto / 2f;
        float margen = Math.max(6f, alto * 0.12f);
        float recorrido = (alto / 2f) - margen;
        int[] colores = paleta();

        for (int i = 0; i < CAPAS.length; i++) {
            Capa capa = CAPAS[i];
            int color = colores[i];
            pincel.setColor(Color.argb(capa.opacidad, Color.red(color), Color.green(color), Color.blue(color)));
            pincel.setStrokeWidth(capa.grosor + (i == 2 ? amplitud * 2f : 0f));

            camino.reset();
            for (float x = 0; x <= ancho; x += 4f) {
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

        postInvalidateOnAnimation();
    }
}
