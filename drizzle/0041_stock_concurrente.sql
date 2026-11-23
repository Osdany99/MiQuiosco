-- Fase 0.4: la decisión FIFO puede leerse antes de que otra transacción
-- confirme. Esta guarda vuelve a comprobar el saldo bajo un lock por puesto en
-- el momento de escribir el libro, para TODOS los caminos (API y sync).
-- Solo rechaza un saldo negativo que empeora: una entrada puede reparar un
-- desajuste histórico sin quedar bloqueada por él.

CREATE OR REPLACE FUNCTION stock_comprobar_clave(
  p_puesto uuid,
  p_producto uuid,
  p_lote uuid,
  p_excluir uuid,
  p_antes_almacen integer,
  p_antes_quiosco integer,
  p_despues_almacen integer,
  p_despues_quiosco integer
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_base_almacen numeric;
  v_base_quiosco numeric;
  v_antes_almacen numeric;
  v_antes_quiosco numeric;
  v_despues_almacen numeric;
  v_despues_quiosco numeric;
BEGIN
  -- Primero el total del producto: cubre también movimientos legacy sin lote.
  SELECT
    COALESCE(SUM(delta_almacen) FILTER (WHERE id IS DISTINCT FROM p_excluir), 0),
    COALESCE(SUM(delta_quiosco) FILTER (WHERE id IS DISTINCT FROM p_excluir), 0)
  INTO v_base_almacen, v_base_quiosco
  FROM movimientos_inventario
  WHERE puesto_id = p_puesto
    AND producto_id = p_producto
    AND COALESCE(anulado, false) = false;

  v_antes_almacen := v_base_almacen + p_antes_almacen;
  v_antes_quiosco := v_base_quiosco + p_antes_quiosco;
  v_despues_almacen := v_base_almacen + p_despues_almacen;
  v_despues_quiosco := v_base_quiosco + p_despues_quiosco;

  IF v_despues_almacen < 0 AND v_despues_almacen < v_antes_almacen THEN
    RAISE EXCEPTION 'stock_concurrente: almacén queda en % (antes %) para producto % / lote %',
      v_despues_almacen, v_antes_almacen, p_producto, COALESCE(p_lote::text, 'total')
      USING ERRCODE = 'P0409';
  END IF;
  IF v_despues_quiosco < 0 AND v_despues_quiosco < v_antes_quiosco THEN
    RAISE EXCEPTION 'stock_concurrente: quiosco queda en % (antes %) para producto % / lote %',
      v_despues_quiosco, v_antes_quiosco, p_producto, COALESCE(p_lote::text, 'total')
      USING ERRCODE = 'P0409';
  END IF;

  -- El total puede quedar en cero mientras el lote FIFO queda en -1: también
  -- se valida la clave exacta del lote afectado.
  IF p_lote IS NOT NULL THEN
    SELECT
      COALESCE(SUM(delta_almacen) FILTER (WHERE id IS DISTINCT FROM p_excluir), 0),
      COALESCE(SUM(delta_quiosco) FILTER (WHERE id IS DISTINCT FROM p_excluir), 0)
    INTO v_base_almacen, v_base_quiosco
    FROM movimientos_inventario
    WHERE puesto_id = p_puesto
      AND producto_id = p_producto
      AND lote_id = p_lote
      AND COALESCE(anulado, false) = false;

    v_antes_almacen := v_base_almacen + p_antes_almacen;
    v_antes_quiosco := v_base_quiosco + p_antes_quiosco;
    v_despues_almacen := v_base_almacen + p_despues_almacen;
    v_despues_quiosco := v_base_quiosco + p_despues_quiosco;

    IF v_despues_almacen < 0 AND v_despues_almacen < v_antes_almacen THEN
      RAISE EXCEPTION 'stock_concurrente: almacén del lote % queda en % (antes %)',
        p_lote, v_despues_almacen, v_antes_almacen USING ERRCODE = 'P0409';
    END IF;
    IF v_despues_quiosco < 0 AND v_despues_quiosco < v_antes_quiosco THEN
      RAISE EXCEPTION 'stock_concurrente: quiosco del lote % queda en % (antes %)',
        p_lote, v_despues_quiosco, v_antes_quiosco USING ERRCODE = 'P0409';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION stock_guardar_movimiento() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_puesto uuid;
BEGIN
  -- Una sola clave por puesto evita deadlocks por pedidos multiproducto en
  -- distinto orden. Se libera automáticamente con COMMIT/ROLLBACK.
  IF TG_OP = 'UPDATE' AND OLD.puesto_id IS DISTINCT FROM NEW.puesto_id THEN
    PERFORM pg_advisory_xact_lock(20404, hashtext(least(OLD.puesto_id::text, NEW.puesto_id::text)));
    PERFORM pg_advisory_xact_lock(20404, hashtext(greatest(OLD.puesto_id::text, NEW.puesto_id::text)));
  ELSE
    v_puesto := CASE WHEN TG_OP = 'DELETE' THEN OLD.puesto_id ELSE NEW.puesto_id END;
    PERFORM pg_advisory_xact_lock(20404, hashtext(v_puesto::text));
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM stock_comprobar_clave(
      NEW.puesto_id, NEW.producto_id, NEW.lote_id, NULL,
      0, 0,
      CASE WHEN COALESCE(NEW.anulado, false) THEN 0 ELSE NEW.delta_almacen END,
      CASE WHEN COALESCE(NEW.anulado, false) THEN 0 ELSE NEW.delta_quiosco END
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM stock_comprobar_clave(
      OLD.puesto_id, OLD.producto_id, OLD.lote_id, OLD.id,
      CASE WHEN COALESCE(OLD.anulado, false) THEN 0 ELSE OLD.delta_almacen END,
      CASE WHEN COALESCE(OLD.anulado, false) THEN 0 ELSE OLD.delta_quiosco END,
      0, 0
    );
    RETURN OLD;
  END IF;

  IF OLD.puesto_id IS NOT DISTINCT FROM NEW.puesto_id
    AND OLD.producto_id IS NOT DISTINCT FROM NEW.producto_id
    AND OLD.lote_id IS NOT DISTINCT FROM NEW.lote_id THEN
    -- En una actualización sobre la misma clave hay que valorar el neto final;
    -- comprobar por separado quitar OLD y poner NEW daría falsos positivos.
    PERFORM stock_comprobar_clave(
      NEW.puesto_id, NEW.producto_id, NEW.lote_id, OLD.id,
      CASE WHEN COALESCE(OLD.anulado, false) THEN 0 ELSE OLD.delta_almacen END,
      CASE WHEN COALESCE(OLD.anulado, false) THEN 0 ELSE OLD.delta_quiosco END,
      CASE WHEN COALESCE(NEW.anulado, false) THEN 0 ELSE NEW.delta_almacen END,
      CASE WHEN COALESCE(NEW.anulado, false) THEN 0 ELSE NEW.delta_quiosco END
    );
  ELSE
    PERFORM stock_comprobar_clave(
      OLD.puesto_id, OLD.producto_id, OLD.lote_id, OLD.id,
      CASE WHEN COALESCE(OLD.anulado, false) THEN 0 ELSE OLD.delta_almacen END,
      CASE WHEN COALESCE(OLD.anulado, false) THEN 0 ELSE OLD.delta_quiosco END,
      0, 0
    );
    PERFORM stock_comprobar_clave(
      NEW.puesto_id, NEW.producto_id, NEW.lote_id, OLD.id,
      0, 0,
      CASE WHEN COALESCE(NEW.anulado, false) THEN 0 ELSE NEW.delta_almacen END,
      CASE WHEN COALESCE(NEW.anulado, false) THEN 0 ELSE NEW.delta_quiosco END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS movimientos_stock_concurrente ON movimientos_inventario;
CREATE TRIGGER movimientos_stock_concurrente
BEFORE INSERT OR UPDATE OR DELETE ON movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION stock_guardar_movimiento();
