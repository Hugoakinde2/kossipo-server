/**
 * sync-routes.ts — Synchronisation bidirectionnelle des COMPTES (users/roles) uniquement.
 * ---------------------------------------------------------------------------
 * Utilisé par l'application de bureau Electron pour la synchronisation des comptes
 * utilisateurs/rôles. Last-Write-Wins par horodatage (`updated_at`), conflits journalisés
 * dans `sync_conflicts`.
 *
 * ⚠️ Note de correction (voir CHANGELOG.md) : cette route a temporairement porté aussi la
 * remontée des produits et des mouvements de stock, en doublon avec un mécanisme équivalent déjà
 * construit et câblé ailleurs (`POST /api/v1/catalog/products/push`, voir catalog.service.ts, et
 * désormais `POST /api/v1/stock/movements/push`, voir stock.service.ts). Ce doublon a été retiré :
 * cette route reste strictement dédiée aux comptes, comme à l'origine. Le catalogue et le stock
 * suivent leur propre chemin, authentifié par JWT (comme le reste de l'API REST) plutôt que par la
 * clé partagée SYNC_API_KEY utilisée ici — cohérent avec le fait que produits/mouvements sont créés
 * par un utilisateur identifié, alors que les comptes eux-mêmes n'ont pas encore d'utilisateur
 * "propriétaire" avant leur toute première synchronisation.
 *
 * ⚠️ Détail de compatibilité : le client Electron envoie/attend `permissions` comme une CHAÎNE
 * JSON (héritage SQLite). Prisma désérialise automatiquement le type `Json`. Conversion explicite
 * dans les deux sens.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { prisma } from "./lib/prisma";

function requireSyncAuth(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SYNC_API_KEY;
  if (!expected) return res.status(500).json({ ok: false, error: "SYNC_API_KEY non configurée côté serveur." });
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token !== expected) return res.status(401).json({ ok: false, error: "Jeton de synchronisation invalide." });
  next();
}

interface IncomingRole {
  uuid: string; code: string; label: string; permissions: string; created_at: string; updated_at: string; deleted: boolean;
}
interface IncomingUser {
  uuid: string; name: string; username?: string | null; role_uuid?: string | null; password_hash: string;
  must_change_password: boolean; active: boolean; failed_attempts?: number; locked_until?: string | null;
  created_at: string; updated_at: string; deleted: boolean;
}

export function registerSyncRoutes(app: Express) {
  app.post("/api/sync/push", requireSyncAuth, async (req: Request, res: Response) => {
    const { tables = {} } = req.body || {};
    const applied = { users: 0, roles: 0 };
    const conflicts: { table: string; uuid: string }[] = [];

    try {
      await prisma.$transaction(async (tx) => {
        for (const incoming of (tables.roles ?? []) as IncomingRole[]) {
          const existing = await tx.role.findUnique({ where: { uuid: incoming.uuid } });
          const permissions = typeof incoming.permissions === "string" ? JSON.parse(incoming.permissions) : incoming.permissions;
          if (!existing) continue; // rôle inattendu (semés au démarrage) — ignoré plutôt que planté
          const incomingTime = new Date(incoming.updated_at).getTime();
          const existingTime = existing.updatedAt.getTime();
          if (incomingTime > existingTime) {
            await tx.role.update({ where: { uuid: incoming.uuid }, data: { label: incoming.label, permissions, deleted: incoming.deleted } });
            applied.roles++;
          } else if (incomingTime < existingTime && JSON.stringify(existing.permissions) !== JSON.stringify(permissions)) {
            await tx.syncConflict.create({ data: { tableName: "roles", recordUuid: incoming.uuid, localVersion: JSON.stringify(incoming), serverVersion: JSON.stringify(existing) } });
            conflicts.push({ table: "roles", uuid: incoming.uuid });
          }
        }

        for (const incoming of (tables.users ?? []) as IncomingUser[]) {
          const existing = await tx.user.findUnique({ where: { uuid: incoming.uuid } });
          const role = incoming.role_uuid ? await tx.role.findUnique({ where: { uuid: incoming.role_uuid } }) : null;
          const fallbackRole = role ?? (await tx.role.findUnique({ where: { code: "caissier" } }));
          if (!fallbackRole) continue;

          if (!existing) {
            await tx.user.create({
              data: {
                uuid: incoming.uuid, name: incoming.name, username: incoming.username || null, roleId: fallbackRole.id,
                passwordHash: incoming.password_hash, mustChangePassword: !!incoming.must_change_password,
                active: !!incoming.active, failedAttempts: incoming.failed_attempts ?? 0,
                lockedUntil: incoming.locked_until ? new Date(incoming.locked_until) : null, deleted: !!incoming.deleted,
              },
            });
            applied.users++;
            continue;
          }
          const incomingTime = new Date(incoming.updated_at).getTime();
          const existingTime = existing.updatedAt.getTime();
          if (incomingTime > existingTime) {
            await tx.user.update({
              where: { uuid: incoming.uuid },
              data: {
                name: incoming.name, username: incoming.username || null, roleId: fallbackRole.id,
                passwordHash: incoming.password_hash, mustChangePassword: !!incoming.must_change_password,
                active: !!incoming.active, failedAttempts: incoming.failed_attempts ?? 0,
                lockedUntil: incoming.locked_until ? new Date(incoming.locked_until) : null, deleted: !!incoming.deleted,
              },
            });
            applied.users++;
          } else if (incomingTime < existingTime && (existing.name !== incoming.name || existing.active !== incoming.active || existing.passwordHash !== incoming.password_hash)) {
            await tx.syncConflict.create({ data: { tableName: "users", recordUuid: incoming.uuid, localVersion: JSON.stringify(incoming), serverVersion: JSON.stringify(existing) } });
            conflicts.push({ table: "users", uuid: incoming.uuid });
          }
        }
      });

      res.json({ ok: true, applied, conflicts });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  app.get("/api/sync/pull", requireSyncAuth, async (req: Request, res: Response) => {
    const since = (req.query.since as string) || "1970-01-01T00:00:00.000Z";
    try {
      const sinceDate = new Date(since);
      const [roles, users] = await Promise.all([
        prisma.role.findMany({ where: { updatedAt: { gt: sinceDate } } }),
        prisma.user.findMany({ where: { updatedAt: { gt: sinceDate } }, include: { role: true } }),
      ]);

      res.json({
        ok: true,
        serverTime: new Date().toISOString(),
        tables: {
          roles: roles.map((r) => ({
            uuid: r.uuid, code: r.code, label: r.label, permissions: JSON.stringify(r.permissions),
            created_at: r.createdAt.toISOString(), updated_at: r.updatedAt.toISOString(), deleted: r.deleted,
          })),
          users: users.map((u) => ({
            uuid: u.uuid, name: u.name, username: u.username, role_uuid: u.role.uuid,
            password_hash: u.passwordHash, must_change_password: u.mustChangePassword,
            active: u.active, failed_attempts: u.failedAttempts, locked_until: u.lockedUntil?.toISOString() ?? null,
            created_at: u.createdAt.toISOString(), updated_at: u.updatedAt.toISOString(), deleted: u.deleted,
          })),
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  });

  app.get("/api/sync/conflicts", requireSyncAuth, async (req: Request, res: Response) => {
    const rows = await prisma.syncConflict.findMany({ orderBy: { id: "desc" }, take: 200 });
    res.json({ ok: true, conflicts: rows });
  });

  app.get("/api/health", (req: Request, res: Response) => res.json({ ok: true, service: "kossipo-server", time: new Date().toISOString() }));
}
