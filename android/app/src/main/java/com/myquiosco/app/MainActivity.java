package com.myquiosco.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
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
        // Piloto aislado de voz offline (Vosk). Solo para pruebas del laboratorio.
        registerPlugin(VoskPilotPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
