import { asyncHandler } from "../utils/asyncHandler";
import * as inventoryService from "../services/inventory.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const list = asyncHandler(async (req, res) => {
  res.json({ inventories: await inventoryService.list(Number(req.query.limit) || 50) });
});

export const get = asyncHandler(async (req, res) => {
  res.json(await inventoryService.get(Number(req.params.id)));
});

export const start = asyncHandler(async (req, res) => {
  const inventory = await inventoryService.start({ ...req.body, startedById: req.user!.userId });
  res.status(201).json(inventory);
});

export const setCounted = asyncHandler(async (req, res) => {
  await inventoryService.setCounted(Number(req.params.id), Number(req.params.itemId), Number(req.body.countedQty));
  res.json({ ok: true });
});

export const close = asyncHandler(async (req, res) => {
  const result = await inventoryService.close(Number(req.params.id), req.user!.userId, req.body.reasons || {});
  if (result.movementsCreated > 0) emitEvent(EVENTS.STOCK_UPDATED, { reason: "inventaire", inventoryId: Number(req.params.id) });
  res.json(result);
});
