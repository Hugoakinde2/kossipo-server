import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/stock.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();
router.use(requireAuth);

router.get("/", controller.list);
router.get("/low", controller.listLow);
router.get("/out", controller.listOutOfStock);
router.get("/movements", controller.movements);

// 🔴 Aucune route "PATCH quantité" n'existe plus ici — voir stock.service.ts, règle absolue :
// toute évolution du stock passe obligatoirement par un mouvement.
router.post(
  "/movements",
  requireRole("admin", "gerant", "caissier", "serveur", "cuisine", "bar"),
  [
    body("kind").isIn([
      "vente", "ajustement", "reception", "inventaire", "consommation_cuisine", "consommation_bar",
      "casse", "perte", "vol", "retour_fournisseur", "retour_client",
    ]),
    body("quantity").isFloat({ min: 0 }),
  ],
  validate,
  controller.createMovement
);

router.patch("/:id/threshold", requireRole("admin", "gerant"), [param("id").isInt(), body("threshold").isFloat({ min: 0 })], validate, controller.setThreshold);

// Remontée depuis un poste de caisse Electron — même schéma que POST /api/v1/catalog/products/push.
router.post("/movements/push", [body("movements").isArray()], validate, controller.pushMovements);

export default router;
