import { Router } from "express";
import * as controller from "../controllers/backups.controller";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", controller.list);
router.post("/", controller.create);

export default router;
