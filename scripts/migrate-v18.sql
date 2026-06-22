-- Migration v18: add Dought boxes of 12 and 16 units.

DO $$
DECLARE
  dought_id INTEGER;
  current_id INTEGER;
BEGIN
  SELECT id INTO dought_id
  FROM pos.categories
  WHERE lower(name) = lower('DOUGHT')
  LIMIT 1;

  IF dought_id IS NULL THEN
    RAISE NOTICE 'Category DOUGHT not found; Dought boxes 12/16 were not created.';
    RETURN;
  END IF;

  SELECT id INTO current_id
  FROM pos.products
  WHERE category_id = dought_id
    AND lower(name) = lower('DOGHT BOX 12 UD.')
  LIMIT 1;

  IF current_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('DOGHT BOX 12 UD.', dought_id, 11.90, 10, true, 3);
  ELSE
    UPDATE pos.products
    SET price = 11.90,
        vat_rate = 10,
        active = true,
        sort_order = 3
    WHERE id = current_id;
  END IF;

  SELECT id INTO current_id
  FROM pos.products
  WHERE category_id = dought_id
    AND lower(name) = lower('DOGHT BOX 16 UD.')
  LIMIT 1;

  IF current_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('DOGHT BOX 16 UD.', dought_id, 14.90, 10, true, 4);
  ELSE
    UPDATE pos.products
    SET price = 14.90,
        vat_rate = 10,
        active = true,
        sort_order = 4
    WHERE id = current_id;
  END IF;
END $$;
