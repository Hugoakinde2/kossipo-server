import { asyncHandler } from "../utils/asyncHandler";
import * as ordersService from "../services/orders.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const listActive = asyncHandler(async (req, res) => {
  res.json({ orders: await ordersService.listActive() });
});

export const create = asyncHandler(async (req, res) => {
  const result = await ordersService.create({ ...req.body, openedById: req.user!.userId });
  emitEvent(EVENTS.ORDER_CREATED, { orderId: result.id });
  result.items.forEach((it) => {
    if (it.prepZone === "cuisine") emitEvent(EVENTS.KITCHEN_TICKET, { orderId: result.id, item: it });
    if (it.prepZone === "bar") emitEvent(EVENTS.BAR_TICKET, { orderId: result.id, item: it });
  });
  res.status(201).json(result);
});

export const updateItemStatus = asyncHandler(async (req, res) => {
  const itemId = Number(req.params.itemId);
  await ordersService.updateItemStatus(itemId, req.body.prepStatus);
  emitEvent(EVENTS.STATUS_CHANGED, { orderItemId: itemId, prepStatus: req.body.prepStatus });
  res.json({ ok: true });
});

export const close = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await ordersService.close(id);
  emitEvent(EVENTS.ORDER_UPDATED, { orderId: id, status: "encaissee" });
  res.json({ ok: true });
});
