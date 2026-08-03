/**
 * realtime/socket.ts — Diffusion temps réel à tous les appareils connectés.
 * ---------------------------------------------------------------------------
 * Étendu par rapport à la version précédente : événements utilisateurs et
 * produits ajoutés explicitement, pour que "un administrateur crée un
 * caissier / modifie un produit" apparaisse immédiatement sur tous les
 * appareils — exactement ce qui manquait et causait le bug rapporté.
 */
import { Server, type Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyToken } from "../config/jwt";

export const EVENTS = {
  ORDER_CREATED: "order:created",
  ORDER_UPDATED: "order:updated",
  TABLE_OPENED: "table:opened",
  TABLE_CLOSED: "table:closed",
  SALE_CREATED: "sale:created",
  PAYMENT_RECEIVED: "payment:received",
  STOCK_UPDATED: "stock:updated",
  KITCHEN_TICKET: "kitchen:ticket",
  BAR_TICKET: "bar:ticket",
  STATUS_CHANGED: "status:changed",
  USER_CREATED: "user:created",
  USER_UPDATED: "user:updated",
  USER_DELETED: "user:deleted",
  PRODUCT_CREATED: "product:created",
  PRODUCT_UPDATED: "product:updated",
  PRODUCT_DELETED: "product:deleted",
} as const;

export type RealtimeEvent = (typeof EVENTS)[keyof typeof EVENTS];

let ioInstance: SocketIOServer | null = null;

export function initRealtime(httpServer: HttpServer) {
  // Même règle que src/index.ts pour l'API REST : jamais de wildcard "*" en production, faute de
  // quoi n'importe quel site pourrait ouvrir une connexion temps réel vers ce serveur.
  const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  const corsOrigin = corsOrigins && corsOrigins.length > 0 ? corsOrigins : process.env.NODE_ENV === "production" ? false : "*";
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentification requise (jeton manquant)."));
    try {
      (socket as any).user = verifyToken(token);
      next();
    } catch {
      next(new Error("Jeton invalide ou expiré."));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user;
    console.log(`[realtime] Poste connecté : ${user?.name ?? "?"} (${user?.roleCode ?? "?"})`);
    socket.join("kossipo");
    socket.on("disconnect", () => {
      console.log(`[realtime] Poste déconnecté : ${user?.name ?? "?"}`);
    });
  });

  ioInstance = io;
  return io;
}

/** Diffuse un événement à tous les postes connectés — appelé depuis les contrôleurs après une écriture réussie. */
export function emitEvent(event: RealtimeEvent, payload: Record<string, unknown>) {
  if (!ioInstance) return; // serveur démarré sans temps réel (tests) — non bloquant
  ioInstance.to("kossipo").emit(event, { ...payload, serverTime: new Date().toISOString() });
}
