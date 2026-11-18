package com.myquiosco.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * VozDialogoActivity — la onda del dock, sobre el bloqueo, con la app cerrada.
 *
 * Se abre con un full-screen intent desde el servicio (Android no permite
 * lanzar actividades desde segundo plano de otra forma). Muestra el nivel del
 * micrófono y lo que se va entendiendo; se toca para cerrarla.
 *
 * Solo se usa si el jefe activó «Mostrar la onda al dictar» en Ajustes y el
 * sistema permite notificaciones a pantalla completa.
 */
public class VozDialogoActivity extends Activity implements VozOnda.Listener {

    private static final int MATCH = LinearLayout.LayoutParams.MATCH_PARENT;
    private static final int WRAP = LinearLayout.LayoutParams.WRAP_CONTENT;

    private static volatile VozDialogoActivity instancia = null;

    private TextView estado;
    private VozOndaView onda;

    /** Cierra la ventana si está abierta (la llama el servicio). */
    public static void cerrar() {
        VozDialogoActivity actual = instancia;
        if (actual == null) return;
        actual.runOnUiThread(() -> {
            if (!actual.isFinishing()) actual.finish();
        });
    }

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new ColorDrawable(0xF014191D));

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        int relleno = dp(24);
        raiz.setPadding(relleno, relleno, relleno, relleno);
        raiz.setOnClickListener(v -> finish());

        onda = new VozOndaView(this);
        raiz.addView(onda, new LinearLayout.LayoutParams(MATCH, dp(150)));

        estado = new TextView(this);
        estado.setTextColor(Color.WHITE);
        estado.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        estado.setGravity(Gravity.CENTER);
        estado.setMaxLines(4);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(MATCH, WRAP);
        params.topMargin = dp(16);
        raiz.addView(estado, params);

        setContentView(raiz);
        instancia = this;
        VozOnda.registrar(this);
        render();
    }

    @Override
    protected void onDestroy() {
        VozOnda.quitar(this);
        if (instancia == this) instancia = null;
        super.onDestroy();
    }

    @Override
    public void onCambio() {
        runOnUiThread(this::render);
    }

    private void render() {
        if (estado == null) return;
        String texto = VozOnda.texto();
        estado.setText(texto == null || texto.isEmpty() ? "Te escucho…" : texto);
        if (onda != null) onda.invalidate();
    }

    private int dp(int valor) {
        return Math.round(valor * getResources().getDisplayMetrics().density);
    }
}
