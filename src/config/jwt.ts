/**
 * config/jwt.ts — Émission et vérification des jetons JWT.
 */
import jwt from "jsonwebtoken";

export interface JwtPayload {
  sub: string;
  userId: number;
  name: string;
  roleCode: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET n'est pas défini (variable d'environnement) — voir .env.example.");
  }
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "8h" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}
