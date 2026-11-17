package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * RepeticionVoz — «repite» y «ayuda» con la app cerrada.
 *
 * Solo se prueba el selector de frase y el estado vacío: hablar y escuchar es
 * responsabilidad del servicio.
 */
public class RepeticionVozTest {

    @Test
    public void reconoceLasFormasDePedirRepeticion() {
        assertTrue(RepeticionVoz.pideRepetir("repite"));
        assertTrue(RepeticionVoz.pideRepetir("Repítelo."));
        assertTrue(RepeticionVoz.pideRepetir("otra vez"));
        assertTrue(RepeticionVoz.pideRepetir("¿Qué dijiste?"));
        assertTrue(RepeticionVoz.pideRepetir("como dijiste"));
    }

    @Test
    public void noConfundeUnaVentaConUnaRepeticion() {
        assertFalse(RepeticionVoz.pideRepetir("vende dos panes"));
        assertFalse(RepeticionVoz.pideRepetir("repite la deuda de Juan"));
        assertFalse(RepeticionVoz.pideRepetir(""));
        assertFalse(RepeticionVoz.pideRepetir(null));
    }

    @Test
    public void reconoceLasFormasDePedirAyuda() {
        assertTrue(RepeticionVoz.pideAyuda("ayuda"));
        assertTrue(RepeticionVoz.pideAyuda("¿Qué puedes hacer?"));
        assertTrue(RepeticionVoz.pideAyuda("comandos"));
        assertTrue(RepeticionVoz.pideAyuda("para qué sirves"));
    }

    @Test
    public void noTomaUnaConsultaPorAyuda() {
        assertFalse(RepeticionVoz.pideAyuda("cuánto cuesta el pan"));
        assertFalse(RepeticionVoz.pideAyuda("cómo va el día"));
        assertFalse(RepeticionVoz.pideAyuda(null));
    }

    @Test
    public void repiteLaUltimaFraseDicha() {
        assertEquals("Hoy: 3 ventas por 150 pesos",
            RepeticionVoz.paraRepetir("  Hoy: 3 ventas por 150 pesos  "));
    }

    @Test
    public void sinRespuestaPreviaNoInventa() {
        assertNull(RepeticionVoz.paraRepetir(null));
        assertNull(RepeticionVoz.paraRepetir(""));
        assertNull(RepeticionVoz.paraRepetir("   "));
    }
}
