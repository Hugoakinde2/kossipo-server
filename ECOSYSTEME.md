# KOSSIPO Restaurant Digit — Vue d'ensemble de l'écosystème (V1.0)

Trois projets **indépendants** (chacun son propre dépôt/déploiement), qui coopèrent via une API et
un protocole de synchronisation — pas un monorepo, pas une recréation, chacun a été construit et
vérifié séparément.

## Les trois projets

| Projet | Rôle | Techno | Déploiement |
|---|---|---|---|
| **kossipo-electron** | Logiciel de caisse (poste physique du restaurant) | Electron, React (JSX runtime), SQLite local | Installateur Windows (`.exe`) |
| **kossipo-server** | Serveur central — API REST + temps réel | Node/Express/TypeScript, PostgreSQL/Prisma, Socket.IO | Render |
| **kossipo-admin-web** | Tableau de bord web (pilotage à distance) | React/Vite/TypeScript | Netlify |

## Ce qui relie réellement les trois projets aujourd'hui

```
┌────────────────────┐
│  kossipo-electron      │ ── stockage local (SQLite comptes + localStorage tout le reste)
│  (poste de caisse)       │
└─────────┬──────────┘
          │ POST/GET /api/sync/push, /api/sync/pull  (comptes utilisateurs/rôles UNIQUEMENT,
          │ authentifié par SYNC_API_KEY, Last-Write-Wins)
          ▼
┌────────────────────┐        ┌────────────────────┐
│   kossipo-server        │ ◄───── │ kossipo-admin-web       │
│   (Render + PostgreSQL)   │  API   │  (Netlify)                │
│                            │  REST  │                            │
│                            │  + WS  │  Authentification JWT      │
└────────────────────┘        └────────────────────┘
      /api/v1/*  (utilisateurs, catalogue, tables, commandes,
                   ventes, stock, statistiques, sauvegardes)
```

## ⚠️ Le point le plus important de tout l'écosystème
**`kossipo-electron` n'utilise que `/api/sync/*`** (comptes utilisateurs/rôles) — **jamais**
`/api/v1/*` (catalogue, ventes, stock, tables). Ces deux derniers domaines restent propres à chaque
poste de caisse, indépendants les uns des autres et du tableau de bord web. Concrètement :
- Un utilisateur créé sur `kossipo-admin-web` (ou sur un poste de caisse) apparaît bien sur tous les
  postes de caisse **et** sur le tableau de bord — ce domaine est unifié.
- Une vente effectuée sur un poste de caisse **n'apparaît PAS** sur `kossipo-admin-web` ni sur les
  autres postes — chaque caisse reste une île pour les ventes/le catalogue/le stock.

`kossipo-server` a déjà toute la capacité technique nécessaire pour centraliser aussi ces domaines
(l'API `/api/v1/*` existe et fonctionne, `kossipo-admin-web` la consomme déjà) — ce qui manque est le
branchement de `kossipo-electron` dessus, un chantier à part entière (voir
`kossipo-electron/DOCUMENTATION_TECHNIQUE.md § 3`), volontairement non entrepris d'un bloc pour ne
pas risquer de casser une application de caisse déjà volumineuse et fonctionnelle sans pouvoir
l'exécuter pour vérifier chaque changement.

## Ce qui est déjà cohérent entre les trois projets (vérifié, pas supposé)
- **7 rôles identiques** (`super_admin`, `admin`, `gerant`, `caissier`, `serveur`, `cuisine`, `bar`)
  avec les mêmes libellés dans les trois projets.
- **Mêmes clés de permission** (`caisse`, `tables`, `prep`, `stock`, `stats`, `users`, `settings`,
  `logs`, `forceStockOverride`) — un changement de permission a le même sens partout.
- **Mots de passe bcrypt** dans les deux projets qui en gèrent (Electron, Server) — jamais en clair.
- **Aucune dépendance croisée** dans le code (`package.json` de chaque projet vérifié indépendant).

## Versions
Chaque projet garde son propre numéro de version (reflétant sa propre histoire — `kossipo-server` a
eu une réécriture majeure justifiant sa version 2.x, `kossipo-electron` a accumulé de nombreuses
fonctionnalités avant ce point). Cette version "V1.0" désigne le **premier ensemble cohérent et
documenté des trois projets ensemble**, pas un numéro de version unique forcé sur chacun.

## Pour aller plus loin (feuille de route, non entreprise ici)
1. Brancher `kossipo-electron` sur `/api/v1/*` pour le catalogue (le plus simple : lecture seule au
   départ), puis les ventes/le stock (le plus risqué : nécessite un mode hors-ligne avec file
   d'attente et résolution de conflits, comme documenté pour la synchronisation des comptes).
2. Étendre `kossipo-admin-web` avec un écran de configuration des paramètres restaurant
   (logo, coordonnées, TVA) actuellement propres à chaque poste Electron.
3. Durcir l'authentification de synchronisation (`SYNC_API_KEY` partagée) vers un jeton par poste,
   pour un déploiement à plusieurs restaurants.
