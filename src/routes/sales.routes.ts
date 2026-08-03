import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/sales.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", controller.list);
router.post(
  "/",
  [body("items").isArray({ min: 1 }), body("payments").isArray({ min: 1 }), body("orderType").isIn(["sur_place", "emporter", "livraison"])],
  validate,
  controller.create
);
router.post("/:id/cancel", requireRole("admin", "gerant"), [param("id").isInt(), body("reason").isString().notEmpty()], validate, controller.cancel);

export default router;
