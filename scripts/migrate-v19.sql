-- Migration v19: add Crepe de la casa.

DO $$
DECLARE
  crepes_id INTEGER;
  current_id INTEGER;
BEGIN
  SELECT id INTO crepes_id
  FROM pos.categories
  WHERE lower(name) = lower('CREPES')
  LIMIT 1;

  IF crepes_id IS NULL THEN
    RAISE NOTICE 'Category CREPES not found; CREPE DE LA CASA was not created.';
    RETURN;
  END IF;

  SELECT id INTO current_id
  FROM pos.products
  WHERE category_id = crepes_id
    AND lower(name) = lower('CREPE DE LA CASA')
  LIMIT 1;

  IF current_id IS NULL THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('CREPE DE LA CASA', crepes_id, 2.00, 10, true, 11);
  ELSE
    UPDATE pos.products
    SET price = 2.00,
        vat_rate = 10,
        active = true,
        sort_order = 11
    WHERE id = current_id;
  END IF;
END $$;
