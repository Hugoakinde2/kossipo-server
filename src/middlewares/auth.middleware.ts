import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../config/jwt";

// Augmente le type Request d'Express pour porter l'utilisateur authentifié —
// évite les "as any" dispersés dans les contrôleurs.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Authentification requise (en-tête Authorization manquant)." });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Jeton invalide ou expiré." });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise." });
    if (req.user.roleCode === "super_admin" || allowedRoles.includes(req.user.roleCode)) return next();
    return res.status(403).json({ error: `Accès refusé pour le rôle "${req.user.roleCode}".` });
  };
}
