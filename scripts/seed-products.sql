-- ============================================================
-- Hi Cream POS - Product Seed Data
-- Generated from real POS sales report data
-- All prices are PVP (including 10% IVA)
-- ============================================================

BEGIN;

-- Clear existing data
TRUNCATE pos.order_items CASCADE;
TRUNCATE pos.orders CASCADE;
TRUNCATE pos.products CASCADE;
TRUNCATE pos.categories CASCADE;

-- Reset sequences
ALTER SEQUENCE pos.categories_id_seq RESTART WITH 1;
ALTER SEQUENCE pos.products_id_seq RESTART WITH 1;

-- ============================================================
-- CATEGORIES (27)
-- ============================================================
INSERT INTO pos.categories (id, name, sort_order, color) VALUES
  (1,  'BATUTS',           1,  '#8B5CF6'),
  (2,  'BEGUDES',          2,  '#3B82F6'),
  (3,  'BERLINES',         3,  '#FB923C'),
  (4,  'CAFES',            4,  '#92400E'),
  (5,  'ESPECIALITATS',    5,  '#D946EF'),
  (6,  'CREPES',           6,  '#EAB308'),
  (7,  'DOUGHT',           7,  '#F97316'),
  (8,  'FRAPPES',          8,  '#78350F'),
  (9,  'GELATS',           9,  '#EC4899'),
  (10, 'GRANISSATS',       10, '#34D399'),
  (11, 'HI POP',           11, '#F59E0B'),
  (12, 'ICE DRINKS',       12, '#06B6D4'),
  (13, 'RECEPTES',         13, '#F43F5E'),
  (14, 'SMOOTHIE',         14, '#10B981'),
  (15, 'FROZZEN IOGURT',   15, '#E879F9'),
  (16, 'XIPS',             16, '#84CC16'),
  (17, 'XURROS',           17, '#F97316'),
  (18, 'VARIOS',           18, '#6B7280'),
  (19, 'SABORS',           19, '#A78BFA'),
  (20, 'SALSAS I CREMES',  20, '#FDA4AF'),
  (21, 'TOPPINGS',         21, '#FBBF24'),
  (22, 'TOPPING GELAT 1€', 22, '#60A5FA'),
  (23, 'TOPPING 1€ EXTRA', 23, '#F472B6'),
  (24, 'TOPPING GELAT 2€', 24, '#2DD4BF'),
  (25, 'TOPPINGS 0,5€',    25, '#A855F7'),
  (26, 'INFUSIONS',        26, '#65A30D'),
  (27, 'ORXATA',           27, '#FCA5A5');

SELECT setval('pos.categories_id_seq', 27);

-- ============================================================
-- PRODUCTS
-- ============================================================

-- BATUTS (category 1) — all 5.90€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('BATUT GELAT',      1, 5.90, 10, 1),
  ('BATUT VAINILLA',   1, 5.90, 10, 2),
  ('BATUT XOCOLATA',   1, 5.90, 10, 3),
  ('BATUT MADUIXA',    1, 5.90, 10, 4),
  ('BATUT MANGO',      1, 5.90, 10, 5);

-- BEGUDES (category 2)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('7UP',                   2, 2.50, 10, 1),
  ('AIGUA 1,5',             2, 3.95, 10, 2),
  ('AIGUA AMB GAS',         2, 2.50, 10, 3),
  ('AIGUA 50 CC',           2, 1.95, 10, 4),
  ('AQUARIUS LLIMONA',      2, 2.95, 10, 5),
  ('BEGUDES VEINS',         2, 1.00, 10, 6),
  ('BITTER KAS',            2, 2.95, 10, 7),
  ('CACAOLAT',              2, 2.95, 10, 8),
  ('COKE',                  2, 2.50, 10, 9),
  ('COKE 00',               2, 2.50, 10, 10),
  ('DAMM LEMON',            2, 2.50, 10, 11),
  ('ESTRELLA',              2, 2.50, 10, 12),
  ('FANTA LLIMONA',         2, 2.50, 10, 13),
  ('FANTA TARONJA',         2, 2.50, 10, 14),
  ('FREE DAMM',             2, 2.50, 10, 15),
  ('GRANINI PIÑA',          2, 2.95, 10, 16),
  ('GRANINI PRÉSSEC',       2, 2.95, 10, 17),
  ('GRANINI TARONJA',       2, 2.95, 10, 18),
  ('NESTEA',                2, 2.95, 10, 19),
  ('FREE DAMM TORRADA',     2, 2.50, 10, 20),
  ('TONICA SWEPPES',        2, 2.95, 10, 21),
  ('CASA HI CREAM',         2, 0.50, 10, 22),
  ('VOLL-DAMM',             2, 2.95, 10, 23),
  ('HEINEKEN',              2, 2.95, 10, 24),
  ('VILADRAU',              2, 3.00, 10, 25);

-- BERLINES (category 3)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('MAX KINDER',            3, 3.95, 10, 1),
  ('MAX LOTUS',             3, 3.95, 10, 2),
  ('MAX OREO',              3, 3.95, 10, 3),
  ('MAX PISTACHO',          3, 3.95, 10, 4),
  ('MINI DONUT DECORAT',    3, 1.50, 10, 5),
  ('BERLINES HOT HELADO',   3, 4.95, 10, 6),
  ('MINI DONUT',            3, 1.00, 10, 7);

-- CAFES (category 4)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('CAFE AMB LLET',                 4, 2.25, 10, 1),
  ('CAFE AMB LLET DESCAFEÏNAT',     4, 2.25, 10, 2),
  ('CAFE I GELAT',                   4, 4.95, 10, 3),
  ('CAFE VEÏNS',                     4, 1.00, 10, 4),
  ('CAFÈ',                           4, 1.95, 10, 5),
  ('CAFÈ AMERICÀ',                   4, 2.00, 10, 6),
  ('CAFÉ DESCAFEINAT',               4, 1.95, 10, 7),
  ('CAPUCCINO',                      4, 2.75, 10, 8),
  ('CAPUCCINO DESCAFEINAT',          4, 2.75, 10, 9),
  ('DOBLE EXPRESSO',                 4, 3.25, 10, 10),
  ('TALLAT',                         4, 2.10, 10, 11),
  ('TALLAT DESCAFEÍNAT',             4, 2.10, 10, 12),
  ('XOCOLATA A LA TASSA',            4, 3.50, 10, 13),
  ('CAFE CASA',                      4, 0.50, 10, 14),
  ('COLA CAO',                       4, 2.50, 10, 15),
  ('BOMBO',                          4, 2.25, 10, 16);

-- ESPECIALITATS (category 5)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('MATCHA LATE',            5, 3.95, 10, 1),
  ('PISTACHO LATTE',         5, 4.20, 10, 2),
  ('CHAI LATE',              5, 3.95, 10, 3),
  ('MATCHA MADUIXA',         5, 4.95, 10, 4),
  ('MATCHA MANGO',           5, 4.95, 10, 5),
  ('MATCHA COCO',            5, 4.95, 10, 6),
  ('CHAI PISTATXO',          5, 4.95, 10, 7),
  ('CHAI XOCOLATA NEGRE',    5, 4.95, 10, 8),
  ('SPECIAL VAINILLA',       5, 4.40, 10, 9),
  ('SPECIAL CARAMEL',        5, 4.40, 10, 10),
  ('SPECIAL AVELLANA',       5, 4.40, 10, 11),
  ('SPECIAL MOCHA BLANC',    5, 4.40, 10, 12),
  ('SPECIAL MOCHA NEGRE',    5, 4.40, 10, 13),
  ('SPECIAL LOTUS',          5, 4.40, 10, 14);

-- CREPES (category 6)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('CREPE',                   6, 4.95, 10, 1),
  ('MEDITERRANEO',            6, 6.90, 10, 2),
  ('MIXTO',                   6, 6.90, 10, 3),
  ('QUESOS',                  6, 7.50, 10, 4),
  ('CREPE NUTELLA',           6, 4.95, 10, 5),
  ('CREPE PISTATXO',          6, 4.95, 10, 6),
  ('CREPE KINDER',            6, 4.95, 10, 7),
  ('CREPE XOCOLATA',          6, 4.95, 10, 8),
  ('CREPE XOCOLATA BLANCA',   6, 4.95, 10, 9),
  ('CREPE SALSA OREO',        6, 4.95, 10, 10),
  ('CREPE DE LA CASA',        6, 2.00, 10, 11);

-- DOUGHT (category 7)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('DOGHT BOX 6 UD.',  7, 7.50, 10, 1),
  ('DOGHT BOX 9 UD.',  7, 9.90, 10, 2),
  ('DOGHT BOX 12 UD.', 7, 11.90, 10, 3),
  ('DOGHT BOX 16 UD.', 7, 14.90, 10, 4);

-- FRAPPES (category 8)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('FRAPPE CLASIC',          8, 5.95, 10, 1),
  ('FRAPPE & NATA',          8, 6.90, 10, 2),
  ('FRAPPE MATCHA',          8, 6.90, 10, 3),
  ('FRAPUCCINO CANDY',       8, 6.90, 10, 4),
  ('FRAPUCCINO VAINILLA',    8, 6.90, 10, 5),
  ('FRAPPE PISTATXO',        8, 6.90, 10, 6);

-- GELATS (category 9)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('CUCURUTXO L',  9, 6.50, 10, 1),
  ('CUCURUTXO M',  9, 4.85, 10, 2),
  ('CUCURUTXO S',  9, 3.95, 10, 3),
  ('POT L',        9, 6.50, 10, 4),
  ('POT M',        9, 4.85, 10, 5),
  ('POT S',        9, 3.95, 10, 6),
  ('TUPPER',       9, 9.95, 10, 7);

-- GRANISSATS (category 10) — all 4.90€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('GRANITZAT COCO',       10, 4.90, 10, 1),
  ('GRANITZAT FRAMBUESA',  10, 4.90, 10, 2),
  ('GRANITZAT LLIMONA',    10, 4.90, 10, 3),
  ('GRANITZAT MADUIXA',    10, 4.90, 10, 4),
  ('GRANITZAT MANGO',      10, 4.90, 10, 5),
  ('GRANISSAT MARACUIA',   10, 4.90, 10, 9),
  ('GRANITZAT CAFE',       10, 4.90, 10, 10),
  ('GRANITZAT IOGURT',     10, 4.90, 10, 11);

-- HI POP (category 11)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('AMERICAN WAFFLE',             11, 4.95, 10, 1),
  ('SANDWICH WAFFLE',             11, 4.95, 10, 2),
  ('HI POP',                      11, 6.90, 10, 3),
  ('WAFFLE NUTELLA',              11, 4.95, 10, 4),
  ('SANDWIC KINDER',              11, 4.95, 10, 5),
  ('WAFFLE KINDER',               11, 4.95, 10, 6),
  ('WAFFLE PISTATXO',             11, 4.95, 10, 7),
  ('WAFFLE XOCOLATA',             11, 4.95, 10, 8),
  ('WAFFLE XOCOLATA BLANCA',      11, 4.95, 10, 9),
  ('SANDWICH NUTELLA',            11, 4.95, 10, 10),
  ('SANDWICH PISTATXO',           11, 4.95, 10, 11),
  ('SANDWICH XOCOLATA',           11, 4.95, 10, 12),
  ('SANDWICH XOCOLATA BLANCA',    11, 4.95, 10, 13),
  ('SANDWICH SALSA OREO',         11, 4.95, 10, 14);

-- ICE DRINKS (category 12) — all 4.90€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('ICED MADUIXA',   12, 4.90, 10, 1),
  ('ICED CAFE',      12, 4.90, 10, 2),
  ('ICED MANGO',     12, 4.90, 10, 3),
  ('ICED LLIMONA',   12, 4.90, 10, 4),
  ('ICED MARACUIA',  12, 4.90, 10, 5),
  ('MILK CAFE',      12, 4.90, 10, 6),
  ('MILK MANGO',     12, 4.90, 10, 7),
  ('MILK MARACUIA',  12, 4.90, 10, 8),
  ('ICED COCO',      12, 4.90, 10, 9),
  ('ICED FRAMBUESA', 12, 4.90, 10, 10);

-- RECEPTES (category 13) — all 7.30€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('COOKIES CREAM',       13, 7.30, 10, 1),
  ('KINDER DELIGHT',      13, 7.30, 10, 2),
  ('LOTUS RECETA',         13, 7.30, 10, 3),
  ('NUTELLA & GO',         13, 7.30, 10, 4),
  ('OREO ICE',             13, 7.30, 10, 5),
  ('PISTACHO RECETA',      13, 7.30, 10, 6),
  ('TÉ MACHA RECETA',      13, 7.30, 10, 7),
  ('YOGURT PASIÓN',        13, 7.30, 10, 8),
  ('CHAI',                 13, 7.30, 10, 9);

-- SMOOTHIE (category 14) — all 5.90€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('SMOOTHIE COCO',       14, 5.90, 10, 1),
  ('SMOOTHIE FRAMBUESA',  14, 5.90, 10, 2),
  ('SMOOTHIE FRESA',      14, 5.90, 10, 3),
  ('SMOOTHIE MANGO',      14, 5.90, 10, 4),
  ('SMOOTHIE MARACUYA',   14, 5.90, 10, 5),
  ('SMOOTHIE AÇAI',       14, 5.90, 10, 6);

-- FROZZEN IOGURT (category 15)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('POT IOGURT L',    15, 5.95, 10, 1),
  ('POT IOGURT M',    15, 4.75, 10, 2),
  ('POT IOGURT S',    15, 3.60, 10, 3),
  ('AÇAI L',           15, 5.95, 10, 4),
  ('AÇAI M',           15, 4.75, 10, 5),
  ('AÇAI S',           15, 3.60, 10, 6),
  ('AÇAI S MUESLY',    15, 3.60, 10, 7);

-- XIPS (category 16)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('PATATES XIPS',  16, 2.00, 10, 1);

-- XURROS (category 17)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('BOX 6 XURROS + 2 XOCOLATA',   17, 9.90,  10, 1),
  ('BOX 9 XURROS + 3 XOCOLATA',   17, 14.90, 10, 2),
  ('PACK 3 XURROS SUCRE',          17, 3.30,  10, 3),
  ('PACK 3 XURROS XOCOLATA',       17, 5.30,  10, 4),
  ('XOCOLATA & XURROS',            17, 5.90,  10, 5),
  ('XURRO XOCOLATA',               17, 1.90,  10, 6),
  ('XURRO MADUIXA',                17, 1.90,  10, 7),
  ('PACK 3 XURROS PISTATXO',       17, 5.30,  10, 8),
  ('PACK 3 XURROS',                17, 5.30,  10, 9),
  ('MADUIXA',                       17, 0.00,  10, 10),
  ('PACK 3 XURROS XOCO B',         17, 5.90,  10, 11);

-- VARIOS (category 18)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('GEL',                      18, 0.10, 10, 1),
  ('SUPLEMENT LLET VEGETAL',   18, 0.30, 10, 2),
  ('VARIOS',                   18, 1.30, 10, 3),
  ('DESCAFEINAT SOBRE',        18, 0.00, 10, 4),
  ('SENSE SUCRE',              18, 0.00, 10, 5),
  ('SUCRE MORE',               18, 0.00, 10, 6),
  ('LLET SENSE LACTOSA',       18, 0.00, 10, 7),
  ('LLET VEGETAL 0€',          18, 0.00, 10, 8);

-- SABORS (category 19) — all 0.00€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('SABOR AVELLANA',          19, 0.00, 10, 1),
  ('SABOR CAFE',              19, 0.00, 10, 2),
  ('SABOR CHEESECAKE',        19, 0.00, 10, 3),
  ('SABOR COCO',              19, 0.00, 10, 4),
  ('SABOR DOLÇ DE LLET',      19, 0.00, 10, 5),
  ('SABOR FERRERO',           19, 0.00, 10, 6),
  ('SABOR KINDER',            19, 0.00, 10, 7),
  ('SABOR LLIMONA',           19, 0.00, 10, 8),
  ('SABOR LOTUS',             19, 0.00, 10, 9),
  ('SABOR MADUIXA',           19, 0.00, 10, 10),
  ('SABOR MANGO',             19, 0.00, 10, 11),
  ('SABOR MARACUIA',          19, 0.00, 10, 12),
  ('SABOR MENTA XOCO',        19, 0.00, 10, 13),
  ('SABOR NATA',              19, 0.00, 10, 14),
  ('SABOR NUTELLA',           19, 0.00, 10, 15),
  ('SABOR OREO',              19, 0.00, 10, 16),
  ('SABOR PISTAXO',           19, 0.00, 10, 17),
  ('SABOR TURRO',             19, 0.00, 10, 18),
  ('SABOR VAINILLA',          19, 0.00, 10, 19),
  ('SABOR VAINILLA COOKIES',  19, 0.00, 10, 20),
  ('SABOR XOCOLATA',          19, 0.00, 10, 21),
  ('SABOR STRACCIATELLA',     19, 0.00, 10, 22),
  ('SABOR CRISPETES',         19, 0.00, 10, 23);

-- SALSAS I CREMES (category 20)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('XOCOLATA',                       20, 0.00, 10, 1),
  ('XOCOLATA BLANCA',                20, 0.00, 10, 2),
  ('PISTATXO SALSA',                 20, 0.00, 10, 3),
  ('DOLÇ DE LLET',                   20, 0.00, 10, 4),
  ('KINDER SALSA',                   20, 0.00, 10, 5),
  ('LOTUS SALSA',                    20, 0.00, 10, 6),
  ('MELMELADA NABIUS',               20, 0.00, 10, 7),
  ('OREO SALSA',                     20, 0.00, 10, 8),
  ('XOCO MADUIXA',                   20, 0.00, 10, 9),
  ('MELMALADA MARACUIA',             20, 0.00, 10, 10),
  ('CARAMEL SALAT',                  20, 0.00, 10, 11),
  ('MELMALADA FRUITS VERMELLS',      20, 0.00, 10, 12),
  ('XOCOLATA PISTATXO',              20, 0.00, 10, 13),
  ('CREMA CATALANA 1€',              20, 1.00, 10, 14),
  ('KINDER SALSA 1€',                20, 1.00, 10, 15),
  ('LOTUS SALSA 1€',                 20, 1.00, 10, 16),
  ('PISTAXO SALSA 1€',               20, 1.00, 10, 17),
  ('XOCOLATA BLANCA 1€',             20, 1.00, 10, 18),
  ('CARAMEL SALAT 1€',               20, 1.00, 10, 19),
  ('DOLÇ DE LLET 0.50€',             20, 0.50, 10, 20),
  ('KINDER SALSA 0.5€',              20, 0.50, 10, 21),
  ('LOTUS SALSA 0.5€',               20, 0.50, 10, 22),
  ('PISTAXO SALSA 0.5€',             20, 0.50, 10, 23),
  ('XOCOLATA 0.5€',                  20, 0.50, 10, 24),
  ('XOCOLATA BLANCA 0.5€',           20, 0.50, 10, 25);

-- TOPPINGS (category 21) — all 0.00€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('NUTELLA',              21, 0.00, 10, 1),
  ('CRISPY BALLS BLANCA',  21, 0.00, 10, 2),
  ('LACASITOS',            21, 0.00, 10, 3),
  ('LOTUS POLS',           21, 0.00, 10, 4),
  ('MADUIXA NATURAL',      21, 0.00, 10, 5),
  ('NATA',                 21, 0.00, 10, 6),
  ('NUBE',                 21, 0.00, 10, 7),
  ('OREO POLS',            21, 0.00, 10, 8),
  ('PLATAN NATURAL',       21, 0.00, 10, 9),
  ('SUCRE',                21, 0.00, 10, 10),
  ('CRUMBLE MADUIXA',      21, 0.00, 10, 11),
  ('CRISPY BALLS NEGRA',   21, 0.00, 10, 12),
  ('KINDER GALLETA',       21, 0.00, 10, 13),
  ('GRANOLA',              21, 0.00, 10, 14);

-- TOPPING GELAT 1€ (category 22) — all 1.00€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('GELAT LOTUS',       22, 1.00, 10, 1),
  ('GELAT MANGO',       22, 1.00, 10, 2),
  ('GELAT AÇAI',        22, 1.00, 10, 3),
  ('GELAT VAINILLA',    22, 1.00, 10, 4),
  ('GELAT CHEESECAKE',  22, 1.00, 10, 5),
  ('GELAT MARACUIA',    22, 1.00, 10, 6),
  ('GELAT PISTAXO',     22, 1.00, 10, 7),
  ('GELAT NUTELLA',     22, 1.00, 10, 8);

-- TOPPING 1€ EXTRA (category 23) — all 1.00€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('NUTELLA 1€',              23, 1.00, 10, 1),
  ('CRISPY BALLS BLANCA 1€',  23, 1.00, 10, 2),
  ('BROWNIE 1€',              23, 1.00, 10, 3),
  ('LACASITOS 1€',            23, 1.00, 10, 4),
  ('LOTUS POLS 1€',           23, 1.00, 10, 5),
  ('MADUIXA NATURAL 1€',      23, 1.00, 10, 6),
  ('NATA 1€',                 23, 1.00, 10, 7),
  ('NUBE 1€',                 23, 1.00, 10, 8),
  ('OREO POLS 1€',            23, 1.00, 10, 9),
  ('PLATAN NATURAL 1€',       23, 1.00, 10, 10),
  ('SUCRE 1€',                23, 1.00, 10, 11),
  ('CRISPY BALLS NEGRA 1€',   23, 1.00, 10, 12),
  ('PISTATXO POLS 1€',        23, 1.00, 10, 13),
  ('KINDER GALLETA 1€',       23, 1.00, 10, 14),
  ('GRANOLA 1€',              23, 1.00, 10, 15);

-- TOPPING GELAT 2€ (category 24) — all 2.00€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('GELAT AVELLANA 2€',          24, 2.00, 10, 1),
  ('GELAT DULCE DE LECHE 2€',    24, 2.00, 10, 2),
  ('GELAT IOGURT 2€',            24, 2.00, 10, 3),
  ('GELAT KINDER 2€',            24, 2.00, 10, 4),
  ('GELAT LOTUS 2€',             24, 2.00, 10, 5),
  ('GELAT MADUIXA 2€',           24, 2.00, 10, 6),
  ('GELAT NATA 2€',              24, 2.00, 10, 7),
  ('GELAT OREO 2€',              24, 2.00, 10, 8),
  ('GELAT AÇAI 2€',              24, 2.00, 10, 9),
  ('GELAT VAINILLA 2€',          24, 2.00, 10, 10),
  ('GELAT XOCOLATA 2€',          24, 2.00, 10, 11),
  ('GELAT CAFE 2€',              24, 2.00, 10, 12),
  ('GELAT CHEESECAKE 2€',        24, 2.00, 10, 13),
  ('GELAT FERRERO 2€',           24, 2.00, 10, 14),
  ('GELAT MENTA XOC 2€',         24, 2.00, 10, 15),
  ('GELAT PISTAXO 2€',           24, 2.00, 10, 16),
  ('GELAT NUTELLA 2€',           24, 2.00, 10, 17),
  ('GELAT VAINILLA COOKIES 2€',  24, 2.00, 10, 18),
  ('GELAT MARACUIA 2€',          24, 2.00, 10, 19),
  ('GELAT CRISPETES 2€',         24, 2.00, 10, 20);

-- TOPPINGS 0,5€ (category 25) — all 0.50€
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('NUTELLA 0,5€',              25, 0.50, 10, 1),
  ('CRISPY BALLS BLANCA 0.5€',  25, 0.50, 10, 2),
  ('BROWNIE 0.5€',              25, 0.50, 10, 3),
  ('LACASITOS 0.5€',            25, 0.50, 10, 4),
  ('MADUIXA NATURAL 0.5€',      25, 0.50, 10, 5),
  ('NATA 0.5€',                 25, 0.50, 10, 6),
  ('NUBE 0.5€',                 25, 0.50, 10, 7),
  ('OREO POLS 0.5€',            25, 0.50, 10, 8),
  ('PLATAN NATURAL 0.5€',       25, 0.50, 10, 9),
  ('SUCRE 0.5€',                25, 0.50, 10, 10),
  ('CRUMBLE MADUIXA 0,5€',      25, 0.50, 10, 11),
  ('CRISPY BALLS NEGRE 0.5€',   25, 0.50, 10, 12),
  ('KINDER GALLETA 0.5€',       25, 0.50, 10, 13),
  ('GRANOLA 0.5€',              25, 0.50, 10, 14);

-- INFUSIONS (category 26)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('MENTA POLEO',              26, 2.50, 10, 1),
  ('ENGLISH BREAKFAST',        26, 2.50, 10, 2),
  ('TE VERT',                  26, 2.50, 10, 3),
  ('CAMAMILLA',                26, 2.50, 10, 4),
  ('ROIBOS',                   26, 2.50, 10, 5),
  ('MENTA POLEO & LLET',       26, 2.70, 10, 6),
  ('ENGLISH BREAKFAST & LLET', 26, 2.70, 10, 7),
  ('CAMAMILLA & LLET',         26, 2.70, 10, 8);

-- ORXATA (category 27)
INSERT INTO pos.products (name, category_id, price, vat_rate, sort_order) VALUES
  ('ORXATA',  27, 4.90, 10, 1);

COMMIT;
