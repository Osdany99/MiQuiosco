package com.myquiosco.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * ¿La app está en primer plano? El widget lo consulta para no abrir una
     * segunda escucha: si la app está visible, el dictado lo lleva el dock.
     */
    public static volatile boolean visible = false;

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        visible = hasFocus;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Watchdog del bundle web ANTES de que Capacitor cargue el WebView: si
        // una actualización OTA no arrancó en los últimos intentos, se vuelve
        // al bundle de la APK (el pref se lee en `Bridge.load()`).
        WebBundle.arrancar(getApplicationContext());
        // Plugins propios de la app (instalador de APK, lector de SMS, contactos,
        // copia de seguridad de la base). `cap sync` no toca el módulo app, así
        // que el registro sobrevive a los syncs. SmsReceiver no se registra
        // aquí: va declarado en el manifest para que el sistema lo despierte
        // sin depender del proceso.
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(SmsReaderPlugin.class);
        registerPlugin(ContactosPlugin.class);
        registerPlugin(DbBackupPlugin.class);
        registerPlugin(VoiceRecognitionNativePlugin.class);
        registerPlugin(TtsNativePlugin.class);
        // Servicio en primer plano para dictar con la app cerrada.
        registerPlugin(VozServicioPlugin.class);
        // Motor de voz offline empaquetado (Vosk). Se usa cuando no hay
        // acceso a Internet real.
        registerPlugin(VoskVoicePlugin.class);
        // Aprovisiona el modelo de Vosk (descarga reanudable o importación
        // desde archivo): ya no viaja dentro de la APK.
        registerPlugin(VoskModeloPlugin.class);
        // Bundle web (HTML/JS/CSS) actualizable sin instalar la APK.
        registerPlugin(WebBundlePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
