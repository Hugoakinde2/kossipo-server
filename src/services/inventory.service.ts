/**
 * services/inventory.service.ts — Module d'inventaire (absent avant l'audit du module Stock).
 * ---------------------------------------------------------------------------
 * Un inventaire compare le stock théorique (ce que le système croit avoir) au stock réel compté
 * physiquement. À la clôture, chaque écart génère un mouvement de type "inventaire" via
 * stock.service.ts::createMovement() — jamais d'écriture directe sur Stock.quantity, cohérent avec
 * la règle absolue du module. Un inventaire clôturé n'est jamais rouvert ni supprimé : historisé
 * intégralement (statut passe à "cloture", les lignes restent consultables indéfiniment).
 */
import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error.middleware";
import { createMovement } from "./stock.service";

/** Démarre un inventaire — partiel (liste de produits/ingrédients donnée) ou complet (tout le stock suivi). */
export async function start(input: { label?: string; startedById?: number; productIds?: number[]; ingredientIds?: number[] }) {
  const isPartial = (input.productIds && input.productIds.length > 0) || (input.ingredientIds && input.ingredientIds.length > 0);

  const stockRows = isPartial
    ? await prisma.stock.findMany({
        where: {
          OR: [
            input.productIds?.length ? { productId: { in: input.productIds } } : undefined,
            input.ingredientIds?.length ? { ingredientId: { in: input.ingredientIds } } : undefined,
          ].filter(Boolean) as any,
        },
      })
    : await prisma.stock.findMany();

  if (stockRows.length === 0) throw new ApiError(400, "Aucun article suivi ne correspond à cet inventaire.");

  const inventory = await prisma.inventory.create({
    data: {
      label: input.label || (isPartial ? "Inventaire partiel" : "Inventaire complet"),
      status: "en_cours",
      startedById: input.startedById ?? null,
      items: {
        create: stockRows.map((s) => ({
          productId: s.productId, ingredientId: s.ingredientId, expectedQty: s.quantity, countedQty: null,
        })),
      },
    },
    include: { items: true },
  });
  return inventory;
}

export async function get(id: number) {
  const inventory = await prisma.inventory.findUnique({
    where: { id },
    include: { items: { include: { product: true, ingredient: true } }, startedBy: true },
  });
  if (!inventory) throw new ApiError(404, "Inventaire introuvable.");
  return inventory;
}

export async function list(limit = 50) {
  return prisma.inventory.findMany({ orderBy: { startedAt: "desc" }, take: limit, include: { startedBy: true } });
}

/** Enregistre la quantité comptée pour une ligne — ne modifie jamais le stock lui-même (voir close()). */
export async function setCounted(inventoryId: number, itemId: number, countedQty: number) {
  const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
  if (!inventory) throw new ApiError(404, "Inventaire introuvable.");
  if (inventory.status === "cloture") throw new ApiError(409, "Cet inventaire est déjà clôturé — un inventaire clôturé ne peut plus être modifié.");
  const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item || item.inventoryId !== inventoryId) throw new ApiError(404, "Ligne d'inventaire introuvable.");
  await prisma.inventoryItem.update({ where: { id: itemId }, data: { countedQty } });
}

/**
 * Clôture l'inventaire : génère automatiquement UN mouvement de type "inventaire" par écart
 * constaté (compté ≠ théorique) via createMovement() — jamais d'écriture directe. Un écart demande
 * une justification (paramètre `reasons`, un motif par ligne en écart) ; sans elle, la clôture est
 * refusée pour cette ligne plutôt que d'accepter un écart non expliqué silencieusement.
 */
export async function close(inventoryId: number, userId: number | undefined, reasons: Record<number, string>) {
  const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId }, include: { items: true } });
  if (!inventory) throw new ApiError(404, "Inventaire introuvable.");
  if (inventory.status === "cloture") throw new ApiError(409, "Cet inventaire est déjà clôturé.");

  const counted = inventory.items.filter((it) => it.countedQty !== null);
  if (counted.length === 0) throw new ApiError(400, "Aucune ligne comptée — rien à clôturer.");

  const uncounted = inventory.items.length - counted.length;
  const movements: unknown[] = [];

  for (const item of counted) {
    const variance = (item.countedQty as number) - item.expectedQty;
    if (variance === 0) continue; // pas d'écart, pas de mouvement — un journal ne doit pas s'alourdir d'entrées "rien à signaler"
    const reason = reasons[item.id];
    if (!reason?.trim()) {
      throw new ApiError(400, `Un écart a été constaté sur la ligne ${item.id} (${variance > 0 ? "+" : ""}${variance}) sans justification — clôture refusée tant que chaque écart n'est pas expliqué.`);
    }
    const result = await createMovement({
      productId: item.productId ?? undefined, ingredientId: item.ingredientId ?? undefined,
      kind: "inventaire", quantity: item.countedQty as number, reason, reference: `inventaire-${inventoryId}`, userId,
    });
    movements.push(result.movement);
  }

  await prisma.inventory.update({ where: { id: inventoryId }, data: { status: "cloture", closedAt: new Date() } });
  return { closed: true, movementsCreated: movements.length, uncountedItems: uncounted };
}
