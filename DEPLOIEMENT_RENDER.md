# Déploiement du backend KOSSIPO sur Render

## ⚠️ C'est cette étape, pas la migration PostgreSQL en elle-même, qui corrige ton bug
"Impossible de joindre le serveur" et "comptes visibles uniquement sur un appareil" viennent d'un
backend jamais rendu accessible publiquement. Suis ce guide **intégralement**, jusqu'à la checklist
finale — une base de données parfaite qui reste injoignable ne changera rien.

## 1. Créer la base de données PostgreSQL sur Render
1. [dashboard.render.com](https://dashboard.render.com) → **New → PostgreSQL**.
2. Nom : `kossipo-db` (ou ce que tu veux). Région : la plus proche de tes clients/serveur.
3. Plan : le gratuit convient pour démarrer (⚠️ expire après 90 jours sur le plan gratuit Render —
   passe à un plan payant avant cette échéance pour un usage réel en restaurant).
4. Une fois créée, note l'**Internal Database URL** (Dashboard → ta base → Connect) — commence par
   `postgresql://...internal...`. C'est cette URL, pas l'externe, qu'utilisera ton service backend
   s'il est aussi hébergé sur Render (plus rapide, pas de sortie vers Internet pour chaque requête).

## 2. Créer le service web (backend)
1. **New → Web Service** → connecte ton dépôt GitHub contenant `kossipo-server/`.
2. **Root Directory** : `kossipo-server` (si le dépôt contient aussi d'autres projets).
3. **Runtime** : Node.
4. **Build Command** : `npm run render-build`
   (exécute `npm install`, génère le client Prisma, **applique les migrations**, puis compile
   TypeScript — voir `package.json`).
5. **Start Command** : `npm start`
6. **Environment Variables** (Dashboard → Environment) :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | L'Internal Database URL notée à l'étape 1 |
   | `JWT_SECRET` | Une valeur générée (voir `.env.example`) |
   | `SYNC_API_KEY` | Une autre valeur générée, différente |
   | `CORS_ORIGIN` | L'URL exacte de ton site Netlify (ex. `https://kossipo-admin.netlify.app`) — **sans slash final** |
   | `NODE_ENV` | `production` |

7. **Create Web Service**. Le premier déploiement prend quelques minutes (installation, génération
   Prisma, migration, compilation).

## 3. ⚠️ Générer la vraie migration Prisma AVANT le premier déploiement
`prisma migrate deploy` (utilisé par `render-build`) **applique** des migrations déjà générées — il
n'en invente pas. Il faut générer le dossier `prisma/migrations/` une seule fois, **en local**,
contre une base PostgreSQL réelle (locale ou une autre instance Render temporaire) :

```bash
# En local, avec un PostgreSQL accessible (Docker, ou une base Render externe temporaire)
DATABASE_URL="postgresql://..." npx prisma migrate dev --name init
```

Cela crée `prisma/migrations/<timestamp>_init/migration.sql` — **committe ce dossier dans ton
dépôt Git**, sans quoi `prisma migrate deploy` sur Render n'aura rien à appliquer et le service
démarrera contre une base vide sans les tables nécessaires.

Après cette première migration, sème les données de référence :
```bash
DATABASE_URL="<Internal ou External Database URL de Render>" npm run prisma:seed
```

## 4. Vérifier que le backend répond réellement
Une fois déployé, Render donne une URL du type `https://kossipo-server.onrender.com`. Teste :
```bash
curl https://kossipo-server.onrender.com/api/health
```
Doit répondre `{"ok":true,"service":"kossipo-server",...}`. Si erreur 502/503 : consulte les
**Logs** dans le Dashboard Render — la cause la plus fréquente est `DATABASE_URL` incorrecte ou
migrations non appliquées (voir étape 3).

## 5. ⚠️ Checklist finale — la partie qui corrige VRAIMENT ton bug
1. [ ] Backend déployé et `/api/health` répond `ok: true`.
2. [ ] `CORS_ORIGIN` sur Render contient l'URL **exacte** de ton site Netlify (vérifie qu'il n'y a
   pas de faute de frappe, pas de slash final en trop).
3. [ ] Sur **Netlify**, `VITE_API_URL` et `VITE_SOCKET_URL` pointent vers l'URL Render du backend
   (`https://kossipo-server.onrender.com`, sans `/api` à la fin — le code l'ajoute déjà).
4. [ ] **Redéploie le site Netlify** après avoir défini/modifié ces variables — Vite les intègre au
   moment du build, un changement de variable seul ne suffit pas (voir
   `kossipo-admin-web/VARIABLES_ENVIRONNEMENT.md`).
5. [ ] Connecte-toi depuis un premier appareil, crée un utilisateur test.
6. [ ] Connecte-toi depuis un **second appareil différent** (autre téléphone, PC) avec la même
   `VITE_API_URL` — l'utilisateur test créé à l'étape 5 doit apparaître immédiatement.

Si l'étape 6 échoue encore après tout ça : ouvre la console du navigateur (F12) sur le second
appareil et regarde l'onglet Réseau — l'erreur exacte (CORS bloqué, 401, timeout...) indique
précisément lequel des points ci-dessus n'est pas correctement configuré.

## Note sur le plan gratuit Render
Un service web gratuit Render **se met en veille après 15 minutes d'inactivité** et met ~30-50
secondes à redémarrer au premier appel suivant — ce qui ressemblerait, pour un utilisateur, à un
"Impossible de joindre le serveur" transitoire. Pour un restaurant en usage réel (plusieurs
centaines de clients/jour), un plan payant (pas de mise en veille) est fortement recommandé, pas
seulement pour la performance mais pour éviter ce symptôme précis.
