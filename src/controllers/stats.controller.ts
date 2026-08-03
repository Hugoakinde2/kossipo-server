import { asyncHandler } from "../utils/asyncHandler";
import * as statsService from "../services/stats.service";

export const today = asyncHandler(async (req, res) => {
  res.json(await statsService.today(req.query.since as string | undefined, req.query.until as string | undefined));
});
