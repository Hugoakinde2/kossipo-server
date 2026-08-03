import { asyncHandler } from "../utils/asyncHandler";
import * as salesService from "../services/sales.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const list = asyncHandler(async (req, res) => {
  res.json({ sales: await salesService.list(req.query.since as string | undefined) });
});

export const create = asyncHandler(async (req, res) => {
  const result = await salesService.create({ ...req.body, cashierId: req.user!.userId });
  emitEvent(EVENTS.SALE_CREATED, result);
  (req.body.payments ?? []).forEach((p: { method: string; amount: number }) =>
    emitEvent(EVENTS.PAYMENT_RECEIVED, { saleId: result.id, method: p.method, amount: p.amount })
  );
  emitEvent(EVENTS.STOCK_UPDATED, { saleId: result.id });
  res.status(201).json(result);
});

export const cancel = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await salesService.cancel(id, req.body.reason);
  emitEvent(EVENTS.SALE_CREATED, { saleId: id, status: "annulee" });
  emitEvent(EVENTS.STOCK_UPDATED, { saleId: id, reason: "remboursement" });
  res.json({ ok: true });
});
