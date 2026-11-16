package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * IntencionVenta — lectura de ventas dictadas (subconjunto nativo de la
 * gramática JS). Se prueba aquí y no desde node porque su contrato es "lo que
 * entiende el servicio con la app cerrada".
 */
public class IntencionVentaTest {

    private final IntencionVenta lector = IntencionVenta.porDefecto();

    @Test
    public void leeVerboCantidadYProducto() {
        IntencionVenta.Intencion i = lector.leer("vende dos panes");
        assertEquals(IntencionVenta.Tipo.VENTA, i.tipo);
        assertEquals(2, i.cantidad);
        assertEquals("panes", i.producto);
        // Sin ubicación dictada, la venta sale del almacén.
        assertEquals("almacen", i.ubicacion);
        assertFalse(i.varios);
    }

    @Test
    public void aceptaDigitosYUbicacion() {
        IntencionVenta.Intencion i = lector.leer("vendeme 3 refrescos del quiosco");
        assertEquals(IntencionVenta.Tipo.VENTA, i.tipo);
        assertEquals(3, i.cantidad);
        assertEquals("refrescos", i.producto);
        assertEquals("quiosco", i.ubicacion);
    }

    @Test
    public void entiendeAlmacenYDeposito() {
        assertEquals("almacen", lector.leer("vende un pan del almacen").ubicacion);
        assertEquals("almacen", lector.leer("vende un pan del deposito").ubicacion);
    }

    @Test
    public void conservaElNombreCompuesto() {
        IntencionVenta.Intencion i = lector.leer("vende un pan de leche");
        assertEquals(IntencionVenta.Tipo.VENTA, i.tipo);
        assertEquals(1, i.cantidad);
        assertEquals("pan de leche", i.producto);
    }

    @Test
    public void entiendeDocena() {
        IntencionVenta.Intencion i = lector.leer("vende una docena de panes");
        assertEquals(IntencionVenta.Tipo.VENTA, i.tipo);
        assertEquals(12, i.cantidad);
    }

    @Test
    public void sinCantidadAsumeUno() {
        IntencionVenta.Intencion i = lector.leer("anota refrescos");
        assertEquals(IntencionVenta.Tipo.VENTA, i.tipo);
        assertEquals(1, i.cantidad);
        assertEquals("refrescos", i.producto);
    }

    @Test
    public void detectaVariosProductos() {
        IntencionVenta.Intencion i = lector.leer("vende dos panes y un refresco");
        assertTrue(i.varios);
    }

    @Test
    public void sinVerboNoEsVenta() {
        assertEquals(IntencionVenta.Tipo.NO_VENTA, lector.leer("hola, buenos días").tipo);
        assertEquals(IntencionVenta.Tipo.NO_VENTA, lector.leer("mañana compro refrescos").tipo);
        assertEquals(IntencionVenta.Tipo.NO_VENTA, lector.leer("").tipo);
    }

    @Test
    public void conVerboSinProductoPideElNombre() {
        IntencionVenta.Intencion i = lector.leer("vende dos");
        assertEquals(IntencionVenta.Tipo.SIN_PRODUCTO, i.tipo);
        assertEquals(2, i.cantidad);
    }

    @Test
    public void toleraAcentosYMayusculas() {
        IntencionVenta.Intencion i = lector.leer("VÉNDEME DOS PANES DEL ALMACÉN");
        assertEquals(IntencionVenta.Tipo.VENTA, i.tipo);
        assertEquals(2, i.cantidad);
        assertEquals("almacen", i.ubicacion);
    }

    @Test
    public void corrigeLaCantidadEnLaConfirmacion() {
        assertEquals(3, lector.cantidadCorregida("no, eran tres", 2));
        assertEquals(5, lector.cantidadCorregida("cambia a cinco", 2));
        assertEquals(6, lector.cantidadCorregida("son seis", 2));
        assertEquals(12, lector.cantidadCorregida("pon una docena", 2));
        assertEquals(24, lector.cantidadCorregida("eran dos docenas", 2));
        assertEquals(15, lector.cantidadCorregida("no, eran 15", 2));
    }

    @Test
    public void noConfundeUnSiONoNormalConUnaCorreccion() {
        assertEquals(-1, lector.cantidadCorregida("sí", 2));
        assertEquals(-1, lector.cantidadCorregida("no", 2));
        assertEquals(-1, lector.cantidadCorregida("no gracias", 2));
        assertEquals(-1, lector.cantidadCorregida("vende dos panes", 2));
        assertEquals(-1, lector.cantidadCorregida("no, eran dos", 2));
    }
}
