/**
 * services/auth.service.ts — Authentification contre PostgreSQL (source unique de vérité).
 * ---------------------------------------------------------------------------
 * C'est précisément ce service qui corrige le bug rapporté : "les comptes créés
 * n'apparaissent pas sur les autres appareils". Avant cette migration, chaque
 * poste pouvait finir par lire des données différentes selon la configuration
 * réseau/stockage local. Ici, TOUT appareil qui appelle ce serveur (avec la
 * bonne VITE_API_URL) lit et écrit dans la même base PostgreSQL — il ne peut
 * plus y avoir de divergence entre appareils par construction.
 */
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { signToken } from "../config/jwt";
import { ApiError } from "../middlewares/error.middleware";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;

export async function login(name: string, pin: string, context: { device?: string; ip?: string } = {}) {
  const user = await prisma.user.findFirst({
    where: { name, deleted: false },
    include: { role: true },
  });

  if (!user || !user.active) {
    await prisma.auditLog.create({
      data: { action: "connexion_echec", message: `Échec de connexion pour "${name}" — compte introuvable ou désactivé`, device: context.device, ipAddress: context.ip },
    });
    throw new ApiError(401, "Compte introuvable ou désactivé.");
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    await prisma.auditLog.create({
      data: { action: "connexion_echec", message: `Tentative sur un compte verrouillé : ${user.name}`, userId: user.id, roleCode: user.role.code, device: context.device, ipAddress: context.ip },
    });
    throw new ApiError(423, `Compte temporairement verrouillé. Réessaie dans ${mins} min.`);
  }

  const valid = await bcrypt.compare(String(pin), user.passwordHash);
  if (!valid) {
    const attempts = user.failedAttempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: attempts,
        lockedUntil: locked ? new Date(Date.now() + LOCK_DURATION_MS) : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "connexion_echec",
        message: `Échec de connexion pour ${user.name}${locked ? " — compte verrouillé après 5 échecs" : ` (tentative ${attempts}/${MAX_FAILED_ATTEMPTS})`}`,
        userId: user.id, roleCode: user.role.code, device: context.device, ipAddress: context.ip,
      },
    });
    throw new ApiError(401, locked ? "Trop d'échecs — compte verrouillé 5 minutes." : "Identifiants incorrects.");
  }

  // Succès : réinitialise le compteur d'échecs.
  await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });
  await prisma.auditLog.create({
    data: { action: "connexion", message: `Connexion de ${user.name}`, userId: user.id, roleCode: user.role.code, device: context.device, ipAddress: context.ip },
  });

  const token = signToken({ sub: user.uuid ?? String(user.id), userId: user.id, name: user.name, roleCode: user.role.code });
  return {
    token,
    user: {
      id: user.id,
      uuid: user.uuid,
      name: user.name,
      roleCode: user.role.code,
      roleLabel: user.role.label,
      permissions: user.role.permissions as Record<string, boolean>,
      mustChangePassword: user.mustChangePassword,
    },
  };
}

/**
 * refreshToken — renouvelle un jeton JWT encore valide, sans redemander le PIN ("session
 * glissante"). Le middleware requireAuth a déjà vérifié la signature/l'expiration avant d'arriver
 * ici : un jeton expiré est rejeté à ce stade-là, pas ici — le rafraîchissement doit être demandé
 * AVANT expiration (voir kossipo-electron/src/main/apiClient.js, qui planifie l'appel ~30 min avant
 * l'échéance). Revérifie aussi que le compte n'a pas été désactivé/supprimé entre-temps : un
 * jeton valide ne doit jamais reconduire l'accès d'un compte désactivé depuis.
 */
export async function refreshToken(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user || !user.active || user.deleted) {
    throw new ApiError(401, "Compte introuvable ou désactivé — reconnexion complète requise.");
  }
  const token = signToken({ sub: user.uuid ?? String(user.id), userId: user.id, name: user.name, roleCode: user.role.code });
  return {
    token,
    user: {
      id: user.id, uuid: user.uuid, name: user.name, roleCode: user.role.code, roleLabel: user.role.label,
      permissions: user.role.permissions as Record<string, boolean>, mustChangePassword: user.mustChangePassword,
    },
  };
}

export async function changeOwnPassword(userId: number, currentPin: string, newPin: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Utilisateur introuvable.");
  const valid = await bcrypt.compare(currentPin, user.passwordHash);
  if (!valid) throw new ApiError(401, "Code actuel incorrect.");
  if (!newPin || newPin.length < 4) throw new ApiError(400, "Le nouveau code doit contenir au moins 4 caractères.");
  const passwordHash = await bcrypt.hash(newPin, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
}
