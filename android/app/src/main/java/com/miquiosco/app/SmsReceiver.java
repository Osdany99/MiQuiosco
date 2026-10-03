package com.miquiosco.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.util.List;

/**
 * Recibe SMS entrantes y encola los de Etecsa/Transfermóvil.
 *
 * Se declara en AndroidManifest.xml (no se registra en runtime) a propósito: así
 * el sistema lo despierta aunque el proceso de la app esté muerto, que es
 * justamente el caso que importa — si el usuario tiene la app cerrada en
 * background (HyperOS/Xiaomi la mata a menudo) y le llega la confirmación de una
 * recarga, no debe perderse.
 *
 * El cuerpo se persiste en SmsAlmacen y el WebView lo leerá después. Nada aquí
 * depende de que el bridge de Capacitor esté listo.
 *
 * Detalle crítico: los mensajes de Etecsa ocupan ~250 caracteres, así que
 * llegan PARTIDOS en varios PDUs (SMS_RECEIVED no lleva el cuerpo unido).
 * Hay que concatenarlos con SmsManager.getMessagesFromIntent(). Si se lee solo
 * el primero, se guarda la mitad del mensaje y el parser falla.
 */
public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        // getMessagesFromIntent es la vía fiable: concatena los segmentos del
        // SMS multipart y devuelve los PDUs en orden.
        SmsMessage[] mensajes = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (mensajes == null || mensajes.length == 0) return;

        StringBuilder remitente = new StringBuilder();
        StringBuilder cuerpo = new StringBuilder();
        long recibidoEn = 0;

        for (SmsMessage m : mensajes) {
            if (m == null) continue;
            if (remitente.length() == 0) {
                String addr = m.getOriginatingAddress();
                if (addr != null) remitente.append(addr);
            }
            if (m.getTimestampMillis() > 0 && recibidoEn == 0) {
                recibidoEn = m.getTimestampMillis();
            }
            cuerpo.append(m.getMessageBody() == null ? "" : m.getMessageBody());
        }

        String addr = remitente.toString();
        String body = cuerpo.toString();
        if (addr.isEmpty() || body.isEmpty()) return;

        List<String> aceptados = SmsAlmacen.remitentes(context);
        if (!SmsAlmacen.remitenteAceptado(addr, aceptados)) return;

        SmsAlmacen.encolar(context, addr, body, recibidoEn > 0 ? recibidoEn : System.currentTimeMillis());
    }
}