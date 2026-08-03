-- ============================================================================
-- Migration 003 — Support de la synchronisation client/serveur
-- ============================================================================
-- Ajoute à chaque table synchronisable :
--   - `uuid` : identifiant STABLE et globalement unique, généré côté client au
--     moment de la création (crypto.randomUUID). Contrairement à `id`
--     (AUTOINCREMENT local à chaque base), le uuid ne collisionne jamais entre
--     deux bases indépendantes — c'est lui qui sert de clé de rapprochement
--     pendant la synchronisation, jamais `id`.
--   - `deleted` : suppression logique (tombstone). Une ligne supprimée n'est
--     jamais retirée physiquement avant synchronisation, sinon les autres
--     appareils ne sauraient jamais qu'elle doit être supprimée chez eux aussi.
--   - `updated_at` (déjà présent sur `users`, ajouté ici sur `roles`) : sert de
--     base à la résolution de conflits "dernière écriture gagne".
--
-- Portée volontairement limitée à `users` et `roles` : ce sont, à ce stade,
-- les deux seules tables réellement utilisées par l'application (les ventes,
-- le stock, les tables du restaurant, etc. vivent encore dans le
-- localStorage du renderer — voir CHANGELOG.md). Étendre la synchronisation à
-- ces domaines nécessite d'abord de les migrer vers SQLite.
-- ============================================================================

ALTER TABLE users ADD COLUMN uuid TEXT;
ALTER TABLE users ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1));

ALTER TABLE roles ADD COLUMN uuid TEXT;
ALTER TABLE roles ADD COLUMN updated_at TEXT; -- rétro-rempli juste en dessous (SQLite interdit NOT NULL + valeur par défaut non constante sur ADD COLUMN)
ALTER TABLE roles ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1));
UPDATE roles SET updated_at = datetime('now') WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid) WHERE uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_uuid ON roles(uuid) WHERE uuid IS NOT NULL;

-- Petite table clé/valeur pour l'état de synchronisation (dernier horodatage réussi, etc.)
CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Journal des conflits détectés (deux appareils ont modifié la même ligne entre deux
-- synchronisations). La règle de résolution par défaut est "le serveur gagne" (voir
-- sync.js / sync-engine.js) ; ce journal permet une revue manuelle a posteriori.
CREATE TABLE IF NOT EXISTS sync_conflicts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name      TEXT NOT NULL,
  record_uuid     TEXT NOT NULL,
  local_version   TEXT NOT NULL,   -- JSON de la version locale au moment du conflit
  server_version  TEXT NOT NULL,   -- JSON de la version serveur retenue
  resolution      TEXT NOT NULL DEFAULT 'server_wins',
  detected_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
