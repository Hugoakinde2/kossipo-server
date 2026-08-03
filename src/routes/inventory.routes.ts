import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/inventory.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth, requireRole("admin", "gerant"));

router.get("/", controller.list);
router.get("/:id", [param("id").isInt()], validate, controller.get);
router.post("/", [body("productIds").optional().isArray(), body("ingredientIds").optional().isArray()], validate, controller.start);
router.patch("/:id/items/:itemId", [param("id").isInt(), param("itemId").isInt(), body("countedQty").isFloat({ min: 0 })], validate, controller.setCounted);
router.post("/:id/close", [param("id").isInt()], validate, controller.close);

export default router;
