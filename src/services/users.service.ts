/**
 * services/users.service.ts — Gestion des utilisateurs (admin/caissiers/serveurs/...).
 * Mêmes règles que côté application de bureau : bcrypt, suppression logique (jamais de
 * DELETE physique), garde-fou anti-verrouillage sur le rôle super_admin.
 */
import bcrypt from "bcrypt";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error.middleware";
import type { RoleCode } from "@prisma/client";

export async function list() {
  const users = await prisma.user.findMany({
    where: { deleted: false },
    orderBy: { name: "asc" },
    select: {
      id: true, uuid: true, name: true, active: true, mustChangePassword: true, createdAt: true,
      role: { select: { code: true, label: true } },
    },
  });
  return users.map((u) => ({
    id: u.id, uuid: u.uuid, name: u.name, active: u.active,
    must_change_password: u.mustChangePassword, created_at: u.createdAt,
    role_code: u.role.code, role_label: u.role.label,
  }));
}

export async function create({ name, roleCode, pin }: { name: string; roleCode: RoleCode; pin: string }) {
  if (!name?.trim()) throw new ApiError(400, "Le nom est obligatoire.");
  if (!pin || String(pin).length < 4) throw new ApiError(400, "Le code doit contenir au moins 4 caractères.");

  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new ApiError(400, "Rôle inconnu.");

  const passwordHash = await bcrypt.hash(String(pin), 12);
  const user = await prisma.user.create({
    data: { uuid: crypto.randomUUID(), name: name.trim(), roleId: role.id, passwordHash, mustChangePassword: true, active: true },
  });
  return { id: user.id, uuid: user.uuid };
}

export async function setActive(id: number, active: boolean) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable.");
  await prisma.user.update({ where: { id }, data: { active } });
}

/** Réinitialise le mot de passe d'un autre utilisateur — impose un changement à la prochaine connexion. */
export async function resetPassword(id: number, newPin: string) {
  if (!newPin || String(newPin).length < 4) throw new ApiError(400, "Le code doit contenir au moins 4 caractères.");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable.");
  const passwordHash = await bcrypt.hash(String(newPin), 12);
  await prisma.user.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true, failedAttempts: 0, lockedUntil: null },
  });
}

/** Change le rôle d'un utilisateur existant. */
export async function updateRole(id: number, roleCode: RoleCode) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable.");
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) throw new ApiError(400, "Rôle inconnu.");
  await prisma.user.update({ where: { id }, data: { roleId: role.id } });
}

export async function remove(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable.");
  // Suppression LOGIQUE — jamais physique (voir kossipo-electron/src/main/auth.js pour la même
  // règle et la raison : une ligne physiquement supprimée ne laisse aucune trace à synchroniser).
  await prisma.user.update({ where: { id }, data: { deleted: true, active: false } });
}
