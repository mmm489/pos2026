-- v22: clarify Kinder and add Granola in the custom ACAI/Frozzen topping categories.

DO $$
DECLARE
  cremas_id INTEGER;
  crunchy_id INTEGER;
  current_id INTEGER;
  next_order INTEGER;
  product_seq TEXT;
BEGIN
  SELECT pg_get_serial_sequence('pos.products', 'id') INTO product_seq;
  IF product_seq IS NOT NULL THEN
    PERFORM setval(product_seq::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.products), true);
  END IF;

  SELECT id INTO cremas_id
  FROM pos.categories
  WHERE lower(name) = lower('CREMAS')
  LIMIT 1;

  IF cremas_id IS NOT NULL THEN
    SELECT id INTO current_id
    FROM pos.products
    WHERE category_id = cremas_id
      AND lower(name) = lower('KINDER SALSA')
    LIMIT 1;

    IF current_id IS NULL THEN
      UPDATE pos.products
      SET name = 'KINDER SALSA',
          price = 0.00,
          vat_rate = 10,
          active = true
      WHERE category_id = cremas_id
        AND lower(name) = lower('KINDER');
    ELSE
      UPDATE pos.products
      SET price = 0.00,
          vat_rate = 10,
          active = true
      WHERE id = current_id;

      UPDATE pos.products
      SET active = false
      WHERE category_id = cremas_id
        AND lower(name) = lower('KINDER')
        AND id <> current_id;
    END IF;
  END IF;

  SELECT id INTO crunchy_id
  FROM pos.categories
  WHERE lower(name) = lower('CRUNCHY')
  LIMIT 1;

  IF crunchy_id IS NOT NULL THEN
    SELECT id INTO current_id
    FROM pos.products
    WHERE category_id = crunchy_id
      AND lower(name) = lower('KINDER GALLETA')
    LIMIT 1;

    IF current_id IS NULL THEN
      SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order
      FROM pos.products
      WHERE category_id = crunchy_id;

      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES ('KINDER GALLETA', crunchy_id, 0.00, 10, true, next_order);
    ELSE
      UPDATE pos.products
      SET price = 0.00,
          vat_rate = 10,
          active = true
      WHERE id = current_id;
    END IF;

    SELECT id INTO current_id
    FROM pos.products
    WHERE category_id = crunchy_id
      AND lower(name) = lower('GRANOLA')
    LIMIT 1;

    IF current_id IS NULL THEN
      SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order
      FROM pos.products
      WHERE category_id = crunchy_id;

      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES ('GRANOLA', crunchy_id, 0.00, 10, true, next_order);
    ELSE
      UPDATE pos.products
      SET price = 0.00,
          vat_rate = 10,
          active = true
      WHERE id = current_id;
    END IF;
  END IF;
END $$;
