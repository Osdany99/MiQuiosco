package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * LimpiarVoz — misma limpieza que el JS, con la app cerrada.
 *
 * Recorre `assets/voz/limpiezaCasos.json`, la MISMA tabla que usa
 * `tests/vozLimpieza.test.js` en el lado JS. Si las dos implementaciones se
 * separan, este test falla en el build de la APK: es el contrato entre las dos
 * ramas.
 *
 * El asset lo genera `scripts/copiar-voz.mjs`, que corre en todo build de APK.
 */
public class LimpiarVozTest {

    private JSONArray casos() throws Exception {
        File archivo = new File("src/main/assets/voz/limpiezaCasos.json");
        assertTrue("Falta el asset: node scripts/copiar-voz.mjs", archivo.exists());
        return new JSONArray(new String(
            Files.readAllBytes(archivo.toPath()), StandardCharsets.UTF_8));
    }

    @Test
    public void todosLosCasosDelContrato() throws Exception {
        JSONArray casos = casos();
        assertTrue("La tabla de casos está vacía", casos.length() > 0);

        StringBuilder fallos = new StringBuilder();
        int totalFallos = 0;
        for (int i = 0; i < casos.length(); i++) {
            JSONObject caso = casos.getJSONObject(i);
            String entrada = caso.getString("entrada");
            String esperado = caso.getString("esperado");
            String obtenido = LimpiarVoz.limpiar(entrada);
            if (!esperado.equals(obtenido)) {
                totalFallos++;
                fallos.append("\n  «").append(entrada).append("» → esperado «")
                      .append(esperado).append("», obtenido «").append(obtenido).append("»");
            }
        }
        assertEquals("Casos que no coinciden con la tabla:" + fallos, 0, totalFallos);
    }

    @Test
    public void noTocaElTramoDeProducto() {
        assertEquals("pan con ya", LimpiarVoz.limpiar("pan con ya"));
        assertEquals("vende dos panes con ya", LimpiarVoz.limpiar("vende dos panes con ya"));
        assertEquals("refresco de la casa", LimpiarVoz.limpiar("refresco de la casa"));
    }

    @Test
    public void noDevuelveVacioSiTodoSeQuito() {
        String r = LimpiarVoz.limpiar("por favor");
        assertTrue("La frase no puede quedar en blanco", !r.isEmpty());
    }

    @Test
    public void toleraEntradaVaciaONula() {
        assertEquals("", LimpiarVoz.limpiar(""));
        assertEquals("", LimpiarVoz.limpiar(null));
        assertEquals("", LimpiarVoz.limpiar("   "));
    }
}
