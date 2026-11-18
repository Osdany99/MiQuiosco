package com.myquiosco.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * IntencionCobro — «cobra 200 a Yunior» con la app cerrada y el reparto FIFO
 * que usa el snapshot. Paridad con `extraerCobroSlots` y `distribuirCobro`.
 */
public class IntencionCobroTest {

    private final IntencionVenta venta = IntencionVenta.porDefecto();
    private final IntencionCobro.Intencion conLector(String frase) {
        return IntencionCobro.leer(frase, venta);
    }

    @Test
    public void elLexicoDelPanelCambiaLosVerbosDeCobro() throws Exception {
        JSONObject lexico = new JSONObject();
        lexico.put("cobroVerbo", new JSONArray(java.util.Arrays.asList("cancela")));

        assertEquals(IntencionCobro.Tipo.COBRO,
            IntencionCobro.leer("cancela 200 a yunior", venta, lexico).tipo);
        // «cobra» ya no es verbo de cobro en el léxico efectivo.
        assertEquals(IntencionCobro.Tipo.NO_COBRO,
            IntencionCobro.leer("cobra 200 a yunior", venta, lexico).tipo);
    }

    @Test
    public void reconoceCobros() {
        assertTrue(IntencionCobro.esCobro("cobra 200 a yunior"));
        assertTrue(IntencionCobro.esCobro("cobra la deuda de maria"));
        assertTrue(IntencionCobro.esCobro("juan me pago 100"));
        assertFalse(IntencionCobro.esCobro("cuanto pago juan"));
        assertFalse(IntencionCobro.esCobro("cobra 2 panes"));
    }

    @Test
    public void leeImporteYCliente() {
        IntencionCobro.Intencion i = conLector("cobra 200 a yunior");
        assertEquals(IntencionCobro.Tipo.COBRO, i.tipo);
        assertEquals("yunior", i.cliente);
        assertEquals(200.0, i.monto, 0.001);
        assertFalse(i.todo);
        assertEquals("efectivo", i.formaPago);
    }

    @Test
    public void sinImporteCobraTodo() {
        IntencionCobro.Intencion i = conLector("cobra la deuda de maria");
        assertEquals(IntencionCobro.Tipo.COBRO, i.tipo);
        assertTrue(i.todo);
        assertEquals("maria", i.cliente);
    }

    @Test
    public void leeElClienteDelanteDelVerbo() {
        IntencionCobro.Intencion i = conLector("juan me pago 100");
        assertEquals(IntencionCobro.Tipo.COBRO, i.tipo);
        assertEquals("juan", i.cliente);
        assertEquals(100.0, i.monto, 0.001);
    }

    @Test
    public void entiendeNumerosEnPalabras() {
        IntencionCobro.Intencion i = conLector("cobra doscientos a yunior");
        assertEquals(IntencionCobro.Tipo.COBRO, i.tipo);
        assertEquals(200.0, i.monto, 0.001);
    }

    @Test
    public void detectaTransferencia() {
        assertEquals("transferencia", conLector("cobra 200 pesos a yunior por transferencia").formaPago);
    }

    @Test
    public void sinClienteLoDice() {
        assertEquals(IntencionCobro.Tipo.SIN_CLIENTE, conLector("cobra 200 a").tipo);
    }

    @Test
    public void unaVentaNoEsCobro() {
        assertEquals(IntencionCobro.Tipo.NO_COBRO, conLector("vende dos panes").tipo);
        assertEquals(IntencionCobro.Tipo.NO_COBRO, conLector("cobra 2 panes a juan").tipo);
    }

    @Test
    public void reparteFifoYRespetaElSaldo() throws Exception {
        JSONArray deudas = deudas();
        assertEquals(250.0, IntencionCobro.saldo(deudas), 0.001);

        java.util.List<IntencionCobro.Pago> pagos = IntencionCobro.repartir(deudas, 200);
        assertEquals(2, pagos.size());
        assertEquals("vieja", pagos.get(0).cuentaId);
        assertEquals(150.0, pagos.get(0).monto, 0.001);
        assertEquals("nueva", pagos.get(1).cuentaId);
        assertEquals(50.0, pagos.get(1).monto, 0.001);
        assertEquals(0.0, IntencionCobro.sobrante(deudas, 200), 0.001);
    }

    @Test
    public void detectaImporteExcedido() throws Exception {
        assertEquals(250.0, IntencionCobro.sobrante(deudas(), 500), 0.001);
    }

    @Test
    public void sinDeudasNoReparte() {
        assertTrue(IntencionCobro.repartir(new JSONArray(), 100).isEmpty());
        assertEquals(0.0, IntencionCobro.saldo(new JSONArray()), 0.001);
    }

    private static JSONArray deudas() throws Exception {
        JSONArray lista = new JSONArray();
        lista.put(new JSONObject().put("id", "nueva").put("creadoEn", 3000).put("saldo", 100));
        lista.put(new JSONObject().put("id", "vieja").put("creadoEn", 1000).put("saldo", 150));
        lista.put(new JSONObject().put("id", "pagada").put("creadoEn", 2000).put("saldo", 0));
        return lista;
    }
}
