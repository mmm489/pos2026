-- Add a real catalog product used by the POS custom amount button.
-- It lives in VARIOS so order_items keeps a valid product_id, VAT and reporting identity.

DO $$
DECLARE
  varios_id INTEGER;
BEGIN
  SELECT id INTO varios_id
  FROM pos.categories
  WHERE lower(name) = lower('VARIOS')
  LIMIT 1;

  IF varios_id IS NULL THEN
    INSERT INTO pos.categories (name, sort_order, color)
    VALUES ('VARIOS', 99, '#6B7280')
    RETURNING id INTO varios_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pos.products
    WHERE lower(name) = lower('IMPORTE LIBRE')
  ) THEN
    INSERT INTO pos.products (name, category_id, price, vat_rate, active, sort_order)
    VALUES ('IMPORTE LIBRE', varios_id, 0.00, 10, true, 99);
  ELSE
    UPDATE pos.products
    SET category_id = varios_id,
        vat_rate = 10,
        active = true
    WHERE lower(name) = lower('IMPORTE LIBRE');
  END IF;
END $$;
