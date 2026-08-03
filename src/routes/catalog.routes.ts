import { Router } from "express";
import { body, param } from "express-validator";
import * as controller from "../controllers/catalog.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// Lecture PUBLIQUE (pas de requireAuth ici) : le catalogue (menu, prix) n'est pas une donnée
// sensible, et surtout — correctif important — un poste de caisse utilisant uniquement le flux de
// connexion par tuiles (jamais "Autre compte") n'obtient jamais de jeton JWT. Exiger un jeton ici
// aurait rendu la synchronisation du catalogue silencieusement impossible pour ces postes, alors
// que "Electron doit utiliser l'API comme source principale" doit fonctionner pour tous, pas
// seulement ceux ayant fait une connexion via l'API. Seules les ÉCRITURES restent protégées
// ci-dessous, route par route (plus de protection globale au niveau du routeur).
router.get("/categories", controller.listCategories);
router.get("/products", controller.listProducts);

router.post(
  "/products",
  requireAuth, requireRole("admin", "gerant"),
  [body("categoryId").isInt(), body("name").isString().notEmpty(), body("priceMode").isIn(["fixed", "manual"])],
  validate,
  controller.createProduct
);
router.patch("/products/:id", requireAuth, requireRole("admin", "gerant"), [param("id").isInt()], validate, controller.updateProduct);
router.delete("/products/:id", requireAuth, requireRole("admin", "gerant"), [param("id").isInt()], validate, controller.removeProduct);
router.post(
  "/products/push",
  requireAuth, requireRole("admin", "gerant"),
  [body("products").isArray()],
  validate,
  controller.pushProducts
);

export default router;
