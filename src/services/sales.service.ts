import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error.middleware";
import type { OrderType, PaymentMethod } from "@prisma/client";
import { createMovement } from "./stock.service";

export async function list(since?: string) {
  return prisma.sale.findMany({
    where: since ? { createdAt: { gte: new Date(since) } } : {},
    include: { items: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: since ? undefined : 200,
  });
}

export interface SaleItemInput {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}
export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  changeGiven?: number;
}

export async function create(data: {
  cashierId: number; serverId?: number; zoneId?: number; tableId?: number; seatId?: number;
  orderType: OrderType; items: SaleItemInput[]; payments: PaymentInput[]; discount?: number;
}) {
  if (!data.items || data.items.length === 0) throw new ApiError(400, "La vente doit contenir au moins un article.");
  const discount = data.discount ?? 0;
  const subtotal = data.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
  const total = subtotal - discount;
  if (total < 0) throw new ApiError(400, "Le total ne peut pas être négatif.");
  const paidTotal = (data.payments ?? []).reduce((s, p) => s + p.amount, 0);
  if (paidTotal < total) throw new ApiError(400, "Le total payé ne couvre pas le montant de la vente.");

  // Transaction atomique : soit tout réussit (vente + lignes + paiements + déduction de stock),
  // soit rien n'est appliqué — évite qu'une panne en cours de route laisse une vente enregistrée
  // sans déduction de stock correspondante (ou l'inverse).
  return prisma.$transaction(async (tx) => {
    const last = await tx.sale.findFirst({ orderBy: { ticketNumber: "desc" }, select: { ticketNumber: true } });
    const ticketNumber = (last?.ticketNumber ?? 0) + 1;

    const sale = await tx.sale.create({
      data: {
        ticketNumber,
        cashierId: data.cashierId,
        serverId: data.serverId ?? null,
        zoneId: data.zoneId ?? null,
        tableId: data.tableId ?? null,
        seatId: data.seatId ?? null,
        orderType: data.orderType,
        subtotal, discount, total,
        items: { create: data.items.map((it) => ({ productId: it.productId, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice })) },
        payments: { create: (data.payments ?? []).map((p) => ({ method: p.method, amount: p.amount, cashReceived: p.cashReceived ?? null, changeGiven: p.changeGiven ?? null })) },
      },
    });

    // 🔴 Déduction de stock via createMovement() — RÈGLE ABSOLUE, voir stock.service.ts en tête de
    // fichier : plus aucun code de ce projet n'écrit Stock.quantity directement. Le paramètre `tx`
    // fait participer cette déduction à LA MÊME transaction que la création de la vente elle-même
    // (atomique : soit les deux réussissent, soit aucune des deux n'est appliquée) — createMovement()
    // accepte justement ce paramètre pour permettre cela sans transaction imbriquée.
    //
    // Comportement PRÉSERVÉ à l'identique de l'ancien code : seuls les produits ayant DÉJÀ une
    // ligne Stock (donc suivis) génèrent un mouvement — createMovement() créerait sinon une ligne
    // Stock à zéro pour n'importe quel article vendu, y compris ceux jamais destinés à être suivis
    // (un plat cuisiné, par exemple), ce que l'ancien code évitait déjà via `if (stock)`.
    for (const it of data.items) {
      const existingStock = await tx.stock.findFirst({ where: { productId: it.productId } });
      if (existingStock) {
        await createMovement({ productId: it.productId, kind: "vente", quantity: it.quantity, saleId: sale.id }, tx);
      }
    }

    return { id: sale.id, ticketNumber: sale.ticketNumber, total: sale.total };
  });
}

export async function cancel(saleId: number, reason: string) {
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale) throw new ApiError(404, "Vente introuvable.");
  if (sale.status === "annulee") throw new ApiError(409, "Cette vente est déjà annulée.");

  await prisma.$transaction(async (tx) => {
    await tx.sale.update({ where: { id: saleId }, data: { status: "annulee", cancelledReason: reason || null } });

    // Restitution du stock — miroir exact de l'encaissement, même règle absolue (voir create()
    // ci-dessus) : createMovement() participe à la même transaction via `tx`, jamais d'écriture
    // directe. "retour_client" est le type de mouvement sémantiquement correct pour une
    // restitution suite à annulation — remplace l'ancien "ajustement", plus précis désormais que
    // le module Stock distingue les types (l'ancien code datait d'avant cette distinction).
    for (const it of sale.items) {
      const existingStock = await tx.stock.findFirst({ where: { productId: it.productId } });
      if (existingStock) {
        await createMovement({ productId: it.productId, kind: "retour_client", quantity: it.quantity, saleId, reference: `annulation-vente-${saleId}` }, tx);
      }
    }
  });
}
