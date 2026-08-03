import { asyncHandler } from "../utils/asyncHandler";
import * as usersService from "../services/users.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const list = asyncHandler(async (req, res) => {
  res.json({ users: await usersService.list() });
});

export const create = asyncHandler(async (req, res) => {
  const result = await usersService.create(req.body);
  emitEvent(EVENTS.USER_CREATED, result); // temps réel : les autres appareils connectés voient le nouveau compte immédiatement
  res.status(201).json(result);
});

export const setActive = asyncHandler(async (req, res) => {
  await usersService.setActive(Number(req.params.id), req.body.active);
  emitEvent(EVENTS.USER_UPDATED, { id: Number(req.params.id) });
  res.json({ ok: true });
});

export const remove = asyncHandler(async (req, res) => {
  await usersService.remove(Number(req.params.id));
  emitEvent(EVENTS.USER_DELETED, { id: Number(req.params.id) });
  res.json({ ok: true });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await usersService.resetPassword(id, req.body.newPin);
  emitEvent(EVENTS.USER_UPDATED, { id, reason: "password_reset" });
  res.json({ ok: true });
});

export const updateRole = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await usersService.updateRole(id, req.body.roleCode);
  emitEvent(EVENTS.USER_UPDATED, { id, reason: "role_changed" });
  res.json({ ok: true });
});
