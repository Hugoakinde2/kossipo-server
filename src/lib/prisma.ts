/**
 * lib/prisma.ts — Client Prisma unique, partagé par tout le serveur.
 * ---------------------------------------------------------------------------
 * Remplace l'ancien src/db.js (better-sqlite3). Toute la logique métier
 * (services/) importe `prisma` d'ici plutôt que d'instancier son propre
 * client — évite d'épuiser le pool de connexions PostgreSQL, en particulier
 * important sur Render où le nombre de connexions simultanées est limité
 * selon le plan choisi.
 */
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// En développement (tsx watch, rechargements fréquents), réutilise l'instance existante
// plutôt que d'en recréer une à chaque rechargement — évite l'épuisement du pool de connexions.
export const prisma = global.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
