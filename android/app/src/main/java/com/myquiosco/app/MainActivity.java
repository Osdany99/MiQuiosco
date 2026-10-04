package com.myquiosco.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de la app (instalador de APK, lector de SMS).
        // `cap sync` no toca el módulo app, así que el registro sobrevive a los
        // syncs. SmsReceiver no se registra aquí: va declarado en el manifest
        // para que el sistema lo despierte sin depender del proceso.
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(SmsReaderPlugin.class);
        registerPlugin(ContactosPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
