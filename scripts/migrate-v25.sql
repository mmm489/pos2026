-- v25: consolidate PACK 3 XURROS into one base product with required options.

DO $$
DECLARE
  xurros_category_id INTEGER;
  options_category_id INTEGER;
  pack_product_id INTEGER;
  target_group_id INTEGER;
  seq_name TEXT;
  option_row RECORD;
  option_product_id INTEGER;
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

  SELECT id INTO xurros_category_id
  FROM pos.categories
  WHERE lower(name) = lower('XURROS')
  LIMIT 1;

  IF xurros_category_id IS NULL THEN
    RAISE NOTICE 'Category XURROS not found; PACK 3 XURROS was not configured.';
    RETURN;
  END IF;

  SELECT id INTO pack_product_id
  FROM pos.products
  WHERE category_id = xurros_category_id
    AND lower(name) = lower('PACK 3 XURROS')
  LIMIT 1;

  IF pack_product_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('PACK 3 XURROS', xurros_category_id, 3.30, 10, true, 3)
    RETURNING id INTO pack_product_id;
  ELSE
    UPDATE pos.products
    SET price = 3.30,
        vat_rate = 10,
        active = true,
        sort_order = 3
    WHERE id = pack_product_id;
  END IF;

  UPDATE pos.products
  SET active = false
  WHERE category_id = xurros_category_id
    AND lower(name) IN (
      lower('PACK 3 XURROS SUCRE'),
      lower('PACK 3 XURROS XOCOLATA'),
      lower('PACK 3 XURROS PISTATXO'),
      lower('PACK 3 XURROS XOCO B'),
      lower('MADUIXA')
    );

  SELECT id INTO options_category_id
  FROM pos.categories
  WHERE lower(name) = lower('OPCIONS XURROS')
  LIMIT 1;

  IF options_category_id IS NULL THEN
    INSERT INTO pos.categories (name, sort_order, color)
    VALUES ('OPCIONS XURROS', 36, '#F6D9A8')
    RETURNING id INTO options_category_id;
  ELSE
    UPDATE pos.categories
    SET sort_order = 36,
        color = '#F6D9A8'
    WHERE id = options_category_id;
  END IF;

  FOR option_row IN
    SELECT *
    FROM (
      VALUES
        ('SUCRE', 0.00::numeric, 1),
        ('PISTATXO', 2.00::numeric, 2),
        ('XOCO BLANC', 2.00::numeric, 3),
        ('XOCO NEGRE', 2.00::numeric, 4),
        ('MADUIXA', 2.00::numeric, 5)
    ) AS options(name, price, sort_order)
  LOOP
    SELECT id INTO option_product_id
    FROM pos.products
    WHERE category_id = options_category_id
      AND lower(name) = lower(option_row.name)
    LIMIT 1;

    IF option_product_id IS NULL THEN
      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES (option_row.name, options_category_id, option_row.price, 10, true, option_row.sort_order);
    ELSE
      UPDATE pos.products
      SET price = option_row.price,
          vat_rate = 10,
          active = true,
          sort_order = option_row.sort_order
      WHERE id = option_product_id;
    END IF;
  END LOOP;

  INSERT INTO pos.modifier_groups (name, description, sort_order, active)
  VALUES ('Opcions PACK 3 XURROS', 'Opcio obligatoria per PACK 3 XURROS', 17, true)
  ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      active = true
  RETURNING id INTO target_group_id;

  INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
  VALUES (target_group_id, options_category_id, 0)
  ON CONFLICT (group_id, category_id) DO UPDATE
  SET sort_order = EXCLUDED.sort_order;

  INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
  VALUES (pack_product_id, target_group_id, 1, 0.00)
  ON CONFLICT (product_id) DO UPDATE
  SET group_id = EXCLUDED.group_id,
      included_count = EXCLUDED.included_count,
      extra_price = EXCLUDED.extra_price;
END $$;
