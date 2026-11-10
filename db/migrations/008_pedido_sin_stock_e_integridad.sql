BEGIN;

INSERT INTO permiso (codigo, modulo, descripcion)
VALUES ('mayorista.preparar_sin_stock', 'mayorista',
        'Preparar pedidos aunque el stock del sistema no alcance (deja constancia y puede dejar stock negativo)');

-- Los renglones solo se pueden tocar mientras el pedido está PENDIENTE
CREATE OR REPLACE FUNCTION bloquear_items_pedido_no_pendiente() RETURNS trigger AS $$
DECLARE v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM pedido_mayorista WHERE id = COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF v_estado IS NOT NULL AND v_estado <> 'PENDIENTE' THEN
    RAISE EXCEPTION 'No se pueden modificar los renglones de un pedido %', v_estado;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pedido_item_solo_pendiente
BEFORE INSERT OR UPDATE OR DELETE ON pedido_item
FOR EACH ROW EXECUTE FUNCTION bloquear_items_pedido_no_pendiente();

COMMIT;