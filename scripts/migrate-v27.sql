-- v27: add GRANITZAT BLUE to Granissats.

DO $$
DECLARE
  granissats_id INTEGER;
  product_seq TEXT;
BEGIN
  SELECT pg_get_serial_sequence('pos.products', 'id') INTO product_seq;
  IF product_seq IS NOT NULL THEN
    PERFORM setval(product_seq::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.products), true);
  END IF;

  SELECT id INTO granissats_id
  FROM pos.categories
  WHERE lower(name) = lower('GRANISSATS')
  LIMIT 1;

  IF granissats_id IS NULL THEN
    RAISE NOTICE 'Category GRANISSATS not found; GRANITZAT BLUE was not created.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pos.products
    WHERE category_id = granissats_id
      AND lower(name) = lower('GRANITZAT BLUE')
  ) THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('GRANITZAT BLUE', granissats_id, 4.90, 10, true, 12);
  ELSE
    UPDATE pos.products
    SET price = 4.90,
        vat_rate = 10,
        active = true,
        sort_order = 12
    WHERE category_id = granissats_id
      AND lower(name) = lower('GRANITZAT BLUE');
  END IF;
END $$;
