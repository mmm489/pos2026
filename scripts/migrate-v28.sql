-- v28: add ICED COCO to Ice Drinks.

DO $$
DECLARE
  ice_drinks_id INTEGER;
  product_seq TEXT;
BEGIN
  SELECT pg_get_serial_sequence('pos.products', 'id') INTO product_seq;
  IF product_seq IS NOT NULL THEN
    PERFORM setval(product_seq::regclass, (SELECT COALESCE(MAX(id), 1) FROM pos.products), true);
  END IF;

  SELECT id INTO ice_drinks_id
  FROM pos.categories
  WHERE lower(name) = lower('ICE DRINKS')
  LIMIT 1;

  IF ice_drinks_id IS NULL THEN
    RAISE NOTICE 'Category ICE DRINKS not found; ICED COCO was not created.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pos.products
    WHERE category_id = ice_drinks_id
      AND lower(name) = lower('ICED COCO')
  ) THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('ICED COCO', ice_drinks_id, 4.90, 10, true, 9);
  ELSE
    UPDATE pos.products
    SET price = 4.90,
        vat_rate = 10,
        active = true,
        sort_order = 9
    WHERE category_id = ice_drinks_id
      AND lower(name) = lower('ICED COCO');
  END IF;
END $$;
