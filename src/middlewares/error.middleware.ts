import type { Request, Response, NextFunction } from "express";

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error(`[erreur] ${req.method} ${req.originalUrl} —`, err.message);
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const body: { error: string; details?: unknown } = { error: statusCode === 500 ? "Erreur interne du serveur." : err.message };
  if (err instanceof ApiError && err.details) body.details = err.details;
  res.status(statusCode).json(body);
}
