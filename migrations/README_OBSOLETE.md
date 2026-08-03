# ⚠️ Dossier obsolète

Ces fichiers `.sql` correspondaient à l'ancienne base **SQLite** (`better-sqlite3`), remplacée par
**PostgreSQL + Prisma** dans le cadre de la migration vers un fonctionnement multi-appareils.

**Le schéma et les migrations à jour se trouvent désormais dans `prisma/`** :
- `prisma/schema.prisma` — schéma complet (traduction fidèle de `001_init.sql`, aucune table perdue)
- `prisma/seed.ts` — données de référence (traduction fidèle de `002_seed.sql`)
- Le contenu de `003_sync.sql` (colonnes de synchronisation) est intégré directement dans
  `schema.prisma` (`uuid`, `deleted`, `updatedAt` sur `User`/`Role`, table `SyncConflict`).

Ce dossier est conservé uniquement comme référence historique — voir `DOCUMENTATION_TECHNIQUE.md` du
projet `kossipo-electron` pour le contexte complet de cette évolution.
