-- Migration v17: clarify Kinder toppings by adding a separate biscuit option.

DO $$
DECLARE
  target_category_id INTEGER;
  current_id INTEGER;
BEGIN
  SELECT id INTO target_category_id
  FROM pos.categories
  WHERE lower(name) = lower('TOPPINGS')
  LIMIT 1;

  IF target_category_id IS NOT NULL THEN
    SELECT id INTO current_id
    FROM pos.products
    WHERE category_id = target_category_id
      AND lower(name) = lower('KINDER GALLETA')
    LIMIT 1;

    IF current_id IS NULL THEN
      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES ('KINDER GALLETA', target_category_id, 0.00, 10, true, 13);
    ELSE
      UPDATE pos.products
      SET price = 0.00,
          vat_rate = 10,
          active = true,
          sort_order = 13
      WHERE id = current_id;
    END IF;
  END IF;

  SELECT id INTO target_category_id
  FROM pos.categories
  WHERE lower(name) = lower('TOPPING 1€ EXTRA')
  LIMIT 1;

  IF target_category_id IS NOT NULL THEN
    SELECT id INTO current_id
    FROM pos.products
    WHERE category_id = target_category_id
      AND lower(name) = lower('KINDER GALLETA 1€')
    LIMIT 1;

    IF current_id IS NULL THEN
      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES ('KINDER GALLETA 1€', target_category_id, 1.00, 10, true, 14);
    ELSE
      UPDATE pos.products
      SET price = 1.00,
          vat_rate = 10,
          active = true,
          sort_order = 14
      WHERE id = current_id;
    END IF;
  END IF;

  SELECT id INTO target_category_id
  FROM pos.categories
  WHERE lower(name) = lower('TOPPINGS 0,5€')
  LIMIT 1;

  IF target_category_id IS NOT NULL THEN
    SELECT id INTO current_id
    FROM pos.products
    WHERE category_id = target_category_id
      AND lower(name) = lower('KINDER GALLETA 0.5€')
    LIMIT 1;

    IF current_id IS NULL THEN
      INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
      VALUES ('KINDER GALLETA 0.5€', target_category_id, 0.50, 10, true, 13);
    ELSE
      UPDATE pos.products
      SET price = 0.50,
          vat_rate = 10,
          active = true,
          sort_order = 13
      WHERE id = current_id;
    END IF;
  END IF;
END $$;
