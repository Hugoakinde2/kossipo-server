import { asyncHandler } from "../utils/asyncHandler";
import * as catalogService from "../services/catalog.service";
import { emitEvent, EVENTS } from "../realtime/socket";

export const listCategories = asyncHandler(async (req, res) => {
  res.json({ categories: await catalogService.listCategories() });
});

export const listProducts = asyncHandler(async (req, res) => {
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
  const activeOnly = req.query.activeOnly === "true";
  res.json({ products: await catalogService.listProducts(categoryId, activeOnly) });
});

export const createProduct = asyncHandler(async (req, res) => {
  const result = await catalogService.createProduct(req.body);
  emitEvent(EVENTS.PRODUCT_CREATED, result);
  res.status(201).json(result);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await catalogService.updateProduct(id, req.body);
  emitEvent(EVENTS.PRODUCT_UPDATED, { id });
  res.json({ ok: true });
});

export const removeProduct = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await catalogService.removeProduct(id);
  emitEvent(EVENTS.PRODUCT_DELETED, { id });
  res.json({ ok: true });
});

// Remontée depuis un poste de caisse Electron — voir catalogService.pushProducts pour la logique
// LWW complète. Diffuse un événement temps réel PAR ARTICLE RÉELLEMENT APPLIQUÉ uniquement — les
// conflits et rejets n'ont modifié aucune donnée, donc rien à annoncer aux autres appareils pour eux.
export const pushProducts = asyncHandler(async (req, res) => {
  const result = await catalogService.pushProducts(req.body.products || []);
  result.applied.forEach((sourceId) => emitEvent(EVENTS.PRODUCT_UPDATED, { sourceId }));
  res.json(result);
});
