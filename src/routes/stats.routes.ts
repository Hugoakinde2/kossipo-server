import { Router } from "express";
import * as controller from "../controllers/stats.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth, requireRole("admin", "gerant"));

router.get("/today", controller.today);

export default router;
