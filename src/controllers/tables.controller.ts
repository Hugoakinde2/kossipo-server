import { asyncHandler } from "../utils/asyncHandler";
import * as tablesService from "../services/tables.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const listZones = asyncHandler(async (req, res) => {
  res.json({ zones: await tablesService.listZones() });
});

export const listTables = asyncHandler(async (req, res) => {
  res.json({ tables: await tablesService.listTables() });
});

export const updateSeatStatus = asyncHandler(async (req, res) => {
  const seatId = Number(req.params.id);
  await tablesService.updateSeatStatus(seatId, req.body.status);
  emitEvent(req.body.status === "libre" ? EVENTS.TABLE_CLOSED : EVENTS.TABLE_OPENED, { seatId, status: req.body.status });
  res.json({ ok: true });
});
