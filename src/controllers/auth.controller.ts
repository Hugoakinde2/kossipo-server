import { asyncHandler } from "../utils/asyncHandler";
import * as authService from "../services/auth.service";

export const login = asyncHandler(async (req, res) => {
  const { name, pin } = req.body;
  const result = await authService.login(name, pin, {
    device: req.body.device || req.headers["user-agent"]?.toString().slice(0, 120),
    ip: req.ip,
  });
  res.json(result);
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changeOwnPassword(req.user!.userId, req.body.currentPin, req.body.newPin);
  res.json({ ok: true });
});

// Renouvellement de session ("sliding session") — voir authService.refreshToken pour le détail des
// garanties (revérifie que le compte est toujours actif avant de reconduire l'accès).
export const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshToken(req.user!.userId);
  res.json(result);
});
