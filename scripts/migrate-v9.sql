-- Hi Cream POS - topping pricing rules per product

ALTER TABLE pos.product_modifier_groups
ADD COLUMN IF NOT EXISTS included_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE pos.product_modifier_groups
ADD COLUMN IF NOT EXISTS extra_price NUMERIC(8,2) NOT NULL DEFAULT 0;
