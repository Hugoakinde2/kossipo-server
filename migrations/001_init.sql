-- ============================================================================
-- Migration 001 — Schéma initial de la base KOSSIPO
-- ============================================================================
-- Crée l'intégralité des tables demandées, avec clés étrangères, contraintes
-- CHECK, valeurs par défaut et index. Exécutée une seule fois par
-- migrate.js, qui l'enregistre ensuite dans `schema_migrations`.
--
-- Conventions :
--   - Toutes les dates sont stockées en TEXT au format ISO 8601 UTC
--     (datetime('now')), triable directement en SQL.
--   - Tous les montants sont des entiers en FCFA (pas de décimales dans
--     cette devise) — cohérent avec le reste de l'application.
--   - Les booléens sont des INTEGER 0/1 avec CHECK, SQLite n'ayant pas de
--     type booléen natif.
--   - `ON DELETE RESTRICT` sur les relations qui ne doivent jamais perdre
--     leur origine (ex. une vente doit toujours savoir qui l'a encaissée) ;
--     `ON DELETE SET NULL` quand la perte du lien est acceptable (ex. un
--     client supprimé ne doit pas faire disparaître ses ventes passées) ;
--     `ON DELETE CASCADE` uniquement pour les données qui n'ont aucun sens
--     sans leur parent (ex. les lignes d'une commande sans la commande).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. RÔLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,   -- super_admin | admin | gerant | caissier | serveur | cuisine | bar
  label       TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{}',  -- JSON : { caisse, tables, prep, stock, stats, users, settings, ... }
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 2. UTILISATEURS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  username              TEXT UNIQUE,
  role_id               INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  password_hash         TEXT NOT NULL,
  must_change_password  INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1)),
  active                INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  failed_attempts       INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- ----------------------------------------------------------------------------
-- 3. CATÉGORIES (produits)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,      -- plats | garnitures | bieres | vins | sucreries | ...
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

-- ----------------------------------------------------------------------------
-- 4. PRODUITS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL,
  barcode         TEXT,
  price_mode      TEXT NOT NULL DEFAULT 'fixed' CHECK (price_mode IN ('fixed','manual')),
  base_price      INTEGER CHECK (base_price IS NULL OR base_price >= 0),
  vip_fixed_price INTEGER CHECK (vip_fixed_price IS NULL OR vip_fixed_price >= 0),
  cost_price      INTEGER CHECK (cost_price IS NULL OR cost_price >= 0),  -- pour le calcul de bénéfice (roadmap tableau de bord)
  track_stock     INTEGER NOT NULL DEFAULT 0 CHECK (track_stock IN (0,1)),
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (price_mode = 'manual' OR base_price IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 5. VARIANTES (ex : petite/grande bouteille) — un produit peut avoir 0 variante
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,   -- écart de prix par rapport au produit de base (peut être négatif)
  barcode     TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (product_id, name)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Ingrédients + recette (BOM) — nécessaires pour conserver la fonctionnalité
-- existante de déduction automatique de stock par recette (non demandées
-- nommément mais indispensables à "ne casser aucune fonctionnalité").
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  unit       TEXT NOT NULL DEFAULT 'kg',   -- kg | L | pièce
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_recipe_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity      REAL NOT NULL CHECK (quantity > 0),  -- quantité consommée par unité vendue
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_product    ON product_recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredient ON product_recipe_items(ingredient_id);

-- ----------------------------------------------------------------------------
-- 6. CLIENTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ----------------------------------------------------------------------------
-- 7. FOURNISSEURS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- 8. TABLES RESTAURANT (zones + tables + sièges, pour la gestion par siège
--    de l'Espace Dehors et par table complète en VIP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurant_zones (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  code    TEXT NOT NULL UNIQUE,   -- dehors | vip_bas | vip_haut
  label   TEXT NOT NULL,
  is_vip  INTEGER NOT NULL DEFAULT 0 CHECK (is_vip IN (0,1))
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_id     INTEGER NOT NULL REFERENCES restaurant_zones(id) ON DELETE RESTRICT,
  code        TEXT NOT NULL,          -- D01, B01, H01...
  seat_count  INTEGER NOT NULL DEFAULT 1 CHECK (seat_count >= 1),
  UNIQUE (zone_id, code)
);
CREATE INDEX IF NOT EXISTS idx_tables_zone ON restaurant_tables(zone_id);

CREATE TABLE IF NOT EXISTS table_seats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id     INTEGER NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  seat_number  INTEGER NOT NULL CHECK (seat_number >= 1),
  status       TEXT NOT NULL DEFAULT 'libre' CHECK (status IN ('libre','en_cours','attente_paiement')),
  opened_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (table_id, seat_number)
);
CREATE INDEX IF NOT EXISTS idx_seats_table  ON table_seats(table_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON table_seats(status);

-- ----------------------------------------------------------------------------
-- 9. COMMANDES (panier en cours, avant encaissement définitif)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id     INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  seat_id      INTEGER REFERENCES table_seats(id) ON DELETE SET NULL,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  zone_id      INTEGER REFERENCES restaurant_zones(id) ON DELETE SET NULL,
  order_type   TEXT NOT NULL CHECK (order_type IN ('sur_place','emporter','livraison')),
  status       TEXT NOT NULL DEFAULT 'ouverte' CHECK (status IN ('ouverte','envoyee','servie','encaissee','annulee')),
  opened_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_table  ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ----------------------------------------------------------------------------
-- 10. DÉTAILS COMMANDE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id   INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   INTEGER NOT NULL CHECK (unit_price >= 0),
  note         TEXT,
  prep_zone    TEXT CHECK (prep_zone IN ('cuisine','bar')),
  prep_status  TEXT NOT NULL DEFAULT 'nouveau' CHECK (prep_status IN ('nouveau','en_preparation','pret','servi')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_prep    ON order_items(prep_zone, prep_status);

-- ----------------------------------------------------------------------------
-- 11. VENTES (transaction finalisée et encaissée)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number   INTEGER NOT NULL UNIQUE,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  cashier_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  server_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  zone_id         INTEGER REFERENCES restaurant_zones(id) ON DELETE SET NULL,
  table_id        INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  seat_id         INTEGER REFERENCES table_seats(id) ON DELETE SET NULL,
  order_type      TEXT NOT NULL CHECK (order_type IN ('sur_place','emporter','livraison')),
  subtotal        INTEGER NOT NULL CHECK (subtotal >= 0),
  discount        INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total           INTEGER NOT NULL CHECK (total >= 0),
  status          TEXT NOT NULL DEFAULT 'validee' CHECK (status IN ('validee','annulee')),
  cancelled_reason TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (total = subtotal - discount)
);
CREATE INDEX IF NOT EXISTS idx_sales_created  ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier  ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_status   ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_zone     ON sales(zone_id);

-- Lignes de vente (miroir figé de order_items au moment de l'encaissement —
-- nécessaire pour que le ticket reste exact même si le produit change de prix plus tard)
CREATE TABLE IF NOT EXISTS sale_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id  INTEGER REFERENCES product_variants(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,    -- copie figée du nom au moment de la vente
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  INTEGER NOT NULL CHECK (unit_price >= 0),
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- ----------------------------------------------------------------------------
-- 12. PAIEMENTS (séparés des ventes pour permettre le paiement multi-mode)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('especes','wave','orange_money','mtn_money','carte')),
  amount        INTEGER NOT NULL CHECK (amount >= 0),
  cash_received INTEGER CHECK (cash_received IS NULL OR cash_received >= 0),
  change_given  INTEGER CHECK (change_given IS NULL OR change_given >= 0),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

-- ----------------------------------------------------------------------------
-- 13. MOUVEMENTS DE CAISSE (ouverture/fermeture de session, dépôt, retrait)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL CHECK (type IN ('ouverture','fermeture','depot','retrait','vente','remboursement')),
  amount        INTEGER NOT NULL,   -- peut être négatif (retrait, remboursement)
  balance_after INTEGER,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sale_id       INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_created ON cash_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type    ON cash_movements(type);

-- ----------------------------------------------------------------------------
-- 14. DÉPENSES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  category     TEXT,
  amount       INTEGER NOT NULL CHECK (amount >= 0),
  description  TEXT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);

-- ----------------------------------------------------------------------------
-- 15. STOCK (niveau actuel — un produit vendu tel quel OU un ingrédient, jamais les deux)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id  INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity       REAL NOT NULL DEFAULT 0,
  threshold      REAL NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (product_id IS NOT NULL AND ingredient_id IS NULL) OR
    (product_id IS NULL AND ingredient_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_product    ON stock(product_id)    WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_ingredient ON stock(ingredient_id) WHERE ingredient_id IS NOT NULL;

-- Mouvements de stock (déductions vente, ajustements manuels, réceptions) —
-- l'historique détaillé qui justifie chaque changement de `stock.quantity`.
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  ingredient_id  INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('vente','ajustement','reception','inventaire')),
  delta          REAL,              -- variation (négative = sortie), NULL si "mise à valeur absolue"
  quantity_after REAL NOT NULL,
  sale_id        INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (product_id IS NOT NULL AND ingredient_id IS NULL) OR
    (product_id IS NULL AND ingredient_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_product    ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_ingredient ON stock_movements(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_created    ON stock_movements(created_at);

-- ----------------------------------------------------------------------------
-- 16. INVENTAIRES (comptages physiques périodiques, avec écart constaté)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT,                 -- ex: "Inventaire mensuel Janvier 2026"
  status      TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_cours','cloture')),
  started_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  inventory_id    INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  ingredient_id   INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
  expected_qty    REAL NOT NULL,     -- quantité théorique (issue de `stock`) au moment du comptage
  counted_qty     REAL,              -- quantité réellement comptée (NULL tant que non saisie)
  variance        REAL GENERATED ALWAYS AS (counted_qty - expected_qty) VIRTUAL,
  CHECK (
    (product_id IS NOT NULL AND ingredient_id IS NULL) OR
    (product_id IS NULL AND ingredient_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory ON inventory_items(inventory_id);

-- ----------------------------------------------------------------------------
-- 17. HISTORIQUE (traçabilité des changements de valeur sur les entités
--     métier — prix, stock corrigé manuellement, rôle modifié, etc.)
--     Distinct du journal des actions (18) qui, lui, trace les événements de
--     session (connexion, écrans consultés) plutôt que les valeurs modifiées.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,      -- 'product' | 'user' | 'stock' | 'print_settings' | ...
  entity_id   INTEGER,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_change_history_entity  ON change_history(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_history_created ON change_history(created_at);

-- ----------------------------------------------------------------------------
-- 18. JOURNAL DES ACTIONS (audit de sécurité : connexions, permissions,
--     encaissements, remboursements, ouverture/fermeture de caisse...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,        -- connexion | deconnexion | vente | annulation | ...
  message    TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  role_code  TEXT,
  device     TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user    ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action);

-- ----------------------------------------------------------------------------
-- Paramètres applicatifs (clé/valeur) — remplace à terme kossipo-print-settings
-- et le compteur de tickets actuellement en localStorage.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,     -- JSON sérialisé
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
