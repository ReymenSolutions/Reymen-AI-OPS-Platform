-- Unidades de insumos: antes texto libre ("Pza", "pc", "pza" contaban distinto).
-- Se normalizan las formas reconocidas a la clave de la lista; lo que no se
-- reconoce se deja igual y el usuario lo cambia al editar el insumo.

UPDATE "FoodInventoryItem" SET "unit" = 'pza' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('pza', 'pzas', 'pz', 'pzs', 'pieza', 'piezas', 'pc', 'pcs', 'pieza(s)', 'piece', 'pieces', 'u', 'un', 'unidad', 'unidades', 'unit', 'units') AND "unit" <> 'pza';
UPDATE "FoodInventoryItem" SET "unit" = 'kg' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kilogram', 'kilograms') AND "unit" <> 'kg';
UPDATE "FoodInventoryItem" SET "unit" = 'g' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('g', 'gr', 'grs', 'gramo', 'gramos', 'gram', 'grams') AND "unit" <> 'g';
UPDATE "FoodInventoryItem" SET "unit" = 'l' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('l', 'lt', 'lts', 'ltr', 'litro', 'litros', 'liter', 'liters', 'litre', 'litres') AND "unit" <> 'l';
UPDATE "FoodInventoryItem" SET "unit" = 'ml' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('ml', 'mililitro', 'mililitros', 'milliliter', 'milliliters') AND "unit" <> 'ml';
UPDATE "FoodInventoryItem" SET "unit" = 'paq' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('paq', 'paqs', 'paquete', 'paquetes', 'pack', 'packs', 'pqt') AND "unit" <> 'paq';
UPDATE "FoodInventoryItem" SET "unit" = 'caja' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('caja', 'cajas', 'box', 'boxes') AND "unit" <> 'caja';
UPDATE "FoodInventoryItem" SET "unit" = 'bolsa' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('bolsa', 'bolsas', 'bag', 'bags') AND "unit" <> 'bolsa';
UPDATE "FoodInventoryItem" SET "unit" = 'botella' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('botella', 'botellas', 'bottle', 'bottles') AND "unit" <> 'botella';
UPDATE "FoodInventoryItem" SET "unit" = 'lata' WHERE lower(regexp_replace(regexp_replace(trim("unit"), '\.$', ''), '\s+', '', 'g')) IN ('lata', 'latas', 'can', 'cans') AND "unit" <> 'lata';
