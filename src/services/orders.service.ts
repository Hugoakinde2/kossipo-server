import { prisma } from "../lib/prisma";
import { ApiError } from "../middlewares/error.middleware";
import type { OrderType, PrepStatus, PrepZone } from "@prisma/client";

export async function listActive() {
  return prisma.order.findMany({
    where: { status: { notIn: ["encaissee", "annulee"] } },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
}

export interface OrderItemInput {
  productId: number;
  variantId?: number;
  quantity: number;
  unitPrice: number;
  note?: string;
  prepZone?: PrepZone;
}

export async function create(data: {
  tableId?: number; seatId?: number; zoneId?: number; orderType: OrderType; openedById?: number; items: OrderItemInput[];
}) {
  if (!data.items || data.items.length === 0) throw new ApiError(400, "La commande doit contenir au moins un article.");
  const order = await prisma.order.create({
    data: {
      tableId: data.tableId ?? null,
      seatId: data.seatId ?? null,
      zoneId: data.zoneId ?? null,
      orderType: data.orderType,
      status: "ouverte",
      openedById: data.openedById ?? null,
      items: {
        create: data.items.map((it) => ({
          productId: it.productId,
          variantId: it.variantId ?? null,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          note: it.note ?? null,
          prepZone: it.prepZone ?? null,
          prepStatus: "nouveau",
        })),
      },
    },
    include: { items: true },
  });
  return { id: order.id, items: order.items };
}

export async function updateItemStatus(itemId: number, prepStatus: PrepStatus) {
  await prisma.orderItem.update({ where: { id: itemId }, data: { prepStatus } });
}

export async function close(orderId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new ApiError(404, "Commande introuvable.");
  await prisma.order.update({ where: { id: orderId }, data: { status: "encaissee" } });
}
