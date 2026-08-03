/**
 * services/stock.service.ts — Stock professionnel, piloté par un journal de mouvements.
 * ---------------------------------------------------------------------------
 * 🔴 RÈGLE ABSOLUE (voir CHANGELOG.md pour l'audit qui a précédé cette réécriture) :
 * AUCUNE fonction de ce fichier ne modifie `Stock.quantity` directement. La
 * SEULE façon de faire évoluer un niveau de stock est `createMovement()` —
 * qui calcule la nouvelle quantité et l'écrit dans la même transaction que
 * l'enregistrement du mouvement. Il n'existe plus de route "PATCH stock"
 * acceptant une quantité arbitraire (l'ancienne `adjust(id, newQuantity)` a
 * été supprimée, pas seulement renommée — voir stock.controller.ts).
 *
 * Un mouvement est APPEND-ONLY : aucune route de modification ni de
 * suppression n'est exposée (voir stock.routes.ts) — le schéma Prisma
 * lui-même n'a pas de colonne `updatedAt` sur StockMovement, rendant une
 * modification silencieuse impossible même par erreur de code futur.
 */
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error.middleware";
import type { StockMovementKind, Prisma } from "@prisma/client";

// Mouvements qui DIMINUENT le stock (delta négatif) — tous les autres AUGMENTENT, sauf `inventaire`
// (traité à part : correction vers une valeur comptée, delta calculé automatiquement).
const OUTBOUND_KINDS: StockMovementKind[] = ["vente", "consommation_cuisine", "consommation_bar", "casse", "perte", "vol", "retour_fournisseur"];
// Mouvements où un stock résultant négatif est une ERREUR DE SAISIE à rejeter (action manuelle et
// déliberée) plutôt qu'une conséquence normale à absorber. Les ventes/consommations, elles, sont
// bornées à 0 plutôt que rejetées — bloquer une vente pour un écart de stock serait pire que l'écart
// lui-même, cohérent avec le comportement déjà établi côté application de bureau.
const REJECT_IF_NEGATIVE: StockMovementKind[] = ["ajustement", "casse", "perte", "vol", "retour_fournisseur"];
// Motif obligatoire pour ces types — action qui justifie toujours une explication humaine.
const REASON_REQUIRED: StockMovementKind[] = ["ajustement", "casse", "perte", "vol"];

export interface CreateMovementInput {
  productId?: number;
  ingredientId?: number;
  kind: StockMovementKind;
  quantity: number; // toujours positif en entrée — le sens (+/-) est déterminé par `kind`, sauf pour "inventaire" (valeur comptée absolue)
  reason?: string;
  reference?: string;
  device?: string;
  userId?: number;
  saleId?: number;
  supplierId?: number; // pour "reception" : crée aussi une ligne d'historique d'achat
  unitCost?: number;   // idem
  sourceId?: string;   // rapprochement avec un mouvement déjà créé côté Electron (idempotence, voir sync-routes.ts)
}

/**
 * SEULE fonction d'écriture de ce service. Toute évolution du stock — quelle qu'en soit l'origine
 * (vente, réception, casse, inventaire...) — passe par ici et crée un mouvement, jamais une
 * affectation directe de `quantity`.
 *
 * Accepte optionnellement une transaction Prisma déjà ouverte (`txClient`) — indispensable pour
 * les appelants qui doivent que la déduction de stock fasse partie de LEUR PROPRE transaction
 * atomique (ex. sales.service.ts : la vente et sa déduction de stock doivent réussir ou échouer
 * ensemble, jamais l'une sans l'autre). Sans ce paramètre, ouvre sa propre transaction — c'est le
 * cas normal pour un appel isolé (ex. depuis un contrôleur HTTP).
 */
export async function createMovement(input: CreateMovementInput, txClient?: Prisma.TransactionClient) {
  if (!input.productId && !input.ingredientId) throw new ApiError(400, "Un produit ou un ingrédient est requis.");
  if (input.productId && input.ingredientId) throw new ApiError(400, "Un mouvement concerne un produit OU un ingrédient, jamais les deux.");
  if (!(input.quantity > 0) && input.kind !== "inventaire") throw new ApiError(400, "La quantité doit être strictement positive.");
  if (REASON_REQUIRED.includes(input.kind) && !input.reason?.trim()) {
    throw new ApiError(400, `Un motif est obligatoire pour un mouvement de type "${input.kind}".`);
  }

  if (txClient) return runCreateMovement(txClient, input);
  return prisma.$transaction((tx) => runCreateMovement(tx, input));
}

async function runCreateMovement(tx: Prisma.TransactionClient, input: CreateMovementInput) {
  const stockRow = await getOrCreateStockRowTx(tx, input.productId, input.ingredientId);

  let delta: number;
  let quantityAfter: number;
  if (input.kind === "inventaire") {
    // Valeur comptée absolue — le delta est la correction implicite (différence avec le théorique).
    quantityAfter = input.quantity;
    delta = quantityAfter - stockRow.quantity;
  } else {
    const signed = OUTBOUND_KINDS.includes(input.kind) ? -input.quantity : input.quantity;
    quantityAfter = stockRow.quantity + signed;
    if (quantityAfter < 0) {
      if (REJECT_IF_NEGATIVE.includes(input.kind)) {
        throw new ApiError(409, `Ce mouvement ferait passer le stock en négatif (${stockRow.quantity} - ${input.quantity}) — refusé. Vérifie la quantité réelle avant de continuer.`);
      }
      quantityAfter = 0; // ventes/consommations : borné à 0, jamais rejeté (ne bloque pas une vente pour un écart de stock)
    }
    delta = signed;
  }

  await tx.stock.update({ where: { id: stockRow.id }, data: { quantity: quantityAfter } });

  const movement = await tx.stockMovement.create({
    data: {
      sourceId: input.sourceId ?? null,
      productId: input.productId ?? null,
      ingredientId: input.ingredientId ?? null,
      kind: input.kind,
      delta,
      quantityAfter,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      device: input.device ?? null,
      saleId: input.saleId ?? null,
      userId: input.userId ?? null,
    },
  });

  if (input.kind === "reception" && input.supplierId && input.unitCost != null) {
    await tx.purchaseRecord.create({
      data: {
        productId: input.productId ?? null, ingredientId: input.ingredientId ?? null,
        supplierId: input.supplierId, quantity: input.quantity, unitCost: input.unitCost, movementId: movement.id,
      },
    });
    // Fournisseur préféré mis à jour sur le produit (dernier fournisseur utilisé) — n'écrase rien
    // d'important, purement informatif pour un futur achat.
    if (input.productId) await tx.product.update({ where: { id: input.productId }, data: { supplierId: input.supplierId } });
  }

  return { movement, quantityAfter, delta };
}

// Variante transactionnelle de getOrCreateStockRow — nécessaire car $transaction fournit son propre
// client `tx`, distinct de `prisma` importé en haut de fichier (sans quoi la création de la ligne de
// stock et celle du mouvement pourraient s'exécuter hors de la même transaction atomique).
async function getOrCreateStockRowTx(tx: Prisma.TransactionClient, productId?: number, ingredientId?: number) {
  const where = productId ? { productId } : { ingredientId };
  let row = await tx.stock.findFirst({ where });
  if (!row) {
    row = await tx.stock.create({ data: { productId: productId ?? null, ingredientId: ingredientId ?? null, quantity: 0, threshold: 0 } });
  }
  return row;
}

export async function list() {
  const rows = await prisma.stock.findMany({ include: { product: true, ingredient: true } });
  return rows.map((s) => ({
    id: s.id, product_id: s.productId, ingredient_id: s.ingredientId,
    quantity: s.quantity, threshold: s.threshold, updated_at: s.updatedAt,
    product_name: s.product?.name ?? null, ingredient_name: s.ingredient?.name ?? null,
  }));
}

/** Fixe seulement le SEUIL d'alerte — jamais la quantité (voir règle absolue en tête de fichier). */
export async function setThreshold(stockId: number, threshold: number) {
  const row = await prisma.stock.findUnique({ where: { id: stockId } });
  if (!row) throw new ApiError(404, "Ligne de stock introuvable.");
  if (threshold < 0) throw new ApiError(400, "Le seuil ne peut pas être négatif.");
  await prisma.stock.update({ where: { id: stockId }, data: { threshold } });
}

export async function listLowStock() {
  const rows = await prisma.stock.findMany();
  return rows.filter((s) => s.quantity <= s.threshold);
}
export async function listOutOfStock() {
  const rows = await prisma.stock.findMany();
  return rows.filter((s) => s.quantity <= 0);
}

/**
 * pushMovements — REMONTÉE des mouvements de stock créés localement dans un poste de caisse
 * Electron (voir kossipo-electron/src/main/catalogSync.js). Même schéma d'intégration que
 * catalogService.pushProducts (authentification JWT via /api/v1, pas la clé partagée
 * SYNC_API_KEY de sync-routes.ts, qui reste dédiée aux comptes — voir sync-routes.ts pour la note
 * de correction sur ce choix).
 *
 * Idempotent par `sourceId` — un mouvement est immuable (append-only), donc contrairement aux
 * produits, AUCUN conflit n'est jamais possible ici : soit le mouvement existe déjà (ignoré), soit
 * il est nouveau (appliqué via createMovement(), qui recalcule la quantité résultante à partir de
 * l'état ACTUEL du stock côté serveur — jamais la valeur envoyée par le poste, cohérent même si
 * plusieurs postes synchronisent en parallèle).
 */
export interface PushMovementInput {
  sourceId: string; productSourceId: string; kind: StockMovementKind; delta?: number | null;
  quantityAfter: number; reason?: string | null; reference?: string | null; device?: string | null;
}

export async function pushMovements(items: PushMovementInput[], userId?: number) {
  const applied: string[] = [];
  const skipped: string[] = [];
  const rejected: { sourceId: string; reason: string }[] = [];

  for (const item of items) {
    const already = await prisma.stockMovement.findUnique({ where: { sourceId: item.sourceId } });
    if (already) { skipped.push(item.sourceId); continue; }

    const product = await prisma.product.findUnique({ where: { sourceId: item.productSourceId } });
    if (!product) { rejected.push({ sourceId: item.sourceId, reason: "Produit pas encore synchronisé côté serveur." }); continue; }

    try {
      const quantity = item.kind === "inventaire" ? item.quantityAfter : Math.abs(item.delta ?? 0);
      if (!(quantity > 0) && item.kind !== "inventaire") { rejected.push({ sourceId: item.sourceId, reason: "Quantité invalide." }); continue; }
      await createMovement({
        productId: product.id, kind: item.kind, quantity,
        reason: item.reason ?? undefined, reference: item.reference ?? undefined, device: item.device ?? undefined,
        sourceId: item.sourceId, userId,
      });
      applied.push(item.sourceId);
    } catch (err) {
      // Un mouvement refusé (ex. stock négatif désormais impossible côté serveur après d'autres
      // ventes entre-temps) n'interrompt pas la synchronisation des autres lignes.
      rejected.push({ sourceId: item.sourceId, reason: (err as Error).message });
    }
  }
  return { applied, skipped, rejected };
}

export async function movements(limit = 100, kind?: StockMovementKind, productId?: number) {
  const rows = await prisma.stockMovement.findMany({
    where: { ...(kind ? { kind } : {}), ...(productId ? { productId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  // Même correctif que catalog.service.ts (voir CHANGELOG.md) : Prisma renvoie du camelCase brut,
  // le frontend attend du snake_case — appliqué ici dès l'écriture plutôt que découvert plus tard.
  return rows.map((m) => ({
    id: m.id, product_id: m.productId, ingredient_id: m.ingredientId, kind: m.kind,
    delta: m.delta, quantity_after: m.quantityAfter, reason: m.reason, reference: m.reference,
    device: m.device, sale_id: m.saleId, created_at: m.createdAt.toISOString(),
  }));
}
