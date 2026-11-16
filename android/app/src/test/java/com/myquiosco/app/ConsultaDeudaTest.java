package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * ConsultaDeuda — paridad nativa de `shared/voz/deudas.js` con la app cerrada.
 * El servicio no calcula saldos: solo lee `snapshot.deudas`.
 */
public class ConsultaDeudaTest {

    private static JSONObject deudas() {
        try {
            JSONArray clientes = new JSONArray();
            clientes.put(new JSONObject()
                .put("id", "c1").put("nombre", "Juan Pérez")
                .put("saldo", 250).put("cuentas", 2));
            clientes.put(new JSONObject()
                .put("id", "c2").put("nombre", "Juanita")
                .put("saldo", 80).put("cuentas", 1));
            clientes.put(new JSONObject()
                .put("id", "c3").put("nombre", "María")
                .put("saldo", 30).put("cuentas", 1));
            return new JSONObject()
                .put("total", 360)
                .put("cantidad", 3)
                .put("clientes", clientes);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    public void reconoceLasFrasesDeDeuda() {
        assertTrue(ConsultaDeuda.esConsulta("cuanto debe juan"));
        assertTrue(ConsultaDeuda.esConsulta("las deudas"));
        assertTrue(ConsultaDeuda.esConsulta("quien me debe mas"));
        assertFalse(ConsultaDeuda.esConsulta("cuanto debo"));
        assertFalse(ConsultaDeuda.esConsulta("vende dos panes"));
        assertFalse(ConsultaDeuda.esConsulta("cuanto cuesta el pan"));
    }

    @Test
    public void extraeElNombreDicho() {
        assertEquals("juan", ConsultaDeuda.extraerCliente("cuanto debe juan"));
        assertEquals("juan perez", ConsultaDeuda.extraerCliente("cuanto debe juan perez"));
        assertEquals("juan", ConsultaDeuda.extraerCliente("cuanto debe juan por favor"));
        assertEquals("", ConsultaDeuda.extraerCliente("cuanto me deben"));
    }

    @Test
    public void leeElSaldoDeUnCliente() {
        assertEquals("Juan Pérez debe 250 pesos en 2 deudas",
            ConsultaDeuda.responder("cuanto debe juan perez", deudas()));
        assertEquals("María debe 30 pesos",
            ConsultaDeuda.responder("cuanto debe maria", deudas()));
    }

    @Test
    public void elNombreDePilaNoEligeCliente() {
        String resp = ConsultaDeuda.responder("cuanto debe juan", deudas());
        assertNotNull(resp);
        assertTrue(resp, resp.startsWith("Tengo 2 clientes parecidos"));
        assertTrue(resp, resp.contains("Juan Pérez debe 250 pesos"));
        assertTrue(resp, resp.contains("Juanita debe 80 pesos"));
        assertTrue(resp, resp.endsWith("Di el nombre completo"));
    }

    @Test
    public void elTotalDiceCuantosYQuienMasDebe() {
        String resp = ConsultaDeuda.responder("cuanto me deben", deudas());
        assertNotNull(resp);
        assertTrue(resp, resp.startsWith("En total me deben 360 pesos entre 3 clientes."));
        assertTrue(resp, resp.contains("El que más debe es Juan Pérez, con 250 pesos."));
    }

    @Test
    public void quienDebeMasEmpiezaPorElMayor() {
        String resp = ConsultaDeuda.responder("quien me debe mas", deudas());
        assertNotNull(resp);
        assertTrue(resp, resp.startsWith("El que más debe es Juan Pérez, con 250 pesos."));
    }

    @Test
    public void unClienteSinDeudaSeDiceTalCual() {
        assertEquals("No tengo deudas pendientes de ramon",
            ConsultaDeuda.responder("cuanto debe ramon", deudas()));
    }

    @Test
    public void sinDeudasNoSeInventaCifra() throws Exception {
        JSONObject vacio = new JSONObject().put("total", 0).put("cantidad", 0);
        assertEquals("No hay deudas pendientes",
            ConsultaDeuda.responder("cuanto me deben", vacio));
    }

    @Test
    public void sinSnapshotPideAbrirLaApp() {
        assertEquals("Abre la app para ver las deudas", ConsultaDeuda.responder("cuanto me deben", null));
    }

    @Test
    public void noRespondeOtrasConsultas() {
        assertNull(ConsultaDeuda.responder("cuanto cuesta el pan", deudas()));
    }

    @Test
    public void importesConCentavosUsanComa() {
        assertEquals("350", ConsultaDeuda.formatearMonto(350));
        assertEquals("350,50", ConsultaDeuda.formatearMonto(350.5));
        assertEquals("0", ConsultaDeuda.formatearMonto(0));
    }

    @Test
    public void laSimilitudCoincideConLaDelJs() {
        assertEquals(1.0, ConsultaDeuda.similitud("maria", "María"), 0.001);
        assertTrue(ConsultaDeuda.similitud("juan", "Juanita") >= ConsultaDeuda.UMBRAL);
        assertTrue(ConsultaDeuda.similitud("ramon", "María") < ConsultaDeuda.UMBRAL);
    }
}
