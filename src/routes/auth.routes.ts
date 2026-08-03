import { Router } from "express";
import { body } from "express-validator";
import * as controller from "../controllers/auth.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth } from "../middlewares/auth.middleware";

const router = Router();

router.post("/login", [body("name").isString().notEmpty(), body("pin").isString().isLength({ min: 4 })], validate, controller.login);
router.get("/me", requireAuth, controller.me);
router.post("/refresh", requireAuth, controller.refresh);
router.post(
  "/change-password",
  requireAuth,
  [body("currentPin").isString().notEmpty(), body("newPin").isString().isLength({ min: 4 })],
  validate,
  controller.changePassword
);

export default router;
