-- ============================================================================
-- Migration 002 — Données de référence initiales
-- ============================================================================
-- Insère les valeurs déjà utilisées par l'application (rôles RBAC, zones de
-- tarification, catégories de menu) pour que la base parte dans un état
-- cohérent avec l'existant. `INSERT OR IGNORE` rend cette migration
-- rejouable sans erreur si elle était exécutée une seconde fois par erreur.
-- ============================================================================

INSERT OR IGNORE INTO roles (code, label, permissions) VALUES
  ('super_admin', 'Super Administrateur', '{"caisse":true,"tables":true,"prep":true,"stock":true,"stats":true,"users":true,"logs":true,"settings":true,"forceStockOverride":true}'),
  ('admin',       'Administrateur',       '{"caisse":true,"tables":true,"prep":true,"stock":true,"stats":true,"users":false,"logs":true,"settings":true,"forceStockOverride":false}'),
  ('gerant',      'Gérant',               '{"caisse":true,"tables":true,"prep":true,"stock":true,"stats":true,"users":false,"logs":true,"settings":true,"forceStockOverride":false}'),
  ('caissier',    'Caissier',             '{"caisse":true,"tables":true,"prep":true,"stock":false,"stats":false,"users":false,"logs":false,"settings":false,"forceStockOverride":false}'),
  ('serveur',     'Serveur',              '{"caisse":true,"tables":true,"prep":true,"stock":false,"stats":false,"users":false,"logs":false,"settings":false,"forceStockOverride":false}'),
  ('cuisine',     'Cuisine',              '{"caisse":false,"tables":false,"prep":true,"stock":false,"stats":false,"users":false,"logs":false,"settings":false,"forceStockOverride":false,"prepZoneLock":"cuisine"}'),
  ('bar',         'Bar',                  '{"caisse":false,"tables":false,"prep":true,"stock":false,"stats":false,"users":false,"logs":false,"settings":false,"forceStockOverride":false,"prepZoneLock":"bar"}');

INSERT OR IGNORE INTO restaurant_zones (code, label, is_vip) VALUES
  ('dehors',   'Espace Dehors', 0),
  ('vip_bas',  'VIP Bas',       1),
  ('vip_haut', 'VIP Haut',      1);

INSERT OR IGNORE INTO categories (code, label, sort_order) VALUES
  ('plats',      'Plats',              1),
  ('garnitures', 'Garnitures',         2),
  ('bieres',     'Bières',             3),
  ('vins',       'Vins',               4),
  ('sucreries',  'Sucreries & Eau',    5);

-- 18 tables Dehors (3 sièges chacune), 10 VIP Bas, 13 VIP Haut — reprend la
-- configuration actuelle de l'application.
INSERT OR IGNORE INTO restaurant_tables (zone_id, code, seat_count)
  SELECT z.id, 'D' || substr('00' || n, -2), 3
  FROM restaurant_zones z, (
    WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 18)
    SELECT n FROM seq
  )
  WHERE z.code = 'dehors';

INSERT OR IGNORE INTO restaurant_tables (zone_id, code, seat_count)
  SELECT z.id, 'B' || substr('00' || n, -2), 1
  FROM restaurant_zones z, (
    WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 10)
    SELECT n FROM seq
  )
  WHERE z.code = 'vip_bas';

INSERT OR IGNORE INTO restaurant_tables (zone_id, code, seat_count)
  SELECT z.id, 'H' || substr('00' || n, -2), 1
  FROM restaurant_zones z, (
    WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 13)
    SELECT n FROM seq
  )
  WHERE z.code = 'vip_haut';

-- Un siège par table VIP (table complète = 1 "siège" logique), 3 sièges par table Dehors.
INSERT OR IGNORE INTO table_seats (table_id, seat_number)
  SELECT t.id, s.n
  FROM restaurant_tables t
  JOIN (SELECT 1 AS n UNION SELECT 2 UNION SELECT 3) s ON s.n <= t.seat_count;
