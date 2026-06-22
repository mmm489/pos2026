-- Migration v16: add Chai to Receptes.

DO $$
DECLARE
  receptes_id INTEGER;
  current_id INTEGER;
  next_order INTEGER;
BEGIN
  SELECT id INTO receptes_id
  FROM pos.categories
  WHERE lower(name) = lower('RECEPTES')
  LIMIT 1;

  IF receptes_id IS NULL THEN
    RAISE NOTICE 'Category RECEPTES not found; CHAI was not created.';
    RETURN;
  END IF;

  SELECT id INTO current_id
  FROM pos.products
  WHERE category_id = receptes_id
    AND lower(name) = lower('CHAI')
  LIMIT 1;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO next_order
  FROM pos.products
  WHERE category_id = receptes_id;

  IF current_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('CHAI', receptes_id, 7.30, 10, true, next_order);
  ELSE
    UPDATE pos.products
    SET price = 7.30,
        vat_rate = 10,
        active = true,
        sort_order = COALESCE(sort_order, next_order)
    WHERE id = current_id;
  END IF;
END $$;
