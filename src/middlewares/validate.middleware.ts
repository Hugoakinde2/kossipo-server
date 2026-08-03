import type { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export function validate(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Requête invalide.", details: errors.array().map((e) => ({ field: e.type === "field" ? e.path : e.type, message: e.msg })) });
  }
  next();
}
