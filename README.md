# KOSSIPO Server — API centrale (PostgreSQL / Prisma / TypeScript)

Serveur central KOSSIPO : API REST, WebSocket temps réel, base **PostgreSQL** via **Prisma**.
Source unique de vérité pour `kossipo-admin-web` (tableau de bord) — et compatible avec la
synchronisation push/pull déjà utilisée par l'application de bureau Electron (`kossipo-electron`,
non modifiée).

## ⚠️ Ce qui a changé (migration depuis la version SQLite)
Ce projet utilisait auparavant SQLite (`better-sqlite3`) pour la synchronisation utilisateurs/rôles
uniquement. **Il utilise désormais PostgreSQL pour l'intégralité des données** — utilisateurs,
catalogue, tables, commandes, ventes, stock, paramètres — afin que tous les appareils connectés
(téléphones, tablette, PC de caisse) partagent exactement les mêmes données en temps réel. Voir
`DEPLOIEMENT_RENDER.md` pour la checklist complète de correction du bug "Impossible de joindre le
serveur" / "comptes visibles sur un seul appareil".

## Stack
Node.js · Express · TypeScript · Prisma · PostgreSQL · Socket.IO · JWT (jsonwebtoken) · bcrypt ·
express-validator · Helmet · CORS restreint.

## Démarrage rapide (développement local)

```bash
npm install
cp .env.example .env          # renseigner DATABASE_URL, JWT_SECRET, SYNC_API_KEY, CORS_ORIGIN
npx prisma migrate dev --name init   # crée les tables (première fois uniquement)
npm run prisma:seed            # rôles, zones, 41 tables, catégories
npm run dev                    # http://localhost:4000
```

Vérifier : `curl http://localhost:4000/api/health` → `{"ok":true,...}`.
Documentation interactive de l'API : `http://localhost:4000/api/docs`.

## Rôles

Super Administrateur · Administrateur · Gérant · Caissier · Serveur · Cuisine · Bar — permissions
complètes par rôle, éditables (voir `prisma/seed.ts` pour les valeurs par défaut).

## Structure du projet

```
prisma/
├── schema.prisma      Schéma complet (27 modèles) — traduction fidèle de l'ancien schéma SQLite
└── seed.ts             Données de référence (rôles, zones, 41 tables, catégories)
src/
├── lib/prisma.ts        Client Prisma unique (singleton)
├── config/jwt.ts          Émission/vérification des jetons JWT
├── middlewares/            Authentification, validation, gestion d'erreurs centralisée
├── services/                Logique métier — un fichier par domaine, Prisma uniquement
├── controllers/               Couche HTTP mince, appelle les services
├── routes/                      Un fichier par domaine, validation express-validator
├── realtime/socket.ts             Socket.IO — 16 types d'événements diffusés
├── sync-routes.ts                  Compatibilité push/pull avec l'app Electron existante
├── app.ts                           Assemblage API REST (/api/v1) + Swagger (/api/docs)
└── index.ts                          Point d'entrée (CORS, Helmet, démarrage serveur)
```

## Sécurité
- Mots de passe : **bcrypt** (12 rounds), jamais stockés en clair.
- **JWT** (8h de validité), vérifié sur chaque route protégée.
- **CORS restreint** par variable d'environnement (`CORS_ORIGIN`) — jamais de wildcard `*` en
  production (voir `src/index.ts`, qui refuse explicitement les requêtes cross-origin si cette
  variable est absente en production plutôt que de se replier silencieusement sur un `*` non sûr).
- **Validation complète** de toutes les entrées (`express-validator`) avant d'atteindre un
  contrôleur.
- **Journal d'audit** : table `audit_log` (voir `prisma/schema.prisma`) — connexions, actions
  sensibles.
- Suppression **logique** (jamais physique) des utilisateurs — nécessaire à la synchronisation avec
  l'app Electron.

## Documents associés
- `DEPLOIEMENT_RENDER.md` — déploiement backend + PostgreSQL sur Render, avec la checklist qui
  corrige concrètement le bug de connexion multi-appareils.
- `.env.example` — chaque variable expliquée.
- `prisma/schema.prisma` — schéma commenté, écarts assumés documentés en tête de fichier.

## ⚠️ Limites honnêtes
- **Aucune exécution réelle** (`npm install`, `prisma migrate dev`, tests) n'a été possible dans
  l'environnement où ce code a été écrit — pas de Node.js, pas de PostgreSQL, pas de réseau. Toute la
  logique a été relue avec la plus grande rigueur possible, mais **le premier `npm install` et la
  première migration Prisma réels restent à faire** avant toute mise en production.
- **Le dossier `prisma/migrations/` n'existe pas encore** dans cette livraison — il doit être généré
  une fois en local contre une vraie base PostgreSQL (`npx prisma migrate dev --name init`), puis
  committé dans le dépôt. Voir `DEPLOIEMENT_RENDER.md § 3`.
- La sauvegarde (`/api/v1/backups`) est un export JSON logique, pas un `pg_dump` binaire — et le
  système de fichiers Render standard est éphémère (voir `src/services/backups.service.ts`). Pour une
  vraie protection, active les sauvegardes automatiques PostgreSQL de Render (plan payant).
- L'application de bureau Electron (`kossipo-electron`) **n'a pas été modifiée** dans cette passe —
  elle continue de fonctionner comme avant (stockage local + synchronisation push/pull des
  utilisateurs/rôles uniquement). Migrer aussi son catalogue/ses ventes/son stock vers cette API
  reste un chantier séparé, non demandé ici.
