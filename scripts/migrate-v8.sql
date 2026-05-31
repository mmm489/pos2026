-- Hi Cream POS - Modifier/toppings pages

CREATE TABLE IF NOT EXISTS pos.modifier_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS pos.modifier_group_categories (
  group_id INTEGER NOT NULL REFERENCES pos.modifier_groups(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES pos.categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, category_id)
);

CREATE TABLE IF NOT EXISTS pos.product_modifier_groups (
  product_id INTEGER PRIMARY KEY REFERENCES pos.products(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES pos.modifier_groups(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_modifier_groups_group
ON pos.product_modifier_groups(group_id);
