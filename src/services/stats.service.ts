import { prisma } from "../lib/prisma";

export async function today(since?: string, until?: string) {
  const start = since ? new Date(since) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const end = until ? new Date(until) : new Date();

  const sales = await prisma.sale.findMany({
    where: { status: "validee", createdAt: { gte: start, lte: end } },
    include: { items: true },
  });

  const total = sales.reduce((s, v) => s + v.total, 0);

  const byHourMap = new Map<string, number>();
  sales.forEach((s) => {
    const hour = s.createdAt.toISOString().slice(11, 13);
    byHourMap.set(hour, (byHourMap.get(hour) ?? 0) + s.total);
  });
  const byHour = [...byHourMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hour, total]) => ({ hour, total }));

  const byServerMap = new Map<number, number>();
  sales.forEach((s) => { if (s.serverId) byServerMap.set(s.serverId, (byServerMap.get(s.serverId) ?? 0) + s.total); });
  const byServer = [...byServerMap.entries()].map(([server_id, total]) => ({ server_id, total }));

  const byCashierMap = new Map<number, number>();
  sales.forEach((s) => byCashierMap.set(s.cashierId, (byCashierMap.get(s.cashierId) ?? 0) + s.total));
  const byCashier = [...byCashierMap.entries()].map(([cashier_id, total]) => ({ cashier_id, total }));

  const topMap = new Map<string, number>();
  sales.forEach((s) => s.items.forEach((it) => topMap.set(it.name, (topMap.get(it.name) ?? 0) + it.quantity)));
  const topProducts = [...topMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, qty]) => ({ name, qty }));

  return { revenue: { total, count: sales.length }, byHour, byServer, byCashier, topProducts };
}
