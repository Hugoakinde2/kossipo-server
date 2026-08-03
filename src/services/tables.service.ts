import { prisma } from "../lib/prisma";
import type { SeatStatus } from "@prisma/client";

export async function listZones() {
  return prisma.restaurantZone.findMany({ orderBy: { id: "asc" } });
}

export async function listTables() {
  const tables = await prisma.restaurantTable.findMany({
    include: { zone: true, seats: { orderBy: { seatNumber: "asc" } } },
    orderBy: [{ zoneId: "asc" }, { code: "asc" }],
  });
  return tables.map((t) => ({
    id: t.id, code: t.code, seat_count: t.seatCount,
    zone_code: t.zone.code, zone_label: t.zone.label, is_vip: t.zone.isVip,
    seats: t.seats,
  }));
}

export async function updateSeatStatus(seatId: number, status: SeatStatus) {
  await prisma.tableSeat.update({ where: { id: seatId }, data: { status } });
}
