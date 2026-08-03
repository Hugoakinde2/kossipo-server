import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error.middleware";
import type { PriceMode } from "@prisma/client";

export async function listCategories() {
  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return categories.map((c) => ({ id: c.id, code: c.code, label: c.label, sort_order: c.sortOrder, active: c.active }));
}

/**
 * Par défaut, renvoie TOUS les produits (actifs et inactifs) — un produit "supprimé" ne doit
 * jamais disparaître, seulement devenir consultable comme "Inactif" (voir removeProduct
 * ci-dessous). Exactement le même comportement que l'écran de gestion catalogue de l'application
 * de bureau (Menu & Stock), qui affiche aussi les articles inactifs pour consultation/réactivation
 * — seul l'écran de VENTE y filtre les actifs. `activeOnly=true` permet à un futur consommateur de
 * cette API qui a besoin uniquement des articles vendables (un écran de caisse, par exemple) de le
 * demander explicitement, sans que ce soit le comportement par défaut.
 */
export async function listProducts(categoryId?: number, activeOnly = false) {
  const products = await prisma.product.findMany({
    where: { ...(activeOnly ? { active: true } : {}), ...(categoryId ? { categoryId } : {}) },
    include: { variants: { where: activeOnly ? { active: true } : {} } },
    orderBy: { name: "asc" },
  });
  // 🔴 CORRECTIF (audit catalogue) : Prisma renvoie du camelCase brut par défaut — ni le type
  // TypeScript côté Admin Web (kossipo-admin-web/src/types/index.ts), ni la convention déjà
  // utilisée par tous les autres services de cette API (users.service.ts, tables.service.ts...)
  // n'attendent ce format. Sans ce mappage explicite, category_id/base_price/price_mode/etc.
  // étaient `undefined` à l'exécution côté Admin Web — trouvé en vérifiant la cohérence des champs
  // pendant l'audit du catalogue, pas visible sans base de données réelle pour le constater.
  return products.map((p) => ({
    id: p.id, source_id: p.sourceId, category_id: p.categoryId, name: p.name, barcode: p.barcode,
    price_mode: p.priceMode, base_price: p.basePrice, vip_fixed_price: p.vipFixedPrice,
    cost_price: p.costPrice, tax_rate: p.taxRate, photo: p.photo, track_stock: p.trackStock,
    active: p.active,
    variants: p.variants.map((v) => ({ id: v.id, product_id: v.productId, name: v.name, price_delta: v.priceDelta, barcode: v.barcode, active: v.active })),
  }));
}

export interface ProductInput {
  categoryId: number;
  name: string;
  barcode?: string;
  priceMode: PriceMode;
  basePrice?: number;
  vipFixedPrice?: number;
  costPrice?: number;
  trackStock?: boolean;
}

export async function createProduct(data: ProductInput) {
  const category = await prisma.category.findUnique({ where: { id: data.categoryId } });
  if (!category) throw new ApiError(400, "Catégorie inconnue.");
  // Contrainte "un prix de base est requis pour un article à prix fixe" — appliquée ici (voir
  // note d'écarts en tête de prisma/schema.prisma sur les CHECK non exprimées en Prisma).
  if (data.priceMode === "fixed" && data.basePrice == null) {
    throw new ApiError(400, "Un prix de base est requis pour un article à prix fixe.");
  }
  const product = await prisma.product.create({
    data: {
      categoryId: data.categoryId,
      name: data.name,
      barcode: data.barcode || null,
      priceMode: data.priceMode,
      basePrice: data.basePrice ?? null,
      vipFixedPrice: data.vipFixedPrice ?? null,
      costPrice: data.costPrice ?? null,
      trackStock: !!data.trackStock,
    },
  });
  return { id: product.id };
}

export async function updateProduct(id: number, data: Partial<ProductInput>) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Produit introuvable.");
  await prisma.product.update({
    where: { id },
    data: {
      name: data.name,
      basePrice: data.basePrice ?? null,
      vipFixedPrice: data.vipFixedPrice ?? null,
      costPrice: data.costPrice ?? null,
      trackStock: data.trackStock,
    },
  });
}

export async function removeProduct(id: number) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Produit introuvable.");
  await prisma.product.update({ where: { id }, data: { active: false } });
}

/**
 * pushProducts — REMONTÉE des modifications faites localement dans un poste de caisse Electron
 * (voir kossipo-electron/src/main/catalogSync.js::pushLocalChanges). Complète le sens
 * "serveur → Electron" déjà en place (listProducts) — ceci est le sens inverse.
 *
 * Résolution de conflit : Last-Write-Wins par horodatage (`updatedAt`), exactement le même
 * mécanisme déjà utilisé et testé pour les utilisateurs/rôles (voir sync-routes.ts). Si la version
 * déjà en base est plus récente que celle que le poste essaie de pousser, le push est REFUSÉ pour
 * cet article précis (jamais une fusion automatique "intelligente" qui pourrait perdre une
 * modification silencieusement) et journalisé dans `SyncConflict` pour revue manuelle — la table
 * `sync_conflicts` déjà présente dans le schéma pour users/roles est réutilisée telle quelle, sans
 * modification, pour le catalogue.
 *
 * Ne touche jamais `sales`/`sale_items`/`payments` — uniquement `products`/`categories`. Les ventes
 * déjà enregistrées et les tickets déjà imprimés ne sont concernés par aucun chemin de ce code.
 */
export interface PushProductInput {
  sourceId: string; name: string; categoryCode: string; priceMode: PriceMode;
  basePrice?: number | null; vipFixedPrice?: number | null; costPrice?: number | null;
  taxRate?: number | null; photo?: string | null; trackStock?: boolean; active: boolean;
  updatedAt: string;
}

export async function pushProducts(items: PushProductInput[]) {
  const applied: string[] = [];
  const conflicts: string[] = [];
  const rejected: { sourceId: string; reason: string }[] = [];

  for (const item of items) {
    const category = await prisma.category.findUnique({ where: { code: item.categoryCode } });
    if (!category) { rejected.push({ sourceId: item.sourceId, reason: "Catégorie inconnue côté serveur." }); continue; }

    const existing = await prisma.product.findUnique({ where: { sourceId: item.sourceId } });
    const incomingTime = new Date(item.updatedAt).getTime();

    if (!existing) {
      await prisma.product.create({
        data: {
          sourceId: item.sourceId, categoryId: category.id, name: item.name, priceMode: item.priceMode,
          basePrice: item.basePrice ?? null, vipFixedPrice: item.vipFixedPrice ?? null, costPrice: item.costPrice ?? null,
          taxRate: item.taxRate ?? null, photo: item.photo ?? null, trackStock: !!item.trackStock, active: item.active,
          updatedAt: new Date(item.updatedAt),
        },
      });
      applied.push(item.sourceId);
      continue;
    }

    const existingTime = existing.updatedAt.getTime();
    if (existingTime > incomingTime) {
      // La version déjà en base est plus récente — refusé, journalisé, PAS de fusion silencieuse.
      await prisma.syncConflict.create({
        data: {
          tableName: "products", recordUuid: item.sourceId,
          localVersion: JSON.stringify(item), serverVersion: JSON.stringify(existing),
        },
      });
      conflicts.push(item.sourceId);
      continue;
    }

    await prisma.product.update({
      where: { sourceId: item.sourceId },
      data: {
        categoryId: category.id, name: item.name, priceMode: item.priceMode,
        basePrice: item.basePrice ?? null, vipFixedPrice: item.vipFixedPrice ?? null, costPrice: item.costPrice ?? null,
        taxRate: item.taxRate ?? null, photo: item.photo ?? null, trackStock: !!item.trackStock, active: item.active,
        updatedAt: new Date(item.updatedAt),
      },
    });
    applied.push(item.sourceId);
  }

  return { applied, conflicts, rejected };
}
