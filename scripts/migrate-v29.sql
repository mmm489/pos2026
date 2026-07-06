-- v29: make BERLINES HOT HELADO ask for one ice cream flavor.

DO $$
DECLARE
  sabors_category_id INTEGER;
  berlina_hot_id INTEGER;
  target_group_id INTEGER;
  seq_name TEXT;
BEGIN
  SELECT pg_get_serial_sequence('pos.modifier_groups', 'id') INTO seq_name;
  IF seq_name IS NOT NULL THEN
    PERFORM setval(seq_name::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.modifier_groups), true);
  END IF;

  SELECT id INTO sabors_category_id
  FROM pos.categories
  WHERE lower(name) = lower('SABORS')
  LIMIT 1;

  IF sabors_category_id IS NULL THEN
    RAISE NOTICE 'Category SABORS not found; BERLINES HOT HELADO was not configured.';
    RETURN;
  END IF;

  SELECT id INTO berlina_hot_id
  FROM pos.products
  WHERE lower(name) IN (
    lower('BERLINES HOT HELADO'),
    lower('BERLINA HOT HELADO'),
    lower('BERLINA HOT')
  )
  ORDER BY
    CASE
      WHEN lower(name) = lower('BERLINES HOT HELADO') THEN 0
      WHEN lower(name) = lower('BERLINA HOT HELADO') THEN 1
      ELSE 2
    END
  LIMIT 1;

  IF berlina_hot_id IS NULL THEN
    RAISE NOTICE 'Product BERLINES HOT HELADO not found; flavor selector was not configured.';
    RETURN;
  END IF;

  INSERT INTO pos.modifier_groups (name, description, sort_order, active)
  VALUES ('Sabor gelat BERLINES HOT', 'Escollir 1 sabor de gelat per BERLINES HOT HELADO', 18, true)
  ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order,
      active = true
  RETURNING id INTO target_group_id;

  INSERT INTO pos.modifier_group_categories (group_id, category_id, sort_order)
  VALUES (target_group_id, sabors_category_id, 0)
  ON CONFLICT (group_id, category_id) DO UPDATE
  SET sort_order = EXCLUDED.sort_order;

  INSERT INTO pos.product_modifier_groups (product_id, group_id, included_count, extra_price)
  VALUES (berlina_hot_id, target_group_id, 1, 0.00)
  ON CONFLICT (product_id) DO UPDATE
  SET group_id = EXCLUDED.group_id,
      included_count = EXCLUDED.included_count,
      extra_price = EXCLUDED.extra_price;
END $$;
