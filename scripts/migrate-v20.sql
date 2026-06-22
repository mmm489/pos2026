-- Migration v20: add yogurt granissat.

DO $$
DECLARE
  granissats_id INTEGER;
  current_id INTEGER;
BEGIN
  SELECT id INTO granissats_id
  FROM pos.categories
  WHERE lower(name) = lower('GRANISSATS')
  LIMIT 1;

  IF granissats_id IS NULL THEN
    RAISE NOTICE 'Category GRANISSATS not found; GRANITZAT IOGURT was not created.';
    RETURN;
  END IF;

  SELECT id INTO current_id
  FROM pos.products
  WHERE category_id = granissats_id
    AND lower(name) = lower('GRANITZAT IOGURT')
  LIMIT 1;

  IF current_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('GRANITZAT IOGURT', granissats_id, 4.90, 10, true, 11);
  ELSE
    UPDATE pos.products
    SET price = 4.90,
        vat_rate = 10,
        active = true,
        sort_order = 11
    WHERE id = current_id;
  END IF;
END $$;
