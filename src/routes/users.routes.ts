import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/users.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", controller.list);
router.post(
  "/",
  [
    body("name").isString().notEmpty(),
    body("roleCode").isIn(["admin", "gerant", "caissier", "serveur", "cuisine", "bar"]),
    body("pin").isString().isLength({ min: 4 }),
  ],
  validate,
  controller.create
);
router.patch("/:id/active", [param("id").isInt(), body("active").isBoolean()], validate, controller.setActive);
router.patch("/:id/password", [param("id").isInt(), body("newPin").isString().isLength({ min: 4 })], validate, controller.resetPassword);
router.patch(
  "/:id/role",
  [param("id").isInt(), body("roleCode").isIn(["admin", "gerant", "caissier", "serveur", "cuisine", "bar"])],
  validate,
  controller.updateRole
);
router.delete("/:id", [param("id").isInt()], validate, controller.remove);

export default router;
