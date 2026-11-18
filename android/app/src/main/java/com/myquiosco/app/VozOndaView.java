package com.myquiosco.app;

import android.content.Context;
import android.graphics.Canvas;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

/**
 * VozOndaView — la onda del dock, dibujada de forma nativa.
 *
 * Solo lleva el estado de la animación (amplitud suavizada y fase); el dibujo
 * vive en `OndaDibujo`, que comparte con la onda del widget. Se pinta solo
 * mientras la ventana está visible, así que no consume nada con la onda
 * cerrada.
 */
public class VozOndaView extends View {

    private float amplitud = 0.05f;
    private long ultimoFrame = 0L;
    private float fase = 0f;

    public VozOndaView(Context contexto) {
        super(contexto);
    }

    public VozOndaView(Context contexto, AttributeSet attrs) {
        super(contexto, attrs);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        long t = SystemClock.uptimeMillis();
        long dt = ultimoFrame == 0 ? 16 : Math.min(64, t - ultimoFrame);
        ultimoFrame = t;

        String modo = VozOnda.modo();
        float meta = OndaDibujo.objetivo(modo, VozOnda.nivel(), t);
        float factor = meta > amplitud ? 0.35f : 0.10f;
        amplitud += (meta - amplitud) * factor;
        fase += (float) (dt * (0.0025 + amplitud * 0.004));

        OndaDibujo.pintar(canvas, getWidth(), getHeight(), amplitud, fase, modo,
            OndaDibujo.ALPHA_COMPLETO, 0f, 1f);

        postInvalidateOnAnimation();
    }
}
