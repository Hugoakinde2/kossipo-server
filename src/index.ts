/**
 * index.ts — Serveur central KOSSIPO (v2 : PostgreSQL/Prisma/TypeScript)
 * ---------------------------------------------------------------------------
 * Trois volets sur le même serveur HTTP :
 *   1. Synchronisation utilisateurs/rôles (/api/sync/*) — compatibilité avec
 *      l'app de bureau Electron existante, non modifiée dans cette passe.
 *   2. API REST complète (/api/v1/*) — consommée par kossipo-admin-web.
 *   3. Temps réel Socket.IO — les deux ci-dessus y publient leurs événements.
 */
import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { mountApiV1 } from "./app";
import { registerSyncRoutes } from "./sync-routes";
import { initRealtime } from "./realtime/socket";

const PORT = process.env.PORT || 4000;

if (!process.env.DATABASE_URL) {
  console.error("[kossipo-server] DATABASE_URL n'est pas définie — voir .env.example. Le serveur ne peut pas fonctionner sans base PostgreSQL.");
}
if (!process.env.JWT_SECRET) {
  console.error("[kossipo-server] JWT_SECRET n'est pas définie — l'authentification refusera toute connexion tant qu'elle n'est pas configurée.");
}
if (!process.env.SYNC_API_KEY) {
  console.warn("[kossipo-server] SYNC_API_KEY non définie — la synchronisation avec l'application de bureau Electron restera indisponible.");
}

const app = express();
app.set("trust proxy", true); // Render (et tout hébergeur derrière un reverse proxy) — sans ça, req.ip refléterait l'IP interne du proxy plutôt que celle du poste de caisse, faussant le journal de connexion
app.use(helmet());

// CORS restreint à une liste d'origines explicites — JAMAIS "*" en production. CORS_ORIGIN accepte
// une liste séparée par des virgules (ex: pour Netlify preview deploys + domaine de production).
// Sans configuration, replie sur "*" en développement uniquement (jamais en production, où
// NODE_ENV=production doit être défini par l'hébergeur — Render le fait automatiquement).
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : process.env.NODE_ENV === "production" ? false : "*",
    credentials: true,
  })
);
if (!corsOrigins && process.env.NODE_ENV === "production") {
  console.error(
    "[kossipo-server] CORS_ORIGIN n'est pas définie en production — toutes les requêtes cross-origin " +
      "seront refusées (y compris depuis ton site Netlify) tant que cette variable n'est pas renseignée."
  );
}

app.use(express.json({ limit: "5mb" }));

registerSyncRoutes(app); // /api/sync/* et /api/health
mountApiV1(app); // /api/v1/* et /api/docs

const httpServer = http.createServer(app);
initRealtime(httpServer);

httpServer.listen(PORT, () => {
  console.log(`[kossipo-server] En écoute sur le port ${PORT}`);
  console.log(`[kossipo-server] Healthcheck : http://localhost:${PORT}/api/health`);
  console.log(`[kossipo-server] Documentation API : http://localhost:${PORT}/api/docs`);
});
