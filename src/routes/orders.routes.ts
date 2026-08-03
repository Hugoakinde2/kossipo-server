import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/orders.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", controller.listActive);
router.post(
  "/",
  [body("orderType").isIn(["sur_place", "emporter", "livraison"]), body("items").isArray({ min: 1 })],
  validate,
  controller.create
);
router.patch(
  "/items/:itemId/status",
  [param("itemId").isInt(), body("prepStatus").isIn(["nouveau", "en_preparation", "pret", "servi"])],
  validate,
  controller.updateItemStatus
);
router.post("/:id/close", [param("id").isInt()], validate, controller.close);

export default router;
