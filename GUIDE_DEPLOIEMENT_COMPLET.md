# KOSSIPO — Guide de déploiement complet (backend + frontend)

Ce guide part de zéro et t'amène jusqu'à un système fonctionnel sur plusieurs appareils. **Suis les
étapes dans l'ordre** — le frontend a besoin de l'adresse du backend, donc le backend se déploie en
premier.

## Vue d'ensemble

```
┌─────────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  kossipo-admin-web    │  API   │   kossipo-server        │  SQL  │   PostgreSQL      │
│  (Netlify)              │ ────► │   (Render, Node/Express)  │ ───► │   (Render)          │
│  React/Vite/TypeScript  │ ◄──── │   Prisma + Socket.IO       │       │                     │
└─────────────────────┘  WS     └──────────────────────┘         └─────────────────┘
        ▲                                    ▲
        │ VITE_API_URL                       │
        │ VITE_SOCKET_URL                    │ DATABASE_URL, JWT_SECRET,
   navigateurs (téléphone,                   │ CORS_ORIGIN, SYNC_API_KEY
   tablette, PC...)                          │
                                    ┌──────────────────────┐
                                    │  kossipo-electron        │
                                    │  (poste de caisse local)   │ — non modifié, synchronise
                                    └──────────────────────┘    séparément via /api/sync/*
```

## Étape 1 — Base de données PostgreSQL (Render)
1. [dashboard.render.com](https://dashboard.render.com) → **New → PostgreSQL**.
2. Nom, région, plan (le gratuit convient pour démarrer — expire à 90 jours, à surveiller).
3. Note l'**Internal Database URL** une fois créée (Connect → Internal Database URL).

## Étape 2 — Backend (Render Web Service)
1. Pousse `kossipo-server/` sur GitHub (dépôt dédié, ou dossier d'un dépôt plus large avec **Root
   Directory** réglé sur `kossipo-server`).
2. **New → Web Service** → connecte ce dépôt.
3. **Build Command** : `npm run render-build`
4. **Start Command** : `npm start`
5. **Environment Variables** :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | Internal Database URL de l'étape 1 |
   | `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `SYNC_API_KEY` | Même commande, une valeur **différente** |
   | `CORS_ORIGIN` | Laisse vide pour l'instant — revient à l'étape 5 |
   | `NODE_ENV` | `production` |

6. **⚠️ Avant le premier déploiement**, génère la migration Prisma en local :
   ```bash
   cd kossipo-server
   npm install
   DATABASE_URL="<Internal ou External Database URL>" npx prisma migrate dev --name init
   git add prisma/migrations && git commit -m "Migration Prisma initiale" && git push
   ```
   Sans ce dossier `prisma/migrations/` commité, `npm run render-build` (qui exécute
   `prisma migrate deploy`) n'aura rien à appliquer.
7. **Create Web Service**. Note l'URL obtenue (ex. `https://kossipo-server.onrender.com`).
8. Sème les données de référence (une seule fois) :
   ```bash
   DATABASE_URL="<Database URL de Render>" npm run prisma:seed
   ```
9. Vérifie : `curl https://kossipo-server.onrender.com/api/health` → doit répondre `{"ok":true,...}`.

## Étape 3 — Frontend (Netlify)
1. Pousse `kossipo-admin-web/` sur GitHub (dépôt séparé, ou dossier avec **Base directory** réglé
   sur `kossipo-admin-web`).
2. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** →
   sélectionne le dépôt. `netlify.toml` est déjà configuré (build + redirections SPA), rien à
   ressaisir.
3. **Avant de déployer**, Site settings → Environment variables :

   | Variable | Valeur |
   |---|---|
   | `VITE_API_URL` | L'URL Render obtenue à l'étape 2.7 (ex. `https://kossipo-server.onrender.com`) — **sans** `/api` à la fin |
   | `VITE_SOCKET_URL` | La même URL |
   | `VITE_APP_NAME` | Optionnel |

4. **Deploy site**. Note l'URL Netlify obtenue (ex. `https://kossipo-admin.netlify.app`).

## Étape 4 — Boucler CORS (retour sur Render)
1. Retourne sur ton service Render (backend) → Environment → `CORS_ORIGIN` → renseigne l'URL Netlify
   exacte de l'étape 3.4 (sans slash final). Plusieurs origines possibles, séparées par des virgules.
2. Render redéploie automatiquement après un changement de variable d'environnement.

## Étape 5 — Vérification multi-appareils (le test qui compte)
1. Ouvre le site Netlify sur un premier appareil. Connecte-toi.
2. Onglet **Utilisateurs** → crée un compte test.
3. Ouvre le **même site** sur un **second appareil différent** (autre téléphone, tablette, PC) et
   connecte-toi.
4. Le compte créé à l'étape 2 doit apparaître **sans rafraîchir la page** — c'est le temps réel
   (Socket.IO) qui l'affiche automatiquement.
5. Si ce n'est pas le cas : ouvre la console du navigateur (F12) → onglet Réseau/Console sur le
   second appareil, et regarde s'il y a une erreur de connexion WebSocket ou une erreur CORS.

## Dépannage rapide

| Symptôme | Cause probable | Solution |
|---|---|---|
| "Impossible de joindre le serveur" | `VITE_API_URL` absente/incorrecte, ou site Netlify pas redéployé après l'avoir définie | Vérifier la variable, puis **redéployer** (Vite l'intègre au build, pas à l'exécution) |
| Erreur CORS dans la console | `CORS_ORIGIN` sur Render ne correspond pas exactement à l'URL Netlify | Vérifier l'orthographe exacte, l'absence de slash final |
| Connexion OK mais rien ne se met à jour en temps réel | WebSocket bloqué, ou `VITE_SOCKET_URL` incorrecte | Vérifier la console (F12) pour une erreur socket.io ; vérifier que `CORS_ORIGIN` couvre aussi Socket.IO (c'est le cas par défaut, même variable) |
| Le backend répond très lentement (~30-50s) à la première requête après une pause | Plan gratuit Render : le service se met en veille après 15 min d'inactivité | Passer à un plan payant pour un usage réel en restaurant |
| Utilisateur créé mais absent des autres appareils même après un rafraîchissement | Migration Prisma non appliquée, ou seed non exécuté | Vérifier `npx prisma migrate deploy` et `npm run prisma:seed` ont bien été exécutés contre la bonne base |

## Commandes de référence

```bash
# Backend — développement local
cd kossipo-server
npm install
npx prisma migrate dev --name init   # une seule fois
npm run prisma:seed                   # une seule fois
npm run dev

# Backend — déploiement (fait automatiquement par Render via render-build, référence manuelle)
npm run render-build   # = npm install && prisma generate && prisma migrate deploy && npm run build
npm start

# Frontend — développement local
cd kossipo-admin-web
npm install
cp .env.example .env   # renseigner VITE_API_URL=http://localhost:4000
npm run dev

# Frontend — build de production (fait automatiquement par Netlify, référence manuelle)
npm run build           # produit dist/, déployable tel quel
```
