-- v26: add LLET VEGETAL +0.30 as a long-press modifier for Especialitats.

DO $$
DECLARE
  especialitats_category_id INTEGER;
  extres_category_id INTEGER;
  temp_category_id INTEGER;
  mida_category_id INTEGER;
  target_group_id INTEGER;
  product_seq TEXT;
  category_seq TEXT;
  group_seq TEXT;
BEGIN
  SELECT pg_get_serial_sequence('pos.categories', 'id') INTO category_seq;
  IF category_seq IS NOT NULL THEN
    PERFORM setval(category_seq::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.categories), true);
  END IF;

  SELECT pg_get_serial_sequence('pos.products', 'id') INTO product_seq;
  IF product_seq IS NOT NULL THEN
    PERFORM setval(product_seq::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.products), true);
  END IF;

  SELECT pg_get_serial_sequence('pos.modifier_groups', 'id') INTO group_seq;
  IF group_seq IS NOT NULL THEN
    PERFORM setval(group_seq::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.modifier_groups), true);
  END IF;

  SELECT id INTO especialitats_category_id
  FROM pos.categories
  WHERE lower(name) = lower('ESPECIALITATS')
  LIMIT 1;

  IF especialitats_category_id IS NULL THEN
    RAISE NOTICE 'Category ESPECIALITATS not found; LLET VEGETAL was not configured.';
    RETURN;
  END IF;

  SELECT id INTO extres_category_id
  FROM pos.categories
  WHERE lower(name) = lower('EXTRES ESPECIALITATS')
  LIMIT 1;

  IF extres_category_id IS NULL THEN
    INSERT INTO pos.categories (name, sort_order, color)
    VALUES ('EXTRES ESPECIALITATS', 1048, '#F0E8D6')
    RETURNING id INTO extres_category_id;
  ELSE
    UPDATE pos.categories
    SET sort_order = 1048,
        color = '#F0E8D6'
    WHERE id = extres_category_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pos.products
    WHERE category_id = extres_category_id
      AND lower(name) = lower('LLET VEGETAL')
  ) THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('LLET VEGETAL', extres_category_id, 0.30, 10, true, 1);
  ELSE
    UPDATE pos.products
    SET price = 0.30,
        vat_rate = 10,
        active = true,
        sort_order = 1
    WHERE category_id = extres_category_id
      AND lower(name) = lower('LLET VEGETAL');
  END IF;

  INSERT INTO pos.modifier_groups (name, description, sort_order, active)
  VALUES (
    'Especialitats: temperatura i mida',
    'Fred o calent gratis; XL incrementa 1 euro; llet vegetal +0,30.',
    80,
    true
  )
  ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      active = true
  RETURNING id INTO target_group_id;

  SELECT id INTO temp_category_id
  FROM pos.categories
  WHERE lower(name) = lower('TEMPERATURA ESPECIALITATS')
  LIMIT 1;

  SELECT id INTO mida_category_id
  FROM pos.categories
  WHERE lower(name) = lower('MIDA ESPECIALITATS')
  LIMIT 1;

  IF temp_category_id IS NOT NULL THEN
    INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
    VALUES (target_group_id, temp_category_id, 0)
    ON CONFLICT (group_id, category_id) DO UPDATE
    SET sort_order = EXCLUDED.sort_order;
  END IF;

  IF mida_category_id IS NOT NULL THEN
    INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
    VALUES (target_group_id, mida_category_id, 1)
    ON CONFLICT (group_id, category_id) DO UPDATE
    SET sort_order = EXCLUDED.sort_order;
  END IF;

  INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
  VALUES (target_group_id, extres_category_id, 2)
  ON CONFLICT (group_id, category_id) DO UPDATE
  SET sort_order = EXCLUDED.sort_order;

  INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
  SELECT p.id, target_group_id, 0, 1.00
  FROM pos.products p
  WHERE p.category_id = especialitats_category_id
    AND p.active = true
  ON CONFLICT (product_id) DO UPDATE
  SET group_id = EXCLUDED.group_id,
      included_count = EXCLUDED.included_count,
      extra_price = EXCLUDED.extra_price;
END $$;
