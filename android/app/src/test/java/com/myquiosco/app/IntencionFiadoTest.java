package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * IntencionFiado — lectura de «fía dos panes a Juan» con la app cerrada.
 * Paridad con `extraerFiadoSlots` (shared/voz/gramatica.js).
 */
public class IntencionFiadoTest {

    private final IntencionFiado lector = new IntencionFiado(IntencionVenta.porDefecto());

    @Test
    public void reconoceElVerboDeFiar() {
        assertTrue(IntencionFiado.esFiado("fia dos panes a juan"));
        assertTrue(IntencionFiado.esFiado("anota fiado dos panes a juan"));
        assertFalse(IntencionFiado.esFiado("cuanto tengo fiado"));
        assertFalse(IntencionFiado.esFiado("vende dos panes"));
    }

    @Test
    public void separaProductoCantidadYCliente() {
        IntencionFiado.Intencion i = lector.leer("fia dos panes a juan");
        assertEquals(IntencionFiado.Tipo.FIADO, i.tipo);
        assertEquals("panes", i.producto);
        assertEquals(2, i.cantidad);
        assertEquals("juan", i.cliente);
        // Sin ubicación dictada, el fiado sale del almacén.
        assertEquals("almacen", i.ubicacion);
    }

    @Test
    public void respetaLaUbicacionDicha() {
        IntencionFiado.Intencion i = lector.leer("fia tres refrescos del quiosco a maria");
        assertEquals(IntencionFiado.Tipo.FIADO, i.tipo);
        assertEquals("refrescos", i.producto);
        assertEquals(3, i.cantidad);
        assertEquals("quiosco", i.ubicacion);
    }

    @Test
    public void conservaApellidosYParticulas() {
        assertEquals("juan perez", lector.leer("fia dos panes a juan perez").cliente);
        assertEquals("la senora de juan", lector.leer("fia dos panes a la senora de juan").cliente);
    }

    @Test
    public void unProductoConDeNoSePartePorElCliente() {
        IntencionFiado.Intencion i = lector.leer("fia dos panes de leche a maria");
        assertEquals("panes de leche", i.producto);
        assertEquals("maria", i.cliente);
    }

    @Test
    public void sinClienteLoDice() {
        IntencionFiado.Intencion i = lector.leer("fia dos panes");
        assertEquals(IntencionFiado.Tipo.SIN_CLIENTE, i.tipo);
        assertEquals("panes", i.producto);
    }

    @Test
    public void sinProductoLoDice() {
        IntencionFiado.Intencion i = lector.leer("fia a juan");
        assertEquals(IntencionFiado.Tipo.SIN_PRODUCTO, i.tipo);
        assertEquals("juan", i.cliente);
    }

    @Test
    public void unaVentaNormalNoEsFiado() {
        IntencionFiado.Intencion i = lector.leer("vende dos panes");
        assertEquals(IntencionFiado.Tipo.NO_FIADO, i.tipo);
    }
}
