-- v23: add a long-press "SIN NATA" option for every Frappe.

DO $$
DECLARE
  frappes_category_id INTEGER;
  extres_category_id INTEGER;
  sin_nata_id INTEGER;
  target_group_id INTEGER;
  seq_name TEXT;
BEGIN
  SELECT pg_get_serial_sequence('pos.categories', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    PERFORM setval(seq_name::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.categories), true);
  END IF;

  SELECT pg_get_serial_sequence('pos.products', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    PERFORM setval(seq_name::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.products), true);
  END IF;

  SELECT pg_get_serial_sequence('pos.modifier_groups', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    PERFORM setval(seq_name::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.modifier_groups), true);
  END IF;

  SELECT id INTO frappes_category_id
  FROM pos.categories
  WHERE lower(name) = lower('FRAPPES')
  LIMIT 1;

  IF frappes_category_id IS NULL THEN
    RAISE NOTICE 'Category FRAPPES not found; Extres FRAPPES was not configured.';
    RETURN;
  END IF;

  SELECT id INTO extres_category_id
  FROM pos.categories
  WHERE lower(name) = lower('EXTRES FRAPPES')
  LIMIT 1;

  IF extres_category_id IS NULL THEN
    INSERT INTO pos.categories (name, sort_order, color)
    VALUES ('EXTRES FRAPPES', 35, '#F0E8D6')
    RETURNING id INTO extres_category_id;
  ELSE
    UPDATE pos.categories
    SET sort_order = 35,
        color = '#F0E8D6'
    WHERE id = extres_category_id;
  END IF;

  SELECT id INTO sin_nata_id
  FROM pos.products
  WHERE category_id = extres_category_id
    AND lower(name) = lower('SIN NATA')
  LIMIT 1;

  IF sin_nata_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('SIN NATA', extres_category_id, 0.00, 10, true, 1)
    RETURNING id INTO sin_nata_id;
  ELSE
    UPDATE pos.products
    SET price = 0.00,
        vat_rate = 10,
        active = true,
        sort_order = 1
    WHERE id = sin_nata_id;
  END IF;

  INSERT INTO pos.modifier_groups (name, description, sort_order, active)
  VALUES ('Extres FRAPPES', 'Opcions sense cost per als frappes', 16, true)
  ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      active = true
  RETURNING id INTO target_group_id;

  INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
  VALUES (target_group_id, extres_category_id, 0)
  ON CONFLICT (group_id, category_id) DO UPDATE
  SET sort_order = EXCLUDED.sort_order;

  INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
  SELECT p.id, target_group_id, 1, 0.00
  FROM pos.products p
  WHERE p.category_id = frappes_category_id
    AND p.active = true
  ON CONFLICT (product_id) DO UPDATE
  SET group_id = EXCLUDED.group_id,
      included_count = EXCLUDED.included_count,
      extra_price = EXCLUDED.extra_price;
END $$;
