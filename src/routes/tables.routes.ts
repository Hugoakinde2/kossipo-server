import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/tables.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/zones", controller.listZones);
router.get("/", controller.listTables);
router.patch(
  "/seats/:id/status",
  [param("id").isInt(), body("status").isIn(["libre", "en_cours", "attente_paiement"])],
  validate,
  controller.updateSeatStatus
);

export default router;
