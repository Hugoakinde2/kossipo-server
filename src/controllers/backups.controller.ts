import { asyncHandler } from "../utils/asyncHandler";
import * as backupsService from "../services/backups.service";

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await backupsService.createBackup());
});
export const list = asyncHandler(async (req, res) => {
  res.json({ backups: await backupsService.listBackups() });
});
