/**
 * services/backups.service.ts — Sauvegarde logique (export JSON via Prisma).
 * ---------------------------------------------------------------------------
 * ⚠️ Différent de l'ancienne implémentation SQLite (copie binaire sûre du
 * fichier .db). PostgreSQL n'expose pas d'équivalent simple accessible
 * depuis Prisma seul — la vraie sauvegarde binaire se fait via `pg_dump`,
 * un outil externe qui n'est pas garanti disponible dans tous les
 * environnements d'hébergement (notamment un service web basique sur
 * Render, qui n'installe pas forcément les client tools PostgreSQL).
 *
 * Ce service fait donc un EXPORT LOGIQUE (JSON, via des requêtes Prisma
 * normales) des tables les plus critiques — un filet de sécurité
 * supplémentaire, PAS un remplacement d'une vraie sauvegarde binaire.
 * Render fournit des sauvegardes automatiques quotidiennes pour les bases
 * PostgreSQL gérées (plan payant) — c'est la protection principale à
 * activer côté tableau de bord Render, documentée dans DEPLOIEMENT_RENDER.md.
 *
 * ⚠️ AUTRE LIMITE IMPORTANTE : le système de fichiers d'un service web Render
 * standard est ÉPHÉMÈRE — tout fichier écrit ici (dossier data/backups/) est
 * perdu au prochain redéploiement ou redémarrage, sauf à ajouter un disque
 * persistant (option payante sur Render). Ne pas compter sur cet export pour
 * une conservation à long terme sans ce disque ; le télécharger immédiatement
 * après création si utilisé comme filet de sécurité ponctuel.
 */
import fs from "fs";
import path from "path";
import { prisma } from "../lib/prisma";

function backupDir() {
  const dir = path.join(process.cwd(), "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function createBackup() {
  const [roles, users, categories, products, productVariants, zones, tables, seats] = await Promise.all([
    prisma.role.findMany(),
    prisma.user.findMany({ where: { deleted: false } }), // exclut passwordHash ? Non : conservé chiffré (bcrypt), acceptable dans un export de secours protégé par les mêmes droits admin que le reste
    prisma.category.findMany(),
    prisma.product.findMany(),
    prisma.productVariant.findMany(),
    prisma.restaurantZone.findMany(),
    prisma.restaurantTable.findMany(),
    prisma.tableSeat.findMany(),
  ]);

  const payload = { exportedAt: new Date().toISOString(), roles, users, categories, products, productVariants, zones, tables, seats };
  const filename = `kossipo-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(path.join(backupDir(), filename), JSON.stringify(payload, null, 2), "utf-8");
  return { filename };
}

export async function listBackups() {
  const dir = backupDir();
  return fs
    .readdirSync(dir)
    .map((f) => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
