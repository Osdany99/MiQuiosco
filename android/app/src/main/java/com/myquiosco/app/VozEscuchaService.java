package com.myquiosco.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * VozEscuchaService — escucha la frase de activación con la app en segundo plano.
 *
 * El servicio NO interpreta ni escribe en la base: solo escucha, detecta
 * "oye nova", guarda la transcripción del comando en
 * `files/voz/inbox/*.json` y avisa con voz. Cuando la app vuelve a primer plano,
 * `useBuzonVoz` drena ese buzón y lo convierte en acciones pendientes de
 * revisión.
 *
 * Se pausa mientras la app está abierta: el micrófono del dock es el dueño del
 * reconocedor en ese momento y dos sesiones a la vez se pisan
 * (`recognizer_busy`).
 */
public class VozEscuchaService extends Service {

    private static final String TAG = "MiQuioscoVozServicio";

    public static final String ACTION_INICIAR = "com.myquiosco.app.voz.INICIAR";
    public static final String ACTION_DETENER = "com.myquiosco.app.voz.DETENER";
    public static final String ACTION_PAUSAR = "com.myquiosco.app.voz.PAUSAR";
    public static final String ACTION_REANUDAR = "com.myquiosco.app.voz.REANUDAR";
    /** Cambia wake/idioma/motor sin reiniciar el servicio. */
    public static final String ACTION_CONFIGURAR = "com.myquiosco.app.voz.CONFIGURAR";
    public static final String EXTRA_WAKE = "wake";
    public static final String EXTRA_IDIOMA = "idioma";
    /** Arrancar ya en pausa (la app está abierta y el dock usa el micrófono). */
    public static final String EXTRA_PAUSADO = "pausado";
    /** Dictado lanzado desde el widget: no hace falta decir «oye nova». */
    public static final String EXTRA_DIRECTO = "directo";
    /** Motor de reconocimiento: "auto" (por defecto), "sistema" o "vosk". */
    public static final String EXTRA_MOTOR = "motor";

    private static final String CANAL = "voz_servicio";
    private static final String CANAL_ONDA = "voz_onda";
    private static final int NOTIF_ID = 7401;
    private static final int NOTIF_ONDA_ID = 7402;
    private static final int MICROFONO_TIPO = 128; // FOREGROUND_SERVICE_TYPE_MICROPHONE
    private static final long MS_ANTIECO = 400L;
    private static final String FRASE_POR_DEFECTO = "oye nova";
    /** Configuración de flota persistida: sobrevive a un reinicio del servicio. */
    private static final String PREFS_VOZ = "voz.config";
    private static final String KEY_WAKE = "wake";
    private static final String KEY_IDIOMA = "idioma";
    private static final String KEY_MOTOR = "motor";

    /** ¿Hay un servicio vivo? Lo consulta el plugin (y la UI para el estado). */
    public static volatile boolean activo = false;
    /** ¿Está pausado porque la app está abierta? */
    public static volatile boolean pausado = false;
    /** Dictados anotados desde que arrancó el servicio. */
    public static volatile int anotados = 0;
    /** Motor con el que está escuchando ahora: "sistema" o "vosk". */
    public static volatile String motorActual = "";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer = null;
    private boolean escuchando = false;
    private boolean ttsListo = false;
    private boolean destruido = false;
    /** El jefe pulsó «Detener»: no se rearma aunque queden callbacks vivos. */
    private volatile boolean detenido = false;
    /** Silencia el reconocedor mientras el TTS habla (si no, se oye a sí mismo). */
    private volatile boolean ttsHablando = false;
    private TextToSpeech tts = null;
    private PowerManager.WakeLock wakeLock = null;
    private String idioma = "es-US";
    /** "auto"/"vosk": escucha con el motor empaquetado. "sistema": Google. */
    private String motorPreferido = "auto";
    /** Vosk no pudo cargar el modelo: no se vuelve a intentar en esta sesión. */
    private boolean voskFalloTodo = false;
    private final Set<String> wakeVariantes = new LinkedHashSet<>();
    /** La próxima frase es un comando aunque no diga «oye nova» (widget). */
    private volatile boolean directoPendiente = false;

    // ── Diálogo (paridad con la app abierta) ──────────────────────────────
    // El servicio decide y conversa igual que el dock, pero en vez de tocar la
    // base escribe la venta ya confirmada en `files/voz/inbox`.

    private enum Estado { REPOSO, ESPERANDO_COMANDO, ESPERANDO_ELECCION, ESPERANDO_CONFIRMACION }

    private volatile Estado estado = Estado.REPOSO;
    private JSONObject dialogo = new JSONObject();
    private JSONObject textos = new JSONObject();
    private JSONObject tiempos = new JSONObject();
    private IntencionVenta intencion = IntencionVenta.porDefecto();
    private IntencionFiado intencionFiado = new IntencionFiado(intencion);
    private int maxCandidatos = 3;
    private double umbralParecido = 0.55;

    /** Producto elegido y datos de la venta a punto de confirmarse. */
    private JSONObject productoPendiente = null;
    private int cantidadPendiente = 1;
    private String ubicacionPendiente = "almacen";
    /** Cliente del fiado en curso (null = venta normal). */
    private JSONObject clientePendiente = null;
    /** Cobro en curso: cliente, pagos FIFO y saldo restante. */
    private CobroEnCurso cobroPendiente = null;

    private static final class CobroEnCurso {
        JSONObject cliente;
        List<IntencionCobro.Pago> pagos;
        String formaPago;
        double restante;
    }
    /** Correcciones de cantidad aceptadas en la confirmación actual (máx. 2). */
    private int correccionesConfirmacion = 0;
    /** Evita reiniciar el contador cuando la confirmación viene de una corrección. */
    private boolean corrigiendoCantidad = false;
    private final List<JSONObject> candidatosPendientes = new ArrayList<>();
    private int cantidadDictada = 1;
    private String ubicacionDictada = "almacen";
    private String textoDictado = "";
    private float textoDictadoConfianza = 0f;
    private JSONObject snapshotActual = null;

    /** Lo último que dijo el TTS; sirve para no transcribir su propio eco. */
    private String ultimaFrase = "";

    /** Última vez que se refrescó la notificación con nivel/parcial. */
    private long ultimoProgreso = 0L;
    private String ultimoEstadoNotificado = "";
    /** Cierra la onda cuando el diálogo termina. */
    private final Runnable cierreOnda = this::ocultarOnda;

    /**
     * Reservas de esta sesión: el snapshot se congela al minimizar, así que sin
     * esto dos dictados seguidos verían el mismo stock.
     */
    private final org.json.JSONArray reservas = new org.json.JSONArray();

    // Vosk (offline): el modelo y el reconocedor viven solo mientras dura la
    // sesión; el modelo se carga al reanudar para no tener 40 MB en RAM con la
    // app abierta, donde el motor lo usa el dock.
    private Model modeloVosk = null;
    private Recognizer recognizerVosk = null;
    private AudioRecord audioVosk = null;
    private Thread hiloVosk = null;

    @Override
    public void onCreate() {
        super.onCreate();
        activo = true;
        // Solo palabras clave de dos palabras: «nova» a secas disparaba con
        // cualquier conversación del mostrador.
        wakeVariantes.add(FRASE_POR_DEFECTO);
        wakeVariantes.add("oye noba");
        cargarConfiguracion();
        cargarDialogo();
        cargarReservas();
        crearCanal();
        crearCanalOnda();
        iniciarTts();
    }

    /**
     * Textos, verbos, números y tiempos: una sola fuente con el JS
     * (`shared/voz/dialogo.json`), copiada a `assets/voz/dialogo.json` en el
     * build. Si falta el asset, el servicio sigue con los valores por defecto.
     */
    private void cargarDialogo() {
        try (java.io.InputStream in = getAssets().open("voz/dialogo.json")) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            dialogo = new JSONObject(new String(out.toByteArray(), java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.w(TAG, "Sin dialogo.json en assets: se usan los textos por defecto");
            dialogo = new JSONObject();
        }
        textos = dialogo.optJSONObject("frases");
        if (textos == null) textos = new JSONObject();
        tiempos = dialogo.optJSONObject("tiempos");
        if (tiempos == null) tiempos = new JSONObject();
        maxCandidatos = Math.max(1, dialogo.optInt("maxCandidatos", 3));
        umbralParecido = dialogo.optDouble("umbralParecido", 0.55);
        intencion = new IntencionVenta(dialogo);
        intencionFiado = new IntencionFiado(intencion);
    }

    /** Lee la última configuración de flota guardada por la app. */
    private void cargarConfiguracion() {
        try {
            android.content.SharedPreferences prefs =
                getSharedPreferences(PREFS_VOZ, MODE_PRIVATE);
            String wake = prefs.getString(KEY_WAKE, null);
            if (wake != null) aplicarWake(wake);
            idioma = prefs.getString(KEY_IDIOMA, idioma);
            motorPreferido = prefs.getString(KEY_MOTOR, motorPreferido);
        } catch (Exception e) {
            Log.w(TAG, "Sin configuración de voz guardada: se usan los valores por defecto");
        }
    }

    private void guardarConfiguracion(String wake, String lang, String motor) {
        try {
            getSharedPreferences(PREFS_VOZ, MODE_PRIVATE)
                .edit()
                .putString(KEY_WAKE, wake)
                .putString(KEY_IDIOMA, lang)
                .putString(KEY_MOTOR, motor)
                .apply();
        } catch (Exception ignored) {
        }
    }

    /**
     * Configura la palabra clave. Solo se añade la variante corta si tiene dos
     * palabras o más («oye nova» sí, «nova» no): una sola palabra despierta el
     * servicio con la conversación del mostrador.
     */
    private void aplicarWake(String valor) {
        String limpia = valor == null ? "" : valor.trim().toLowerCase(Locale.ROOT)
            .replaceAll("\\s+", " ");
        if (limpia.isEmpty()) return;
        wakeVariantes.clear();
        wakeVariantes.add(limpia);
        String recortada = limpia.replaceFirst("^oye ", "");
        if (!recortada.equals(limpia) && recortada.split(" ").length >= 2) {
            wakeVariantes.add(recortada);
        }
        // Variante fonética típica del STT: nova ↔ noba.
        if (limpia.contains("nova")) wakeVariantes.add(limpia.replace("nova", "noba"));
        if (limpia.contains("noba")) wakeVariantes.add(limpia.replace("noba", "nova"));
    }

    /** Aplica wake/idioma/motor de un intent y los persiste para el próximo arranque. */
    private void aplicarConfiguracionDesdeIntent(Intent intent) {
        if (intent == null) return;
        String wake = intent.getStringExtra(EXTRA_WAKE);
        String lang = intent.getStringExtra(EXTRA_IDIOMA);
        String motor = intent.getStringExtra(EXTRA_MOTOR);
        if (wake != null && !wake.trim().isEmpty()) aplicarWake(wake);
        if (lang != null && !lang.trim().isEmpty()) idioma = lang.trim();
        if ("vosk".equals(motor) || "sistema".equals(motor) || "auto".equals(motor)) {
            motorPreferido = motor;
        }
        if (wake != null || lang != null || motor != null) {
            // Si solo cambiaron idioma o motor, se conserva la palabra clave
            // vigente en vez de guardar un null que la borraría.
            String wakeActual = (wake != null && !wake.trim().isEmpty())
                ? wake.trim()
                : (wakeVariantes.isEmpty() ? FRASE_POR_DEFECTO : wakeVariantes.iterator().next());
            guardarConfiguracion(wakeActual, idioma, motorPreferido);
        }
    }

    private long tiempo(String clave, long porDefecto) {
        long valor = tiempos.optLong(clave, porDefecto);
        return valor > 0 ? valor : porDefecto;
    }

    /** Texto de `frases` con los huecos `{clave}` reemplazados. */
    private String frase(String clave, String... pares) {
        String base = textos.optString(clave, "");
        if (base.isEmpty()) {
            // Sin asset: frases mínimas para que el diálogo no quede mudo.
            switch (clave) {
                case "anotado": return "Anotado para revisar";
                case "noAnotada": return "No la anoté.";
                case "cancelado": return "Cancelado";
                case "faltaProducto": return "No encontré ese producto.";
                case "confirmar": return "¿Confirmo?";
                case "elegir": return "¿Cuál?";
                case "parecidos": return "Los más parecidos: ";
                case "sinStock": return "No hay stock suficiente.";
                case "ayuda": return "Puedo anotar ventas, fiar, cobrar, consultar stock, precios, deudas y las ventas del día. Prueba: vende dos panes.";
                case "nadaQueRepetir": return "No tengo nada que repetir todavía.";
                default: return "";
            }
        }
        for (int i = 0; i + 1 < pares.length; i += 2) {
            base = base.replace("{" + pares[i] + "}", pares[i + 1]);
        }
        return base;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String accion = intent == null ? null : intent.getAction();
        if (ACTION_DETENER.equals(accion)) {
            detenerTodo();
            return START_NOT_STICKY;
        }
        if (ACTION_PAUSAR.equals(accion)) {
            pausado = true;
            pararEscucha();
            actualizarNotificacion("En pausa: la app está abierta");
            return START_STICKY;
        }
        if (ACTION_REANUDAR.equals(accion)) {
            pausado = false;
            comenzarEscucha();
            return START_STICKY;
        }
        if (ACTION_CONFIGURAR.equals(accion)) {
            // Cambio de flota con el servicio vivo: se aplica ya, sin esperar a
            // que el jefe vuelva a abrir la app.
            aplicarConfiguracionDesdeIntent(intent);
            // No se corta una venta a medias: si hay diálogo, los valores nuevos
            // se usan al terminar. En reposo se reinicia la escucha ya.
            if (!pausado && !detenido && !destruido && estado == Estado.REPOSO) {
                pararEscucha();
                comenzarEscucha();
            }
            return START_STICKY;
        }

        // INICIAR (o reinicio del sistema tras matar el proceso).
        aplicarConfiguracionDesdeIntent(intent);
        // Un arranque nuevo vuelve a probar Vosk: el fallo de ayer no debe
        // condenar la sesión de hoy (el modelo pudo quedar a medias y
        // descomprimirse bien ahora).
        voskFalloTodo = false;

        pasarAForeground();
        detenido = false;
        boolean arrancarPausado = intent != null && intent.getBooleanExtra(EXTRA_PAUSADO, false);
        if (arrancarPausado) {
            // El servicio queda en primer plano (necesario para poder escuchar
            // después: Android 14 no deja arrancar un FGS de micrófono desde
            // segundo plano) pero sin abrir el micrófono.
            pausado = true;
            actualizarNotificacion("En espera: escucha cuando la app no esté abierta");
            return START_STICKY;
        }
        pausado = false;
        // El widget abre la escucha sin frase de activación: la primera frase
        // que se oiga ya es el comando.
        if (intent != null && intent.getBooleanExtra(EXTRA_DIRECTO, false)) {
            directoPendiente = true;
            actualizarNotificacion("Dictando venta al almacén");
            mostrarOnda("Escuchando…");
        }
        comenzarEscucha();
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        destruido = true;
        pararEscucha();
        ocultarOnda();
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignored) { }
            tts = null;
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) { }
        }
        wakeLock = null;
        activo = false;
        pausado = false;
        motorActual = "";
        super.onDestroy();
    }

    /**
     * El usuario cerró la app desde la lista de recientes: el servicio sigue
     * vivo (stopWithTask=false) y debe volver a escuchar, porque ya no hay dock
     * que use el micrófono.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        pausado = false;
        detenido = false;
        comenzarEscucha();
        actualizarNotificacion("Escuchando: di «" + FRASE_POR_DEFECTO + "» y luego la venta");
        super.onTaskRemoved(rootIntent);
    }

    // ── Notificación / foreground ─────────────────────────────────────────

    private void crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(
            CANAL, "Escucha por voz", NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Escucha «oye nova» con la app cerrada");
        canal.setShowBadge(false);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(canal);
    }

    /**
     * Canal aparte para la onda: el full-screen intent exige importancia alta.
     * Sin sonido ni vibración: es una ventana, no un aviso.
     */
    private void crearCanalOnda() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(
            CANAL_ONDA, "Onda al dictar", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Muestra la onda mientras dictás con la app cerrada");
        canal.setShowBadge(false);
        canal.enableVibration(false);
        canal.setSound(null, null);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(canal);
    }

    // ── Onda sobre el bloqueo (opcional) ──────────────────────────────────

    /** Android 14+ puede negar la pantalla completa; se consulta antes de abrir. */
    private boolean puedePantallaCompleta() {
        if (Build.VERSION.SDK_INT < 34) return true;
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            return nm == null || nm.canUseFullScreenIntent();
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * Abre la ventana con la onda. Android no permite lanzar actividades desde
     * segundo plano, así que se usa un full-screen intent: es la única vía
     * sancionada (y enciende la pantalla, que es lo que el jefe activó).
     */
    private void mostrarOnda(String texto) {
        if (!VozOnda.activa(this)) return;
        if (!puedePantallaCompleta()) {
            Log.w(TAG, "Sin permiso de pantalla completa: la onda no se muestra");
            return;
        }
        try {
            Intent abrir = new Intent(this, VozDialogoActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(this, 11, abrir, flags);

            Notification n = new NotificationCompat.Builder(this, CANAL_ONDA)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("MiQuiosco")
                .setContentText(texto)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setFullScreenIntent(pi, true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setAutoCancel(true)
                .setTimeoutAfter(20000L)
                .setContentIntent(pi)
                .build();
            NotificationManagerCompat.from(this).notify(NOTIF_ONDA_ID, n);
            // Best-effort: si el sistema ya nos deja abrir (pantalla encendida),
            // la ventana aparece sin esperar al intent.
            try { startActivity(abrir); } catch (Exception ignored) { }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo mostrar la onda: " + e.getMessage());
        }
    }

    private void ocultarOnda() {
        handler.removeCallbacks(cierreOnda);
        try {
            NotificationManagerCompat.from(this).cancel(NOTIF_ONDA_ID);
        } catch (Exception ignored) { }
        VozDialogoActivity.cerrar();
    }

    /** Cuando el diálogo termina, la onda se cierra sola a los 2,5 s. */
    private void programarCierreOnda() {
        handler.removeCallbacks(cierreOnda);
        if (estado == Estado.REPOSO) handler.postDelayed(cierreOnda, 2500L);
    }

    private PendingIntent intentAbrirRevision() {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.setAction(Intent.ACTION_MAIN);
        abrir.addCategory(Intent.CATEGORY_LAUNCHER);
        abrir.setData(Uri.parse("miqiosco://voice/pendientes"));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, 1, abrir, flags);
    }

    private PendingIntent intentDetener() {
        Intent detener = new Intent(this, VozEscuchaService.class).setAction(ACTION_DETENER);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, 2, detener, flags);
    }

    private Notification construirNotificacion(String texto) {
        return construirNotificacion(texto, -1f);
    }

    /** Con `nivel >= 0` la notificación muestra un vúmetro que sigue la voz. */
    private Notification construirNotificacion(String texto, float nivel) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("MiQuiosco escucha")
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(intentAbrirRevision())
            .addAction(0, "Abrir revisión", intentAbrirRevision())
            .addAction(0, "Detener", intentDetener());
        if (nivel >= 0) {
            b.setProgress(100, Math.round(Math.max(0f, Math.min(1f, nivel)) * 100f), false);
        }
        return b.build();
    }

    private void pasarAForeground() {
        Notification n = construirNotificacion(
            "Di «" + FRASE_POR_DEFECTO + "» y luego la venta");
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, MICROFONO_TIPO);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void actualizarNotificacion(String texto) {
        actualizarNotificacion(texto, -1f);
    }

    private void actualizarNotificacion(String texto, float nivel) {
        try {
            if (texto != null) ultimoEstadoNotificado = texto;
            NotificationManagerCompat.from(this).notify(NOTIF_ID, construirNotificacion(texto, nivel));
        } catch (Exception ignored) { }
    }

    /**
     * Refresca la notificación con lo que se está entendiendo y el nivel del
     * micrófono. Es el indicador visible con la app cerrada (y con la onda
     * apagada): sin esto no hay forma de saber que el teléfono te oye.
     */
    private void publicarProgreso(String parcial, float nivel) {
        long ahora = System.currentTimeMillis();
        if (ahora - ultimoProgreso < 250L) return;
        ultimoProgreso = ahora;

        String texto = parcial == null ? "" : parcial.trim();
        VozOnda.publicar(nivel, texto, VozOnda.MODO_ESCUCHANDO);

        // Durante la confirmación manda el texto del diálogo, no el parcial.
        if (estado == Estado.ESPERANDO_CONFIRMACION || estado == Estado.ESPERANDO_ELECCION) return;
        String estadoNotif = texto.isEmpty() ? "Te escucho…" : "Te escucho: " + texto;
        actualizarNotificacion(estadoNotif, nivel);
    }

    /** Nivel 0..1 aproximado del audio (RMS escalado a habla normal). */
    private static float rms(short[] datos, int muestras) {
        if (datos == null || muestras <= 0) return 0f;
        double suma = 0;
        for (int i = 0; i < muestras && i < datos.length; i++) {
            double v = datos[i] / 32768.0;
            suma += v * v;
        }
        double r = Math.sqrt(suma / muestras);
        return (float) Math.min(1.0, r * 6.0);
    }

    // ── Escucha ───────────────────────────────────────────────────────────

    private boolean tieneMicrofono() {
        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void comenzarEscucha() {
        if (destruido || pausado || detenido || escuchando) return;
        if (!tieneMicrofono()) {
            actualizarNotificacion("Falta el permiso de micrófono; abre la app para concederlo");
            return;
        }
        if (!adquirirWakelock()) {
            // Sin wakelock se sigue intentando: el audio suele mantener la CPU.
        }
        if (debeUsarVosk()) {
            iniciarVosk();
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            // Sin motor del sistema, Vosk es la única opción (modelo empaquetado).
            if (!voskFalloTodo) {
                motorPreferido = "vosk";
                iniciarVosk();
                return;
            }
            actualizarNotificacion("Este teléfono no tiene reconocimiento de voz");
            return;
        }
        iniciarSesion();
    }

    /**
     * Motor de esta sesión.
     *
     * Por defecto escucha con Vosk (offline): el `SpeechRecognizer` del sistema
     * pita cada vez que abre el micrófono y el servicio abre una sesión por
     * frase, así que en el bolsillo sonaba un pitido cada pocos segundos. Vosk
     * escucha de forma continua y en silencio, y además funciona sin datos.
     *
     * Sólo se usa el sistema si el jefe lo elige expresamente en Ajustes
     * («Google») o si Vosk no pudo cargar el modelo en esta sesión.
     */
    private boolean debeUsarVosk() {
        if (voskFalloTodo) return false;
        return !"sistema".equals(motorPreferido);
    }

    private boolean adquirirWakelock() {
        if (wakeLock != null && wakeLock.isHeld()) return true;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return false;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MiQuiosco:voz");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
            return true;
        } catch (Exception e) {
            wakeLock = null;
            return false;
        }
    }

    private void liberarWakelock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) { }
        }
    }

    private Intent construirIntent() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, idioma);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, idioma);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 4);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false);
        // Frases cortas de mostrador: cerrar la captura pronto.
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200);
        try {
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        } catch (Exception ignored) { }
        return intent;
    }

    private void iniciarSesion() {
        if (destruido || pausado || escuchando) return;
        handler.post(() -> {
            if (destruido || pausado) return;
            try {
                cleanupRecognizer();
                recognizer = SpeechRecognizer.createSpeechRecognizer(this);
                if (recognizer == null) {
                    programarReinicio(3000);
                    return;
                }
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) { }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float rmsdB) {
                        // Nivel del sistema: -2..10 dB. Escalado a 0..1.
                        publicarProgreso("", Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f)));
                    }
                    @Override public void onBufferReceived(byte[] buffer) { }
                    @Override public void onEndOfSpeech() { }
                    @Override public void onEvent(int eventType, Bundle params) { }

                    @Override
                    public void onPartialResults(Bundle partialResults) {
                        if (partialResults == null) return;
                        ArrayList<String> parciales = partialResults.getStringArrayList(
                            SpeechRecognizer.RESULTS_RECOGNITION);
                        if (parciales == null || parciales.isEmpty()) return;
                        publicarProgreso(parciales.get(0), 0.6f);
                    }

                    @Override
                    public void onResults(Bundle results) {
                        escuchando = false;
                        String texto = "";
                        float confianza = 0f;
                        ArrayList<String> alternativas = new ArrayList<>();
                        if (results != null) {
                            ArrayList<String> matches = results.getStringArrayList(
                                SpeechRecognizer.RESULTS_RECOGNITION);
                            float[] scores = results.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES);
                            if (matches != null && !matches.isEmpty()) {
                                texto = matches.get(0) == null ? "" : matches.get(0);
                                alternativas.addAll(matches);
                            }
                            if (scores != null && scores.length > 0) confianza = scores[0];
                        }
                        cleanupRecognizer();
                        manejarTexto(texto, confianza, alternativas);
                    }

                    @Override
                    public void onError(int error) {
                        escuchando = false;
                        cleanupRecognizer();
                        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                            actualizarNotificacion("Falta el permiso de micrófono");
                            return;
                        }
                        long espera = 250L;
                        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) espera = 700L;
                        else if (error == SpeechRecognizer.ERROR_NETWORK
                            || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                            || error == SpeechRecognizer.ERROR_SERVER) espera = 2500L;
                        programarReinicio(espera);
                    }
                });
                recognizer.startListening(construirIntent());
                escuchando = true;
                motorActual = "sistema";
            } catch (Exception e) {
                Log.w(TAG, "No se pudo iniciar la escucha: " + e.getMessage());
                cleanupRecognizer();
                programarReinicio(2000);
            }
        });
    }

    private void programarReinicio(long esperaMs) {
        if (destruido || pausado) return;
        // Con Vosk escuchando no se reinicia nada: su bucle ya está leyendo el
        // micrófono y abrir un segundo reconocedor lo rompería.
        if (hiloVosk != null && hiloVosk.isAlive()) return;
        handler.postDelayed(this::iniciarSesion, Math.max(150L, esperaMs));
    }

    private void pararEscucha() {
        handler.removeCallbacksAndMessages(null);
        escuchando = false;
        estado = Estado.REPOSO;
        estadoEnEspera = null;
        ttsHablando = false;
        // Un dictado directo a medias no debe convertir la próxima charla en
        // comando: al cancelar se pierde.
        directoPendiente = false;
        // Un fiado o cobro a medias no debe sobrevivir a la cancelación.
        productoPendiente = null;
        clientePendiente = null;
        cobroPendiente = null;
        cleanupRecognizer();
        pararVosk();
        liberarWakelock();
        ocultarOnda();
    }

    // ── Escucha offline (Vosk) ────────────────────────────────────────────

    /**
     * Escucha continua con el modelo empaquetado. Sin internet no hay motor del
     * sistema que valga, y el reconocedor de Google devuelve error de red en
     * cada intento.
     */
    private void iniciarVosk() {
        if (destruido || pausado || voskFalloTodo) return;
        if (hiloVosk != null && hiloVosk.isAlive()) {
            // La sesión anterior todavía está cerrando el micrófono: se
            // reintenta en un instante en vez de abrir dos a la vez.
            handler.postDelayed(this::comenzarEscucha, 300);
            return;
        }
        if (escuchando) return;
        escuchando = true;
        motorActual = "vosk";
        actualizarNotificacion(VoskModelo.extraido(this)
            ? "Escuchando: di «" + FRASE_POR_DEFECTO + "» y luego la venta"
            : "Preparando la escucha offline (primera vez)…");
        hiloVosk = new Thread(this::bucleVosk, "voz-vosk");
        hiloVosk.start();
    }

    private void bucleVosk() {
        AudioRecord audio = null;
        Recognizer rec = null;
        Model modelo = null;
        try {
            java.io.File carpeta = VoskModelo.asegurar(this, null);
            modelo = new Model(carpeta.getAbsolutePath());
            modeloVosk = modelo;
            rec = new Recognizer(modelo, 16000);
            recognizerVosk = rec;

            int minimo = AudioRecord.getMinBufferSize(
                16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            audio = new AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                Math.max(minimo, 16000 / 5 * 2));
            if (audio.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IllegalStateException("audio_no_inicializado");
            }
            audioVosk = audio;
            audio.startRecording();
            actualizarNotificacion("Escuchando: di «" + FRASE_POR_DEFECTO + "» y luego la venta");

            short[] buffer = new short[1600]; // 100 ms a 16 kHz
            while (!destruido && !pausado) {
                // Mientras el TTS habla se descarta el audio: si no, el
                // reconocedor transcribiría su propia voz y se anotaría sola.
                if (ttsHablando) {
                    audio.read(buffer, 0, buffer.length);
                    continue;
                }
                int n = audio.read(buffer, 0, buffer.length);
                if (n <= 0) continue;
                float nivel = rms(buffer, n);
                if (rec.acceptWaveForm(buffer, n)) {
                    String texto = textoDe(rec.getResult(), "text");
                    VozOnda.publicar(0f, "", VozOnda.MODO_PROCESANDO);
                    if (texto != null && !texto.trim().isEmpty()) {
                        manejarTexto(texto.trim(), 0.8f, new ArrayList<>());
                    }
                } else {
                    // Con Vosk el parcial está disponible: es lo que se va
                    // entendiendo y mueve la onda.
                    publicarProgreso(textoDe(rec.getPartialResult(), "partial"), nivel);
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "Vosk no arrancó: " + e.getMessage());
            // Sin modelo utilizable se vuelve al motor del sistema, que al
            // menos funciona con datos. Se marca para no reintentar Vosk en
            // bucle (el fallo suele ser permanente: modelo corrupto o sin disco).
            voskFalloTodo = true;
            if (!destruido && !pausado) {
                motorPreferido = "sistema";
                motorActual = "sistema";
            }
        } finally {
            escuchando = false;
            if (audio != null) {
                try {
                    if (audio.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) audio.stop();
                } catch (Exception ignored) { }
                try { audio.release(); } catch (Exception ignored) { }
            }
            audioVosk = null;
            if (rec != null) {
                try { rec.close(); } catch (Exception ignored) { }
            }
            recognizerVosk = null;
            if (modelo != null) {
                try { modelo.close(); } catch (Exception ignored) { }
            }
            modeloVosk = null;
            hiloVosk = null;
            // Si el cierre no fue por pausa ni por apagado, hay que seguir
            // escuchando (por ejemplo, Vosk falló y tocaba el motor sistema).
            if (!destruido && !pausado) {
                handler.postDelayed(this::comenzarEscucha, 600);
            }
        }
    }

    /**
     * Corta el bucle de Vosk. No se anula `hiloVosk` aquí: lo limpia el propio
     * hilo al salir, para que nadie abra una segunda sesión sobre el micrófono.
     */
    private void pararVosk() {
        if (audioVosk != null) {
            try { audioVosk.stop(); } catch (Exception ignored) { }
        }
    }

    private void cleanupRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) { }
            try { recognizer.destroy(); } catch (Exception ignored) { }
            recognizer = null;
        }
    }

    // ── Diálogo: de la frase al dictado confirmado ────────────────────────
    //
    // Mismo comportamiento que la voz con la app abierta (producto, parecidos,
    // stock y confirmación), pero el resultado va a `files/voz/inbox` en vez de
    // a la base: nada se registra solo.

    private void manejarTexto(String texto, float confianza, ArrayList<String> alternativas) {
        String limpio = texto == null ? "" : texto.trim();
        if (limpio.isEmpty()) {
            programarReinicio(200);
            return;
        }
        // El TTS puede colarse en el micrófono: si repite lo que acabamos de
        // decir, no es una respuesta del jefe.
        if (esEco(limpio)) {
            programarReinicio(300);
            return;
        }

        String comando = quitarFraseDeActivacion(limpio);
        boolean traeFrase = comando != null;
        String contenido = (traeFrase ? comando : limpio).trim();

        // Volver a decir la frase reinicia el diálogo: sirve para salir de un
        // menú o de una confirmación sin tener que acertar la palabra.
        if (traeFrase && contenido.isEmpty()) {
            empezarDialogo();
            return;
        }

        switch (estado) {
            case ESPERANDO_CONFIRMACION:
                resolverConfirmacion(contenido);
                return;
            case ESPERANDO_ELECCION:
                resolverEleccion(contenido);
                return;
            case ESPERANDO_COMANDO:
                procesarComando(contenido, confianza);
                return;
            default:
                break;
        }

        if (traeFrase) {
            procesarComando(contenido, confianza);
            return;
        }
        // Dictado desde el widget: no hay frase de activación que esperar, la
        // primera frase oída ya es el comando.
        if (directoPendiente) {
            directoPendiente = false;
            procesarComando(contenido, confianza);
            return;
        }
        // Charla del mostrador que no empieza con la frase: se ignora (antes se
        // anotaba todo, y la cola de revisión se llenaba de ruido).
        programarReinicio(200);
    }

    /** La frase de activación sola: preguntar qué quiere y escuchar. */
    private void empezarDialogo() {
        estado = Estado.ESPERANDO_COMANDO;
        programarCaducidad(Estado.ESPERANDO_COMANDO, tiempo("comando", 8000));
        String prompt = dialogo.optString("prompt", "¿Qué puedo hacer por ti?");
        if (prompt == null || prompt.isEmpty()) prompt = "¿Qué puedo hacer por ti?";
        mostrarOnda(prompt);
        hablar(prompt, this::continuarEscucha);
    }

    /** Estado cuya espera está corriendo; la caducidad solo actúa si sigue ahí. */
    private Estado estadoEnEspera = null;

    /** El diálogo caduca: si nadie contesta, se vuelve a exigir la frase. */
    private final Runnable caducidad = () -> {
        Estado esperado = estadoEnEspera;
        if (esperado == null || estado != esperado) return;
        estado = Estado.REPOSO;
        if (esperado != Estado.ESPERANDO_COMANDO) {
            hablar(frase("noAnotada"), this::continuarEscucha);
        }
    };

    private void programarCaducidad(Estado esperado, long ms) {
        handler.removeCallbacks(caducidad);
        estadoEnEspera = esperado;
        handler.postDelayed(caducidad, Math.max(1000L, ms));
    }

    /**
     * El comando dictado: consulta, o venta con su decisión de stock.
     * Lo que no es ninguna de las dos cosas se ignora en silencio.
     */
    private void procesarComando(String texto, float confianza) {
        estado = Estado.REPOSO;
        handler.removeCallbacks(caducidad);
        if (texto == null || texto.length() < 2) {
            continuarEscucha();
            return;
        }

        // Repetición y ayuda: no tocan datos y se contestan antes que nada.
        // «repite» repite la última frase hablada por el servicio.
        if (RepeticionVoz.pideRepetir(texto)) {
            String ultima = RepeticionVoz.paraRepetir(ultimaFrase);
            hablar(ultima != null ? ultima : frase("nadaQueRepetir"), this::continuarEscucha);
            return;
        }
        if (RepeticionVoz.pideAyuda(texto)) {
            hablar(frase("ayuda"), this::continuarEscucha);
            return;
        }

        // 0) Cobro de deuda: va antes de las consultas porque «cobra la deuda de
        // Juan» también contiene «deuda» y, sin esto, se respondería como consulta.
        IntencionCobro.Intencion cobroLeido = IntencionCobro.leer(texto, intencion);
        if (cobroLeido.tipo == IntencionCobro.Tipo.COBRO
            || cobroLeido.tipo == IntencionCobro.Tipo.SIN_CLIENTE) {
            procesarCobro(cobroLeido, texto, confianza);
            return;
        }

        // 1) Consultas: se responden al momento y no dejan nada para revisar.
        String respuesta = responderConsulta(texto);
        if (respuesta != null) {
            hablar(respuesta, this::continuarEscucha);
            return;
        }

        // 2) Fiado: «fía dos panes a Juan». Va antes de la venta porque comparte
        // verbo pero necesita cliente.
        IntencionFiado.Intencion fiado = intencionFiado.leer(texto);
        if (fiado.tipo != IntencionFiado.Tipo.NO_FIADO) {
            procesarFiado(fiado, texto, confianza);
            return;
        }

        // 3) ¿Es una venta? Sin verbo de venta no se toca nada.
        IntencionVenta.Intencion leida = intencion.leer(texto);
        if (leida.tipo == IntencionVenta.Tipo.NO_VENTA) {
            continuarEscucha();
            return;
        }

        textoDictado = texto;
        textoDictadoConfianza = confianza;
        snapshotActual = leerSnapshot();
        JSONArray productos = snapshotActual == null ? null : snapshotActual.optJSONArray("productos");
        if (productos == null) productos = new JSONArray();

        cantidadDictada = Math.max(1, leida.cantidad);
        ubicacionDictada = "almacen".equals(leida.ubicacion) ? "almacen" : "quiosco";

        if (leida.varios) {
            hablar(frase("unoPorVez"), this::continuarEscucha);
            return;
        }

        List<Candidato> candidatos = buscarCandidatos(productos, leida.producto, maxCandidatos);
        if (candidatos.isEmpty()) {
            String aviso = frase("faltaProducto", "producto", leida.producto);
            hablar(aviso, this::continuarEscucha);
            return;
        }

        // Sin nombre de producto ("vende dos") o varios parecidos: se ofrecen
        // opciones en vez de adivinar. Es el mismo criterio que el N-best de la
        // app abierta.
        boolean ambiguo = candidatos.size() > 1
            && !candidatos.get(0).exacto
            && candidatos.get(1).puntaje >= Math.max(1, candidatos.get(0).puntaje - 1);
        if (leida.tipo == IntencionVenta.Tipo.SIN_PRODUCTO || ambiguo) {
            String aviso = leida.tipo == IntencionVenta.Tipo.SIN_PRODUCTO
                ? frase("faltaProducto", "producto", texto)
                : "";
            ofrecerCandidatos(candidatos, aviso);
            return;
        }

        decidirVenta(candidatos.get(0).producto, cantidadDictada, ubicacionDictada);
    }

    /**
     * Fiado con la app cerrada: cliente del snapshot, producto del catálogo y
     * confirmación hablada. Al «sí» se deja la deuda en el buzón; la app la
     * crea al abrirse y el jefe la revisa como cualquier dictado.
     */
    private void procesarFiado(IntencionFiado.Intencion leida, String texto, float confianza) {
        textoDictado = texto;
        textoDictadoConfianza = confianza;
        snapshotActual = leerSnapshot();
        JSONArray productos = snapshotActual == null ? null : snapshotActual.optJSONArray("productos");
        JSONArray clientes = snapshotActual == null ? null : snapshotActual.optJSONArray("clientes");
        if (productos == null) productos = new JSONArray();

        if (clientes == null || clientes.length() == 0) {
            hablar("Abre la app para fiar: no hay clientes en la foto", this::continuarEscucha);
            return;
        }

        List<JSONObject> parecidos = clientesParecidos(clientes, leida.cliente, maxCandidatos);
        if (parecidos.isEmpty()) {
            hablar(frase("clienteNoEncontrado", "cliente", leida.cliente), this::continuarEscucha);
            return;
        }
        // Varios nombres parecidos: se leen y se espera que repita el nombre.
        // Por un nombre de pila nunca se elige (regla de las deudas).
        if (parecidos.size() > 1
            && ConsultaDeuda.similitud(leida.cliente, parecidos.get(0).optString("nombre", ""))
                - ConsultaDeuda.similitud(leida.cliente, parecidos.get(1).optString("nombre", "")) < 0.05) {
            StringBuilder nombres = new StringBuilder();
            for (int i = 0; i < parecidos.size(); i++) {
                if (i > 0) nombres.append(i == parecidos.size() - 1 ? " o " : ", ");
                nombres.append(parecidos.get(i).optString("nombre", ""));
            }
            hablar(frase("clienteAmbiguo", "clientes", nombres.toString()), this::continuarEscucha);
            return;
        }

        if (leida.tipo == IntencionFiado.Tipo.SIN_PRODUCTO) {
            hablar(frase("faltaProducto", "producto", texto), this::continuarEscucha);
            return;
        }

        cantidadDictada = Math.max(1, leida.cantidad);
        ubicacionDictada = "quiosco".equals(leida.ubicacion) ? "quiosco" : "almacen";
        clientePendiente = parecidos.get(0);

        List<Candidato> candidatos = buscarCandidatos(productos, leida.producto, maxCandidatos);
        if (candidatos.isEmpty()) {
            clientePendiente = null;
            hablar(frase("faltaProducto", "producto", leida.producto), this::continuarEscucha);
            return;
        }

        boolean ambiguo = candidatos.size() > 1
            && !candidatos.get(0).exacto
            && candidatos.get(1).puntaje >= Math.max(1, candidatos.get(0).puntaje - 1);
        if (ambiguo) {
            // La elección conserva `clientePendiente`: sigue siendo un fiado.
            ofrecerCandidatos(candidatos, "");
            return;
        }

        decidirVenta(candidatos.get(0).producto, cantidadDictada, ubicacionDictada);
    }

    /** Clientes del snapshot que se parecen al nombre dicho, de mayor a menor. */
    private List<JSONObject> clientesParecidos(JSONArray clientes, String nombre, int maximo) {
        List<JSONObject> lista = new ArrayList<>();
        if (clientes == null) return lista;
        for (int i = 0; i < clientes.length(); i++) {
            JSONObject c = clientes.optJSONObject(i);
            if (c == null) continue;
            if (ConsultaDeuda.similitud(nombre, c.optString("nombre", "")) >= ConsultaDeuda.UMBRAL) {
                lista.add(c);
            }
        }
        lista.sort((a, b) -> Double.compare(
            ConsultaDeuda.similitud(nombre, b.optString("nombre", "")),
            ConsultaDeuda.similitud(nombre, a.optString("nombre", ""))));
        return lista.size() > maximo ? new ArrayList<>(lista.subList(0, maximo)) : lista;
    }

    /** Lee hasta N candidatos ordenados; `exacto` si el nombre aparece literal. */
    private List<Candidato> buscarCandidatos(JSONArray productos, String frase, int maximo) {        List<Candidato> encontrados = new ArrayList<>();
        String buscado = IntencionVenta.normalizarFrase(frase);
        if (buscado.isEmpty() || productos == null) return encontrados;
        Set<String> palabras = new HashSet<>(Arrays.asList(buscado.split(" ")));

        for (int i = 0; i < productos.length(); i++) {
            JSONObject p = productos.optJSONObject(i);
            if (p == null) continue;
            String nombre = IntencionVenta.normalizarFrase(p.optString("nombre", ""));
            if (nombre.isEmpty()) continue;

            boolean exacto = buscado.contains(nombre);
            int puntaje = 0;
            for (String t : nombre.split(" ")) {
                if (t.length() < 3 || PALABRAS_VACIAS.contains(t)) continue;
                if (contieneCompatible(palabras, t)) puntaje++;
            }
            if (!exacto && puntaje == 0) continue;

            Candidato c = new Candidato();
            c.producto = p;
            c.exacto = exacto;
            c.puntaje = exacto ? 100 + puntaje : puntaje;
            encontrados.add(c);
        }

        encontrados.sort((a, b) -> {
            if (a.puntaje != b.puntaje) return b.puntaje - a.puntaje;
            return b.producto.optString("nombre", "").length() - a.producto.optString("nombre", "").length();
        });
        return encontrados.size() > maximo ? new ArrayList<>(encontrados.subList(0, maximo)) : encontrados;
    }

    private static final class Candidato {
        JSONObject producto;
        int puntaje;
        boolean exacto;
    }

    /**
     * ¿La palabra del dictado y la del catálogo son la misma, tolerando plural?
     * "panes" debe encontrar "Pan"; sin esto el dictado más común ("vende dos
     * panes") no encontraba nada.
     */
    private static boolean contieneCompatible(Set<String> palabras, String delCatalogo) {
        if (palabras.contains(delCatalogo)) return true;
        String raizCatalogo = raiz(delCatalogo);
        for (String dicha : palabras) {
            if (raiz(dicha).equals(raizCatalogo)) return true;
        }
        return false;
    }

    private static String raiz(String palabra) {
        if (palabra.length() > 4 && palabra.endsWith("es")) {
            return palabra.substring(0, palabra.length() - 2);
        }
        if (palabra.length() > 3 && palabra.endsWith("s")) {
            return palabra.substring(0, palabra.length() - 1);
        }
        return palabra;
    }

    /** "¿Pan de leche, pan de agua o pan dulce?" y a esperar la elección. */
    private void ofrecerCandidatos(List<Candidato> lista, String aviso) {
        candidatosPendientes.clear();
        for (int i = 0; i < lista.size() && i < maxCandidatos; i++) {
            candidatosPendientes.add(lista.get(i).producto);
        }
        if (candidatosPendientes.isEmpty()) {
            continuarEscucha();
            return;
        }

        StringBuilder opciones = new StringBuilder();
        for (int i = 0; i < candidatosPendientes.size(); i++) {
            if (i > 0) {
                opciones.append(i == candidatosPendientes.size() - 1 ? " o " : ", ");
            }
            opciones.append(candidatosPendientes.get(i).optString("nombre", ""));
        }

        estado = Estado.ESPERANDO_ELECCION;
        programarCaducidad(Estado.ESPERANDO_ELECCION, tiempo("eleccion", 8000));
        String texto = (aviso == null ? "" : aviso);
        if (!texto.isEmpty()) texto += " ";
        texto += frase("elegir", "opciones", opciones.toString());
        hablar(texto, this::continuarEscucha);
    }

    /** Elige por número ("la dos") o por nombre. */
    private void resolverEleccion(String texto) {
        estado = Estado.REPOSO;
        handler.removeCallbacks(caducidad);
        if (candidatosPendientes.isEmpty()) {
            continuarEscucha();
            return;
        }

        String plano = IntencionVenta.normalizarFrase(texto);
        String[] tokens = plano.isEmpty() ? new String[0] : plano.split(" ");

        JSONObject elegido = null;
        for (String token : tokens) {
            Integer numero = intencion.enteroDe(token);
            if (numero != null && numero >= 1 && numero <= candidatosPendientes.size()) {
                elegido = candidatosPendientes.get(numero - 1);
                break;
            }
        }
        if (elegido == null) {
            int mejor = 0;
            for (JSONObject c : candidatosPendientes) {
                int puntos = coincidencias(IntencionVenta.normalizarFrase(c.optString("nombre", "")), tokens);
                if (puntos > mejor) {
                    mejor = puntos;
                    elegido = c;
                }
            }
        }

        if (elegido == null) {
            hablar(frase("noAnotada"), this::continuarEscucha);
            return;
        }
        candidatosPendientes.clear();
        decidirVenta(elegido, cantidadDictada, ubicacionDictada);
    }

    private static int coincidencias(String nombre, String[] tokens) {
        if (nombre.isEmpty() || tokens == null) return 0;
        Set<String> sueltas = new HashSet<>(Arrays.asList(tokens));
        int puntos = 0;
        for (String t : nombre.split(" ")) {
            if (t.length() >= 3 && contieneCompatible(sueltas, t)) puntos++;
        }
        return puntos;
    }

    /**
     * Decisión de stock, con los dos casos que importan:
     * - no hay de verdad;
     * - hay, pero está apartado por ventas por revisar.
     */
    private void decidirVenta(JSONObject producto, int cantidad, String ubicacion) {
        if (producto == null) {
            continuarEscucha();
            return;
        }
        String nombre = producto.optString("nombre", "ese producto");
        if (!producto.optBoolean("seVende", true)) {
            hablar(frase("noSeVende"), this::continuarEscucha);
            return;
        }

        String campoReal = "almacen".equals(ubicacion) ? "almacenReal" : "quioscoReal";
        String campoPendiente = "almacen".equals(ubicacion) ? "pendienteAlmacen" : "pendienteQuiosco";
        String campoOtro = "almacen".equals(ubicacion) ? "quiosco" : "almacen";

        int proyectado = Math.max(0, producto.optInt(ubicacion, 0));
        int real = producto.optInt(campoReal, proyectado);
        int apartado = producto.optInt(campoPendiente, 0);
        // Reservas de dictados de esta misma sesión: el snapshot es viejo.
        int reservado = reservadoDe(producto.optString("id", ""), ubicacion);
        int libre = Math.max(0, proyectado - reservado);
        int apartadoTotal = apartado + reservado;

        if (libre >= cantidad) {
            proponerConfirmacion(producto, cantidad, ubicacion);
            return;
        }

        if (real >= cantidad && apartadoTotal > 0) {
            hablar(frase("reservado",
                "libres", String.valueOf(libre),
                "producto", nombre,
                "apartadas", String.valueOf(apartadoTotal)), this::continuarEscucha);
            return;
        }

        int enOtra = Math.max(0, producto.optInt(campoOtro, 0));
        if (enOtra >= cantidad) {
            hablar(frase("sinStockAqui",
                "ubicacion", "almacen".equals(ubicacion) ? "almacén" : "quiosco",
                "otra", "almacen".equals(ubicacion) ? "quiosco" : "almacén",
                "cantidad", String.valueOf(enOtra)), this::continuarEscucha);
            return;
        }

        hablar(frase("sinStock",
            "producto", nombre,
            "quiosco", String.valueOf(producto.optInt("quiosco", 0)),
            "almacen", String.valueOf(producto.optInt("almacen", 0))), this::continuarEscucha);
    }

    /** Lee la venta (o el fiado) con el importe y pide confirmación. */
    private void proponerConfirmacion(JSONObject producto, int cantidad, String ubicacion) {
        if (!corrigiendoCantidad) correccionesConfirmacion = 0;
        productoPendiente = producto;
        cantidadPendiente = cantidad;
        ubicacionPendiente = ubicacion;

        double precio = producto.optDouble("precio", 0);
        double importe = Math.round(precio * cantidad * 100) / 100.0;
        String nombre = producto.optString("nombre", "ese producto");

        estado = Estado.ESPERANDO_CONFIRMACION;
        // Tope de seguridad: si el TTS no avisa del final, el estado no se
        // queda colgado. La ventana real de 6 s se arma al terminar el anuncio
        // (`continuarEscucha`), para que el «sí» cuente desde que se escucha.
        programarCaducidad(Estado.ESPERANDO_CONFIRMACION, tiempo("confirmacion", 6000) + 20000);
        if (clientePendiente != null) {
            hablar(frase("confirmarFiado",
                "cantidad", String.valueOf(cantidad),
                "producto", nombre,
                "cliente", clientePendiente.optString("nombre", "ese cliente"),
                "importe", formatearNumero(importe)), this::continuarEscucha);
            return;
        }
        hablar(frase("confirmar",
            "cantidad", String.valueOf(cantidad),
            "producto", nombre,
            "lugar", "almacen".equals(ubicacion) ? "almacén" : "quiosco",
            "importe", formatearNumero(importe)), this::continuarEscucha);
    }

    /** "sí" anota; "no" cancela; una corrección cambia la cantidad; otra cosa no anota. */
    private void resolverConfirmacion(String texto) {
        estado = Estado.REPOSO;
        handler.removeCallbacks(caducidad);

        // "no, eran tres": se revalida el stock y se relee la venta. Tiene que ir
        // antes que las negaciones porque la frase también contiene "no".
        int corregida = intencion.cantidadCorregida(texto, cantidadPendiente);
        if (corregida > 0 && productoPendiente != null) {
            if (correccionesConfirmacion >= 2) {
                productoPendiente = null;
                clientePendiente = null;
                hablar(frase("noAnotada"), this::continuarEscucha);
                return;
            }
            correccionesConfirmacion++;
            corrigiendoCantidad = true;
            decidirVenta(productoPendiente, corregida, ubicacionPendiente);
            corrigiendoCantidad = false;
            return;
        }

        String plano = IntencionVenta.normalizarFrase(texto);
        Set<String> tokens = new HashSet<>(Arrays.asList(plano.isEmpty() ? new String[0] : plano.split(" ")));

        if (contieneAlguno(tokens, dialogo.optJSONArray("afirmaciones"), AFIRMACIONES)) {
            confirmarVenta();
            return;
        }
        if (contieneAlguno(tokens, dialogo.optJSONArray("negaciones"), NEGACIONES)) {
            productoPendiente = null;
            clientePendiente = null;
            cobroPendiente = null;
            hablar(frase("cancelado"), this::continuarEscucha);
            return;
        }
        productoPendiente = null;
        clientePendiente = null;
        cobroPendiente = null;
        hablar(frase("noAnotada"), this::continuarEscucha);
    }

    private void confirmarVenta() {
        if (cobroPendiente != null) {
            confirmarCobro();
            return;
        }
        JSONObject producto = productoPendiente;
        JSONObject cliente = clientePendiente;
        productoPendiente = null;
        clientePendiente = null;
        if (producto == null) {
            continuarEscucha();
            return;
        }
        double precio = producto.optDouble("precio", 0);
        double importe = Math.round(precio * cantidadPendiente * 100) / 100.0;
        boolean ok = anotarResuelto(producto, cantidadPendiente, ubicacionPendiente, precio, importe, cliente);
        if (ok) {
            reservar(producto.optString("id", ""), ubicacionPendiente, cantidadPendiente);
            hablar(frase(cliente != null ? "anotadoFiado" : "anotado"), this::continuarEscucha);
        } else {
            hablar(frase("noAnotada"), this::continuarEscucha);
        }
    }

    private static final String[] AFIRMACIONES = { "si", "claro", "dale", "confirmo", "correcto", "ok", "vale" };
    private static final String[] NEGACIONES = { "no", "cancela", "cancelar", "nada", "espera", "dejalo" };

    private static boolean contieneAlguno(Set<String> tokens, JSONArray lista, String[] porDefecto) {
        if (lista != null && lista.length() > 0) {
            for (int i = 0; i < lista.length(); i++) {
                String valor = IntencionVenta.normalizar(lista.optString(i, ""));
                if (!valor.isEmpty() && tokens.contains(valor)) return true;
            }
            return false;
        }
        for (String valor : porDefecto) {
            if (tokens.contains(IntencionVenta.normalizar(valor))) return true;
        }
        return false;
    }

    /** ¿La transcripción es el eco de lo último que dijo el TTS? */
    private boolean esEco(String texto) {
        String a = IntencionVenta.normalizarFrase(texto);
        String b = IntencionVenta.normalizarFrase(ultimaFrase);
        if (a.length() < 6 || b.length() < 6) return false;
        // El eco repite CASI toda la frase. Sin esta proporción, contestar
        // "pan de agua" a "¿pan de leche o pan de agua?" se descartaría como
        // eco, porque la opción está dentro del propio aviso.
        int menor = Math.min(a.length(), b.length());
        int mayor = Math.max(a.length(), b.length());
        if (menor * 10 < mayor * 7) return false;
        return a.contains(b) || b.contains(a);
    }

    /**
     * Después de hablar: el motor del sistema necesita una sesión nueva; Vosk
     * sigue leyendo el micrófono por su cuenta.
     */
    private void continuarEscucha() {
        programarCierreOnda();
        // La ventana del «sí» empieza cuando el anuncio termina: programarla
        // antes del `hablar` se comía 2–3 s de locución y el «sí» llegaba tarde.
        if (estado == Estado.ESPERANDO_CONFIRMACION) {
            programarCaducidad(Estado.ESPERANDO_CONFIRMACION, tiempo("confirmacion", 6000));
        }
        if (hiloVosk != null && hiloVosk.isAlive()) return;
        programarReinicio(MS_ANTIECO);
    }

    /**
     * Devuelve el texto SIN la frase de activación (puede ser vacío) o `null`
     * si la frase no aparece. Compara palabra a palabra normalizada, así que
     * tolera mayúsculas y acentos.
     */
    private String quitarFraseDeActivacion(String texto) {
        String[] tokens = texto.split("\\s+");
        List<String> norm = new ArrayList<>();
        for (String t : tokens) norm.add(normalizar(t));

        for (String frase : wakeVariantes) {
            String[] buscadas = frase.split("\\s+");
            int inicio = buscarSecuencia(norm, buscadas);
            if (inicio < 0) continue;
            StringBuilder resto = new StringBuilder();
            for (int i = inicio + buscadas.length; i < tokens.length; i++) {
                if (resto.length() > 0) resto.append(' ');
                resto.append(tokens[i]);
            }
            return resto.toString().trim();
        }

        // El STT a veces pega la frase en una sola palabra ("oyenova").
        for (int i = 0; i < norm.size(); i++) {
            if (norm.get(i).contains("oyenova") || norm.get(i).contains("oyenoba")) {
                StringBuilder resto = new StringBuilder();
                for (int j = i + 1; j < tokens.length; j++) {
                    if (resto.length() > 0) resto.append(' ');
                    resto.append(tokens[j]);
                }
                return resto.toString().trim();
            }
        }
        return null;
    }

    private int buscarSecuencia(List<String> tokens, String[] buscadas) {
        for (int i = 0; i + buscadas.length <= tokens.size(); i++) {
            boolean ok = true;
            for (int j = 0; j < buscadas.length; j++) {
                String esperado = normalizar(buscadas[j]);
                String actual = tokens.get(i + j);
                boolean igual = actual.equals(esperado)
                    || (esperado.equals("quiosco") && actual.equals("kiosco"));
                if (!igual) { ok = false; break; }
            }
            if (ok) return i;
        }
        return -1;
    }

    private static String normalizar(String valor) {
        String s = valor == null ? "" : valor.trim().toLowerCase(Locale.ROOT);
        String nfd = Normalizer.normalize(s, Normalizer.Form.NFD);
        return nfd.replaceAll("\\p{M}+", "").replaceAll("[^a-z0-9]", "");
    }

    /** Texto de un resultado JSON de Vosk (`{"text": "..."}`). */
    private static String textoDe(String json, String campo) {
        if (json == null) return "";
        try {
            String texto = new JSONObject(json).optString(campo, "");
            return texto == null ? "" : texto.trim();
        } catch (Exception e) {
            return "";
        }
    }

    /** Normalización por frase: conserva los espacios para comparar nombres. */
    private static String normalizarFrase(String valor) {
        String s = valor == null ? "" : valor.trim().toLowerCase(Locale.ROOT);
        String nfd = Normalizer.normalize(s, Normalizer.Form.NFD);
        return nfd.replaceAll("\\p{M}+", "")
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
    }

    // ── Consultas con la app cerrada ──────────────────────────────────────
    // Se responden desde `voz/snapshot.json` (lo escribe la app al abrir y
    // después de cada revisión). El servicio no calcula stock propio.

    private static final Set<String> PALABRAS_VACIAS = new HashSet<>(Arrays.asList(
        "de", "del", "la", "el", "los", "las", "con", "para", "por", "en", "y", "un", "una"));

    private JSONObject leerSnapshot() {
        File f = new File(getFilesDir(), "voz/snapshot.json");
        if (!f.exists()) return null;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
        } catch (Exception e) {
            return null;
        }
    }

    /** Responde una consulta, o `null` si el comando es una venta/movimiento. */
    private String responderConsulta(String texto) {
        String frase = normalizarFrase(texto);
        if (frase.isEmpty()) return null;

        // Deudas: se contestan antes que stock/precio porque la frase también
        // trae "cuánto". El resumen lo calcula la app y vive en el snapshot.
        if (ConsultaDeuda.esConsulta(frase)) {
            JSONObject snapDeudas = leerSnapshot();
            if (snapDeudas == null) return "Abre la app para ver las deudas";
            String deuda = ConsultaDeuda.responder(frase, snapDeudas.optJSONObject("deudas"));
            if (deuda != null) return deuda;
        }

        // Caja: con la app cerrada no hay cuadre en el snapshot. Se dice en vez
        // de responder el resumen del día («cómo va la caja» también trae
        // «como va»).
        boolean pideCaja = frase.contains("efectivo esperado")
            || (frase.contains("caja")
                && (frase.contains("como va") || frase.contains("como esta")
                    || frase.contains("cuanto hay en") || frase.contains("efectivo")
                    || frase.contains("cuadre")));
        if (pideCaja) return "Abre la app para ver la caja";

        boolean pideResumen = frase.contains("como va")
            || frase.contains("ventas de hoy")
            || frase.contains("ventas del dia")
            || frase.contains("vendido hoy")
            || frase.contains("vendi hoy")
            || frase.contains("cuanto he vendido")
            || frase.contains("cuanto vendi")
            || frase.contains("resumen del dia")
            || frase.contains("resumen de hoy")
            || frase.contains("cierre del dia");
        boolean pideGanancia = (frase.contains("gane")
            || frase.contains("ganamos")
            || frase.contains("ganancia")
            || frase.contains("utilidad"))
            && (frase.contains("hoy") || frase.contains("dia") || frase.startsWith("ganancia"));
        boolean pidePrecio = frase.contains("cuanto cuesta")
            || frase.contains("cuanto vale")
            || frase.contains("precio");
        boolean pideStock = frase.contains("cuanto")
            || frase.contains("cuanta")
            || frase.contains("cuantos")
            || frase.contains("cuantas")
            || frase.contains("stock")
            || frase.contains("queda")
            || frase.contains("quedan")
            || frase.contains("hay");

        if (!pideResumen && !pidePrecio && !pideStock && !pideGanancia) return null;

        JSONObject snap = leerSnapshot();
        if (snap == null) return null;

        // Ganancia del día: el cálculo vive en el snapshot (`resumen.gananciaHoy`).
        // Un snapshot viejo sin el campo no se completa con un cero inventado.
        if (pideGanancia) {
            JSONObject r = snap.optJSONObject("resumen");
            if (r == null || !r.has("gananciaHoy")) {
                return "Abre la app para ver la ganancia";
            }
            int ventas = r.optInt("ventasHoy", 0);
            if (ventas == 0) return "Todavía no hay ventas hoy, así que no hay ganancia.";
            double ganancia = r.optDouble("gananciaHoy", 0);
            String monto = formatearNumero(Math.abs(ganancia));
            String verbo = ganancia < 0 ? "perdiste" : "ganaste";
            // Mismo texto que `formatearGanancia` (shared/voz/dia.js).
            return "Hoy " + verbo + " " + monto + " pesos de "
                + formatearNumero(r.optDouble("importeHoy", 0)) + " vendidos.";
        }

        if (pideResumen) {
            JSONObject r = snap.optJSONObject("resumen");
            if (r == null) return null;
            int ventas = r.optInt("ventasHoy", 0);
            // Lo dictado con la app cerrada todavía no está en la tabla de
            // pendientes: se suma el buzón para no mentir en el recuento.
            int pendientes = r.optInt("pendientes", 0) + contarBuzon();
            // Mismo texto que `formatearDia` (shared/voz/dia.js).
            if (ventas == 0) {
                if (pendientes == 0) return "Todavía no hay ventas hoy";
                return "Todavía no hay ventas hoy. Hay " + pendientes
                    + (pendientes == 1 ? " dictado" : " dictados") + " por revisar";
            }
            StringBuilder resp = new StringBuilder();
            resp.append("Hoy: ").append(ventas).append(ventas == 1 ? " venta" : " ventas")
                .append(" por ").append(formatearNumero(r.optDouble("importeHoy", 0)))
                .append(" pesos");
            if (pendientes > 0) {
                resp.append(". ").append(pendientes)
                    .append(pendientes == 1 ? " dictado por revisar" : " dictados por revisar");
            }
            return resp.toString();
        }

        JSONArray productos = snap.optJSONArray("productos");
        if (productos == null) return null;
        JSONObject producto = buscarProducto(productos, frase);
        if (producto == null) {
            return "No encontré ese producto en la lista";
        }
        String nombre = producto.optString("nombre", "ese producto");
        if (pidePrecio) {
            return nombre + " cuesta " + formatearNumero(producto.optDouble("precio", 0)) + " pesos";
        }
        // Con dictados sin revisar el stock no es fiable: dos frases seguidas
        // podrían estar prometiendo las mismas unidades. Se dice la verdad en
        // vez de dar un número que ya no se sostiene.
        int sinRevisar = contarBuzon();
        if (sinRevisar > 0) {
            return "Hay " + sinRevisar + (sinRevisar == 1 ? " dictado" : " dictados")
                + " sin revisar. Abre la app para ver el stock real de " + nombre;
        }
        int enQuiosco = producto.optInt("quiosco", 0);
        int enAlmacen = producto.optInt("almacen", 0);
        String resp = nombre + ": " + enQuiosco + " en quiosco y " + enAlmacen + " en almacén";
        if (producto.has("precio")) {
            resp += ". A " + formatearNumero(producto.optDouble("precio", 0)) + " pesos";
        }
        return resp;
    }

    /** Dictados que el servicio dejó en el buzón y la app aún no ha recogido. */
    private int contarBuzon() {
        try {
            File dir = new File(getFilesDir(), "voz/inbox");
            File[] ficheros = dir.listFiles();
            if (ficheros == null) return 0;
            int total = 0;
            for (File f : ficheros) {
                if (f != null && f.getName().endsWith(".json")) total++;
            }
            return total;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Nombre exacto si aparece; si no, el producto con más palabras en común. */
    private JSONObject buscarProducto(JSONArray productos, String frase) {
        List<Candidato> candidatos = buscarCandidatos(productos, frase, 1);
        return candidatos.isEmpty() ? null : candidatos.get(0).producto;
    }

    private static String formatearNumero(double valor) {
        if (Math.abs(valor - Math.rint(valor)) < 0.005) {
            return String.valueOf((long) Math.rint(valor));
        }
        return String.format(Locale.US, "%.2f", valor);
    }

    /**
     * Cobro con la app cerrada: cliente del snapshot, reparto FIFO y
     * confirmación hablada. Al «sí» deja un pago por deuda en el buzón; la app
     * los aplica y el jefe los revisa.
     */
    private void procesarCobro(IntencionCobro.Intencion leida, String texto, float confianza) {
        if (leida.tipo == IntencionCobro.Tipo.SIN_CLIENTE) {
            hablar("¿A quién le cobro? Di, por ejemplo: cobra 200 a Juan", this::continuarEscucha);
            return;
        }

        snapshotActual = leerSnapshot();
        JSONObject deudas = snapshotActual == null ? null : snapshotActual.optJSONObject("deudas");
        JSONArray clientes = deudas == null ? null : deudas.optJSONArray("clientes");
        if (clientes == null || clientes.length() == 0) {
            hablar("Abre la app para cobrar: no hay deudas en la foto", this::continuarEscucha);
            return;
        }

        // Mejor parecido y segundo, para no elegir por un nombre de pila.
        JSONObject cliente = null;
        JSONObject segundoCliente = null;
        double mejor = 0;
        double segundo = 0;
        for (int i = 0; i < clientes.length(); i++) {
            JSONObject c = clientes.optJSONObject(i);
            if (c == null) continue;
            double s = ConsultaDeuda.similitud(leida.cliente, c.optString("nombre", ""));
            if (s > mejor) {
                segundo = mejor;
                segundoCliente = cliente;
                mejor = s;
                cliente = c;
            } else if (s > segundo) {
                segundo = s;
                segundoCliente = c;
            }
        }

        if (cliente == null || mejor < ConsultaDeuda.UMBRAL) {
            hablar(frase("clienteNoEncontrado", "cliente", leida.cliente), this::continuarEscucha);
            return;
        }
        boolean mismoNombreDePila = !leida.cliente.contains(" ") && mismoNombreDePila(leida.cliente, clientes);
        if (mismoNombreDePila
            || (segundoCliente != null && segundo >= ConsultaDeuda.UMBRAL && mejor - segundo < 0.05)) {
            String nombres = segundoCliente == null
                ? cliente.optString("nombre", "")
                : cliente.optString("nombre", "") + " o " + segundoCliente.optString("nombre", "");
            hablar(frase("clienteAmbiguo", "clientes", nombres), this::continuarEscucha);
            return;
        }

        JSONArray susDeudas = cliente.optJSONArray("deudas");
        double saldo = IntencionCobro.saldo(susDeudas);
        if (saldo <= 0) {
            hablar(frase("clienteSinDeuda", "cliente", cliente.optString("nombre", "")), this::continuarEscucha);
            return;
        }

        double pedido = leida.todo ? saldo : leida.monto;
        if (pedido <= 0) {
            hablar("No entendí cuánto cobrar", this::continuarEscucha);
            return;
        }
        if (pedido > saldo + 0.005) {
            hablar(frase("cobroExcedido",
                "cliente", cliente.optString("nombre", ""),
                "saldo", formatearNumero(saldo)), this::continuarEscucha);
            return;
        }

        List<IntencionCobro.Pago> pagos = IntencionCobro.repartir(susDeudas, pedido);
        if (pagos.isEmpty()) {
            hablar(frase("noAnotada"), this::continuarEscucha);
            return;
        }

        textoDictado = texto;
        textoDictadoConfianza = confianza;
        CobroEnCurso cobro = new CobroEnCurso();
        cobro.cliente = cliente;
        cobro.pagos = pagos;
        cobro.formaPago = leida.formaPago;
        cobro.restante = Math.round((saldo - pedido) * 100) / 100.0;
        cobroPendiente = cobro;

        estado = Estado.ESPERANDO_CONFIRMACION;
        // Igual que en `proponerConfirmacion`: tope hasta que acabe el anuncio.
        programarCaducidad(Estado.ESPERANDO_CONFIRMACION, tiempo("confirmacion", 6000) + 20000);
        String resto = cobro.restante > 0
            ? frase("cobroResto", "restante", formatearNumero(cobro.restante))
            : frase("cobroSaldada");
        hablar(frase("confirmarCobro",
            "cliente", cliente.optString("nombre", ""),
            "importe", formatearNumero(pedido),
            "resto", resto), this::continuarEscucha);
    }

    /** ¿Hay 2+ clientes cuyo nombre de pila empieza por lo dicho? */
    private static boolean mismoNombreDePila(String dicho, JSONArray clientes) {
        int cuenta = 0;
        for (int i = 0; i < clientes.length(); i++) {
            JSONObject c = clientes.optJSONObject(i);
            if (c == null) continue;
            String nombre = IntencionVenta.normalizarFrase(c.optString("nombre", ""));
            int fin = nombre.indexOf(' ');
            String primero = fin < 0 ? nombre : nombre.substring(0, fin);
            if (!primero.isEmpty() && primero.startsWith(dicho)) {
                cuenta++;
                if (cuenta >= 2) return true;
            }
        }
        return false;
    }

    private void confirmarCobro() {
        CobroEnCurso cobro = cobroPendiente;
        cobroPendiente = null;
        if (cobro == null) {
            continuarEscucha();
            return;
        }
        boolean ok = true;
        for (IntencionCobro.Pago pago : cobro.pagos) {
            if (!anotarCobro(cobro.cliente, pago, cobro.formaPago)) ok = false;
        }
        if (!ok) {
            hablar(frase("noAnotada"), this::continuarEscucha);
            return;
        }
        if (cobro.restante > 0) {
            hablar(frase("cobrado", "restante", formatearNumero(cobro.restante)), this::continuarEscucha);
        } else {
            hablar(frase("cobradoTotal"), this::continuarEscucha);
        }
    }

    /**
     * Escribe la venta YA CONFIRMADA en el buzón. El servicio no toca la base:
     * la app la convertirá en acción pendiente al abrirse (y el jefe la
     * confirmará otra vez para que llegue al inventario).
     */
    private boolean anotarResuelto(JSONObject producto, int cantidad, String ubicacion, double precio, double importe, JSONObject cliente) {
        try {
            long ahora = System.currentTimeMillis();
            String base = ahora + "-" + UUID.randomUUID().toString().substring(0, 8);

            JSONObject o = new JSONObject();
            o.put("id", base + ".json");
            o.put("resuelto", true);
            o.put("texto", textoDictado);
            o.put("confidence", textoDictadoConfianza);
            o.put("productoId", producto.optString("id", ""));
            o.put("productoNombre", producto.optString("nombre", ""));
            o.put("cantidad", cantidad);
            o.put("precioUnitario", precio);
            o.put("importe", importe);
            o.put("ubicacion", "almacen".equals(ubicacion) ? "almacen" : "quiosco");
            o.put("tipoVenta", "directa");
            if (cliente != null) {
                // Fiado: la app creará una deuda directa, no una venta.
                o.put("tipo", "deuda");
                o.put("clienteId", cliente.optString("id", ""));
                o.put("clienteNombre", cliente.optString("nombre", ""));
            }
            o.put("dictadoEn", ahora);
            o.put("origen", "servicio");

            return escribirInbox(o, base);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo anotar el dictado: " + e.getMessage());
            return false;
        }
    }

    /**
     * Deja un cobro confirmado en el buzón. Un fichero por deuda: el servicio
     * reparte FIFO antes de escribir y la app cobra cada cuenta por separado.
     */
    private boolean anotarCobro(JSONObject cliente, IntencionCobro.Pago pago, String formaPago) {
        try {
            long ahora = System.currentTimeMillis();
            String base = ahora + "-" + UUID.randomUUID().toString().substring(0, 8);

            JSONObject o = new JSONObject();
            o.put("id", base + ".json");
            o.put("resuelto", true);
            o.put("tipo", "cobro");
            o.put("texto", textoDictado);
            o.put("confidence", textoDictadoConfianza);
            o.put("cuentaFiadoId", pago.cuentaId);
            o.put("monto", pago.monto);
            o.put("formaPago", "transferencia".equals(formaPago) ? "transferencia" : "efectivo");
            o.put("clienteId", cliente.optString("id", ""));
            o.put("clienteNombre", cliente.optString("nombre", ""));
            o.put("dictadoEn", ahora);
            o.put("origen", "servicio");

            return escribirInbox(o, base);
        } catch (Exception e) {
            Log.w(TAG, "No se pudo anotar el cobro: " + e.getMessage());
            return false;
        }
    }

    /**
     * Escritura atómica del buzón: `.tmp` + rename para que la app nunca lea un
     * fichero a medias y luego lo descarte como inválido.
     */
    private boolean escribirInbox(JSONObject o, String base) {
        try {
            File dir = new File(getFilesDir(), "voz/inbox");
            if (!dir.exists() && !dir.mkdirs()) return false;

            File tmp = new File(dir, base + ".tmp");
            try (FileOutputStream fos = new FileOutputStream(tmp)) {
                fos.write(o.toString().getBytes(StandardCharsets.UTF_8));
                fos.flush();
                fos.getFD().sync();
            }
            File destino = new File(dir, base + ".json");
            if (!tmp.renameTo(destino)) {
                // Sin rename (raro), se deja el .tmp: el drenaje solo lee .json
                // y el dictado no se pierde si el rename funciona después.
                Log.w(TAG, "No se pudo renombrar el dictado");
                return false;
            }

            anotados++;
            actualizarNotificacion("Dictado anotado para revisar (" + anotados + ")");
            return true;
        } catch (Exception e) {
            Log.w(TAG, "No se pudo escribir en el buzón: " + e.getMessage());
            return false;
        }
    }

    // ── Reservas de la sesión ─────────────────────────────────────────────
    //
    // El snapshot se congela al minimizar la app. Sin esto, dictar dos veces
    // "vende el último pan" pasaría las dos veces. Las reservas se guardan junto
    // a la hora para poder ignorarlas cuando la app ya las refleja como
    // pendientes (snapshot más nuevo que la reserva).

    private File archivoReservas() {
        return new File(getFilesDir(), "voz/reservas.json");
    }

    private void cargarReservas() {
        File f = archivoReservas();
        if (!f.exists()) return;
        try (java.io.FileInputStream in = new java.io.FileInputStream(f)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject datos = new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
            JSONArray lista = datos.optJSONArray("reservas");
            if (lista == null) return;
            for (int i = 0; i < lista.length(); i++) {
                JSONObject r = lista.optJSONObject(i);
                if (r != null) reservas.put(r);
            }
        } catch (Exception ignored) {
            // Sin reservas legibles se arranca limpio: peor es no escuchar.
        }
    }

    private int reservadoDe(String productoId, String ubicacion) {
        long generado = snapshotActual == null ? 0 : snapshotActual.optLong("generadoEn", 0);
        int total = 0;
        for (int i = 0; i < reservas.length(); i++) {
            JSONObject r = reservas.optJSONObject(i);
            if (r == null) continue;
            if (!productoId.equals(r.optString("productoId", ""))) continue;
            if (!ubicacion.equals(r.optString("ubicacion", ""))) continue;
            // Más vieja que la foto: la app ya la contó como pendiente.
            if (generado > 0 && r.optLong("ts", 0) < generado) continue;
            total += r.optInt("cantidad", 0);
        }
        return total;
    }

    private void reservar(String productoId, String ubicacion, int cantidad) {
        if (productoId.isEmpty() || cantidad <= 0) return;
        try {
            JSONObject r = new JSONObject();
            r.put("productoId", productoId);
            r.put("ubicacion", ubicacion);
            r.put("cantidad", cantidad);
            r.put("ts", System.currentTimeMillis());
            reservas.put(r);

            JSONObject datos = new JSONObject();
            datos.put("reservas", reservas);
            File f = archivoReservas();
            File tmp = new File(f.getParentFile(), "reservas.tmp");
            try (FileOutputStream fos = new FileOutputStream(tmp)) {
                fos.write(datos.toString().getBytes(StandardCharsets.UTF_8));
                fos.flush();
                fos.getFD().sync();
            }
            if (!tmp.renameTo(f)) Log.w(TAG, "No se pudo guardar la reserva");
        } catch (Exception e) {
            Log.w(TAG, "Reserva no guardada: " + e.getMessage());
        }
    }

    // ── Voz de respuesta ──────────────────────────────────────────────────

    private void iniciarTts() {
        try {
            tts = new TextToSpeech(this, status -> {
                ttsListo = status == TextToSpeech.SUCCESS;
                if (ttsListo && tts != null) {
                    try { tts.setLanguage(new Locale("es", "US")); } catch (Exception ignored) { }
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String utteranceId) { }
                        @Override public void onDone(String utteranceId) { }
                        @Override public void onError(String utteranceId) { }
                    });
                }
            });
        } catch (Exception e) {
            tts = null;
            ttsListo = false;
        }
    }

    /** Habla y, cuando termina (o si no hay TTS), ejecuta `despues`. */
    private void hablar(String frase, Runnable despues) {
        // Se guarda para distinguir el eco del TTS de una respuesta real.
        ultimaFrase = frase == null ? "" : frase;
        VozOnda.publicar(0.4f, ultimaFrase, VozOnda.MODO_HABLANDO);
        // El micrófono se silencia mientras habla: si no, el reconocedor
        // transcribe el propio aviso y lo anota como si fuera una venta.
        ttsHablando = true;
        final Runnable continuar = () -> {
            handler.postDelayed(() -> {
                ttsHablando = false;
                if (destruido) return;
                despues.run();
            }, MS_ANTIECO);
        };
        if (!ttsListo || tts == null) {
            handler.postDelayed(continuar, 600L);
            return;
        }
        final String id = "voz-" + System.currentTimeMillis();
        try {
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) { }
                @Override public void onDone(String utteranceId) {
                    if (!id.equals(utteranceId)) return;
                    continuar.run();
                }
                @Override public void onError(String utteranceId) {
                    if (!id.equals(utteranceId)) return;
                    handler.postDelayed(continuar, 600L);
                }
            });
            int res = tts.speak(frase, TextToSpeech.QUEUE_FLUSH, null, id);
            if (res != TextToSpeech.SUCCESS) handler.postDelayed(continuar, 600L);
        } catch (Exception e) {
            handler.postDelayed(continuar, 600L);
        }
    }

    private void detenerTodo() {
        detenido = true;
        pararEscucha();
        if (tts != null) {
            try { tts.stop(); } catch (Exception ignored) { }
        }
        try {
            NotificationManagerCompat.from(this).cancel(NOTIF_ID);
        } catch (Exception ignored) { }
        stopForegroundCompat();
        stopSelf();
    }

    private void stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }
}
