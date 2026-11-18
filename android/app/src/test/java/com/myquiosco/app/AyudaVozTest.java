package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.json.JSONObject;
import org.junit.Test;

/**
 * AyudaVoz - ayuda en capas con la app cerrada.
 *
 * Lee el mismo `assets/voz/dialogo.json` que usa el servicio (lo genera
 * `scripts/copiar-voz.mjs` desde `shared/voz/ayuda.js`), así que si el catálogo
 * y el APK divergen, falla aquí.
 */
public class AyudaVozTest {

    private JSONObject ayuda() throws Exception {
        File archivo = new File("src/main/assets/voz/dialogo.json");
        assertTrue("Falta el asset: node scripts/copiar-voz.mjs", archivo.exists());
        JSONObject raiz = new JSONObject(new String(
            Files.readAllBytes(archivo.toPath()), StandardCharsets.UTF_8));
        JSONObject ayuda = raiz.optJSONObject("ayuda");
        assertNotNull("El asset no trae el catálogo de ayuda", ayuda);
        return ayuda;
    }

    @Test
    public void reconoceLaAyudaConTemaYSinEl() throws Exception {
        JSONObject ayuda = ayuda();
        assertTrue(AyudaVoz.pideAyuda("ayuda", ayuda));
        assertTrue(AyudaVoz.pideAyuda("ayuda cobro", ayuda));
        assertTrue(AyudaVoz.pideAyuda("que puedes hacer", ayuda));
        assertTrue(AyudaVoz.pideAyuda("como te uso", ayuda));
        // Detrás de «ayuda» viene una venta de verdad: no es ayuda.
        assertFalse(AyudaVoz.pideAyuda("ayuda a vender dos panes", ayuda));
        assertFalse(AyudaVoz.pideAyuda("vende dos panes", ayuda));
        assertFalse(AyudaVoz.pideAyuda("", ayuda));
    }

    @Test
    public void entiendeElTemaDichoDeVariasFormas() throws Exception {
        JSONObject ayuda = ayuda();
        assertEquals("cobrar", AyudaVoz.tema("ayuda cobro", ayuda));
        assertEquals("cobrar", AyudaVoz.tema("ayuda de cobrar", ayuda));
        assertEquals("fiar", AyudaVoz.tema("sobre fiar", ayuda));
        assertEquals("cuadre", AyudaVoz.tema("deudas", ayuda));
        assertEquals("consultar", AyudaVoz.tema("consulta", ayuda));
        // «precio» consulta; «cambiar precio» prepara.
        assertEquals("consultar", AyudaVoz.tema("precio", ayuda));
        assertEquals("preparar", AyudaVoz.tema("cambiar precio", ayuda));
        assertEquals("sistema", AyudaVoz.tema("como te uso", ayuda));
        assertEquals("todo", AyudaVoz.tema("ayuda de todo", ayuda));
        assertEquals("mas", AyudaVoz.tema("mas", ayuda));
        assertNull(AyudaVoz.tema("hola", ayuda));
    }

    @Test
    public void elGrupoTraeElTextoListoParaHablar() throws Exception {
        JSONObject ayuda = ayuda();
        JSONObject cobrar = AyudaVoz.grupo(ayuda, "cobrar");
        assertNotNull(cobrar);
        String texto = cobrar.optString("texto", "");
        assertTrue(texto.contains("cobra 200 a Juan"));
        assertTrue(texto.contains("espero tu sí"));
        assertNull(AyudaVoz.grupo(ayuda, "inventado"));
    }

    @Test
    public void conLaAppCerradaNoSeOfrecenLosFormularios() throws Exception {
        JSONObject ayuda = ayuda();
        assertTrue(AyudaVoz.disponible(ayuda, "cerrada", "cobrar"));
        assertFalse(AyudaVoz.disponible(ayuda, "cerrada", "preparar"));
        assertFalse(AyudaVoz.disponible(ayuda, "cerrada", "cuadre"));
        String intro = ayuda.optJSONObject("menus")
            .optJSONObject("cerrada")
            .optString("intro", "");
        assertFalse(intro.contains("cambios"));
    }

    @Test
    public void masAvanzaSinOfrecerLoBasico() throws Exception {
        JSONObject ayuda = ayuda();
        assertEquals("fiar", AyudaVoz.siguiente(ayuda, "vender").optString("id", ""));
        assertEquals("vender", AyudaVoz.siguiente(ayuda, null).optString("id", ""));
        // «lo básico» se pide por su nombre, no entra en la rotación del menú.
        JSONObject ultimo = AyudaVoz.siguiente(ayuda, "cuadre");
        assertFalse("sistema".equals(ultimo.optString("id", "")));
    }

    @Test
    public void deTodoDaEjemplosSinPedirAppAbierta() throws Exception {
        String todo = AyudaVoz.todo(ayuda());
        assertNotNull(todo);
        assertTrue(todo.contains("vende dos panes"));
        assertTrue(todo.contains("cobra 200 a Juan"));
    }
}
