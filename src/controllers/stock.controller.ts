import { asyncHandler } from "../utils/asyncHandler";
import * as stockService from "../services/stock.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const list = asyncHandler(async (req, res) => {
  res.json({ stock: await stockService.list() });
});
export const listLow = asyncHandler(async (req, res) => {
  res.json({ stock: await stockService.listLowStock() });
});
export const listOutOfStock = asyncHandler(async (req, res) => {
  res.json({ stock: await stockService.listOutOfStock() });
});

// Remplace l'ancien "adjust" (quantité arbitraire écrasée) — voir stock.service.ts, règle absolue.
export const createMovement = asyncHandler(async (req, res) => {
  const result = await stockService.createMovement({ ...req.body, userId: req.user!.userId });
  emitEvent(EVENTS.STOCK_UPDATED, { productId: req.body.productId, ingredientId: req.body.ingredientId, kind: req.body.kind, quantityAfter: result.quantityAfter });
  res.status(201).json(result);
});

export const setThreshold = asyncHandler(async (req, res) => {
  await stockService.setThreshold(Number(req.params.id), Number(req.body.threshold));
  res.json({ ok: true });
});

export const movements = asyncHandler(async (req, res) => {
  const kind = req.query.kind as any;
  const productId = req.query.productId ? Number(req.query.productId) : undefined;
  res.json({ movements: await stockService.movements(Number(req.query.limit) || 100, kind, productId) });
});

// Remontée depuis un poste de caisse Electron — voir stockService.pushMovements. Même schéma
// d'intégration que catalog.controller.ts::pushProducts, pas un mécanisme séparé.
export const pushMovements = asyncHandler(async (req, res) => {
  const result = await stockService.pushMovements(req.body.movements || [], req.user!.userId);
  if (result.applied.length > 0) emitEvent(EVENTS.STOCK_UPDATED, { syncedCount: result.applied.length });
  res.json(result);
});
