/**
 * prisma/seed.ts — Données de référence initiales (rôles, zones, tables, catégories).
 * ---------------------------------------------------------------------------
 * Reprend fidèlement migrations/002_seed.sql — 7 rôles, 3 zones, 41 tables
 * (18 Dehors × 3 sièges + 10 VIP Bas + 13 VIP Haut = 77 sièges), 5 catégories.
 * Idempotent (upsert) : peut être rejoué sans erreur ni doublon.
 *
 * Exécution : npm run prisma:seed (ou automatiquement après `prisma migrate dev`).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLES = [
  { code: "super_admin" as const, label: "Super Administrateur", permissions: { caisse: true, tables: true, prep: true, stock: true, stats: true, users: true, logs: true, settings: true, forceStockOverride: true } },
  { code: "admin" as const, label: "Administrateur", permissions: { caisse: true, tables: true, prep: true, stock: true, stats: true, users: false, logs: true, settings: true, forceStockOverride: false } },
  { code: "gerant" as const, label: "Gérant", permissions: { caisse: true, tables: true, prep: true, stock: true, stats: true, users: false, logs: true, settings: true, forceStockOverride: false } },
  { code: "caissier" as const, label: "Caissier", permissions: { caisse: true, tables: true, prep: true, stock: false, stats: false, users: false, logs: false, settings: false, forceStockOverride: false } },
  { code: "serveur" as const, label: "Serveur", permissions: { caisse: true, tables: true, prep: true, stock: false, stats: false, users: false, logs: false, settings: false, forceStockOverride: false } },
  { code: "cuisine" as const, label: "Cuisine", permissions: { caisse: false, tables: false, prep: true, stock: false, stats: false, users: false, logs: false, settings: false, forceStockOverride: false, prepZoneLock: "cuisine" } },
  { code: "bar" as const, label: "Bar", permissions: { caisse: false, tables: false, prep: true, stock: false, stats: false, users: false, logs: false, settings: false, forceStockOverride: false, prepZoneLock: "bar" } },
];

const ZONES = [
  { code: "dehors" as const, label: "Espace Dehors", isVip: false },
  { code: "vip_bas" as const, label: "VIP Bas", isVip: true },
  { code: "vip_haut" as const, label: "VIP Haut", isVip: true },
];

const CATEGORIES = [
  { code: "plats", label: "Plats", sortOrder: 1 },
  { code: "garnitures", label: "Garnitures", sortOrder: 2 },
  { code: "bieres", label: "Bières", sortOrder: 3 },
  { code: "vins", label: "Vins", sortOrder: 4 },
  { code: "sucreries", label: "Sucreries & Eau", sortOrder: 5 },
];

/**
 * PRODUITS — transcription fidèle et complète de DEFAULT_MENU dans
 * kossipo-electron/renderer/index.html (22 articles réels du restaurant, aucun inventé).
 * `sourceId` reprend exactement l'identifiant Electron (ex. "riz-poulet") — c'est la clé du
 * rapprochement idempotent ci-dessous (§ RESTAURATION) : si un article venait à manquer côté
 * PostgreSQL (suppression accidentelle, base recréée...), le rejouer ici le recrée SANS jamais
 * dupliquer ni écraser un article déjà présent (une modification faite depuis via l'API/Admin Web
 * est donc toujours respectée, pas réécrasée par le seed).
 */
const PRODUCTS = [
  { sourceId: "riz-poulet", name: "Riz sauce poulet", category: "plats", price: 1500, vipFixedPrice: null },
  { sourceId: "riz-poisson", name: "Riz sauce poisson", category: "plats", price: 2000, vipFixedPrice: null },
  { sourceId: "riz-boeuf", name: "Riz viande de bœuf", category: "plats", price: 1500, vipFixedPrice: null },
  { sourceId: "foutou-poulet", name: "Foutou banane sauce poulet", category: "plats", price: 1500, vipFixedPrice: null },
  { sourceId: "foutou-poisson", name: "Foutou banane sauce poisson", category: "plats", price: 2000, vipFixedPrice: null },
  { sourceId: "demi-poulet", name: "1/2 Poulet", category: "plats", price: 3000, vipFixedPrice: 4000 },
  { sourceId: "poulet-entier", name: "1 Poulet entier", category: "plats", price: 6000, vipFixedPrice: 8000 },
  { sourceId: "poulet-kossipo", name: "Poulet Kossipo", category: "plats", price: 6000, vipFixedPrice: 8000 },
  { sourceId: "frites", name: "Frites", category: "garnitures", price: 1500, vipFixedPrice: null },
  { sourceId: "alloco", name: "Alloco", category: "garnitures", price: 1500, vipFixedPrice: null },
  { sourceId: "bock66", name: "Bock 66", category: "bieres", price: 700, vipFixedPrice: null, trackStock: true },
  { sourceId: "beaufort", name: "Beaufort", category: "bieres", price: 700, vipFixedPrice: null, trackStock: true },
  { sourceId: "racine", name: "Racine", category: "bieres", price: 700, vipFixedPrice: null, trackStock: true },
  { sourceId: "heineken", name: "Heineken", category: "bieres", price: 1000, vipFixedPrice: null, trackStock: true },
  { sourceId: "vin-grand", name: "Vin Grande Bouteille", category: "vins", price: 2500, vipFixedPrice: null, trackStock: true },
  { sourceId: "vin-petit", name: "Vin Petite Bouteille", category: "vins", price: 1500, vipFixedPrice: null, trackStock: true },
  { sourceId: "eau", name: "Eau minérale", category: "sucreries", price: 500, vipFixedPrice: null, trackStock: true },
  { sourceId: "sucrerie", name: "Sucrerie classique", category: "sucreries", price: 500, vipFixedPrice: null, trackStock: true },
  { sourceId: "orangina", name: "Orangina", category: "sucreries", price: 1000, vipFixedPrice: null, trackStock: true },
  { sourceId: "schweppes-grand", name: "Schweppes Grande Bouteille", category: "sucreries", price: 1000, vipFixedPrice: null, trackStock: true },
  { sourceId: "schweppes-petit", name: "Schweppes Petite Bouteille", category: "sucreries", price: 500, vipFixedPrice: null, trackStock: true },
  { sourceId: "rhino", name: "Rhino", category: "sucreries", price: 500, vipFixedPrice: null, trackStock: true },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

async function main() {
  console.log("=== Seed KOSSIPO ===");

  for (const role of ROLES) {
    // uuid = code (déterministe, identique sur tous les environnements) — voir
    // kossipo-electron/src/main/sync.js pour l'explication complète de ce choix : les rôles sont
    // des données de référence semées identiquement partout, un uuid aléatoire romprait le
    // rapprochement lors de la synchronisation avec les postes de caisse.
    await prisma.role.upsert({
      where: { code: role.code },
      update: { label: role.label, permissions: role.permissions },
      create: { uuid: role.code, code: role.code, label: role.label, permissions: role.permissions },
    });
  }
  console.log(`✅ ${ROLES.length} rôles`);

  for (const zone of ZONES) {
    await prisma.restaurantZone.upsert({ where: { code: zone.code }, update: {}, create: zone });
  }
  console.log(`✅ ${ZONES.length} zones`);

  for (const cat of CATEGORIES) {
    await prisma.category.upsert({ where: { code: cat.code }, update: {}, create: cat });
  }
  console.log(`✅ ${CATEGORIES.length} catégories`);

  // ========================================================================
  // RESTAURATION DES PRODUITS — ne recrée QUE ce qui manque (recherché par
  // `sourceId`, jamais par nom seul, pour un rapprochement fiable même après
  // un renommage). Un produit déjà présent n'est JAMAIS modifié ici : une
  // édition faite depuis via Admin Web/l'API (prix changé, désactivé...)
  // n'est donc jamais écrasée par ce script — c'est le comportement attendu
  // d'une restauration, pas d'une resynchronisation forcée.
  // ========================================================================
  let restored = 0;
  let alreadyPresent = 0;
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { sourceId: p.sourceId } });
    if (existing) {
      alreadyPresent++;
      continue;
    }
    const category = await prisma.category.findUniqueOrThrow({ where: { code: p.category } });
    await prisma.product.create({
      data: {
        sourceId: p.sourceId,
        name: p.name,
        categoryId: category.id,
        priceMode: "fixed",
        basePrice: p.price,
        vipFixedPrice: p.vipFixedPrice ?? null,
        trackStock: !!p.trackStock,
        active: true,
      },
    });
    restored++;
    console.log(`  ↻ restauré : ${p.name}`);
  }
  console.log(`✅ Produits : ${alreadyPresent} déjà présents (non modifiés), ${restored} restauré(s).`);
  if (restored === 0 && alreadyPresent === PRODUCTS.length) {
    console.log("   Catalogue déjà complet — aucune restauration nécessaire.");
  }

  const dehors = await prisma.restaurantZone.findUniqueOrThrow({ where: { code: "dehors" } });
  const vipBas = await prisma.restaurantZone.findUniqueOrThrow({ where: { code: "vip_bas" } });
  const vipHaut = await prisma.restaurantZone.findUniqueOrThrow({ where: { code: "vip_haut" } });

  let tableCount = 0;
  let seatCount = 0;

  for (let i = 1; i <= 18; i++) {
    const table = await prisma.restaurantTable.upsert({
      where: { zoneId_code: { zoneId: dehors.id, code: `D${pad(i)}` } },
      update: {},
      create: { zoneId: dehors.id, code: `D${pad(i)}`, seatCount: 3 },
    });
    tableCount++;
    for (let s = 1; s <= 3; s++) {
      await prisma.tableSeat.upsert({
        where: { tableId_seatNumber: { tableId: table.id, seatNumber: s } },
        update: {},
        create: { tableId: table.id, seatNumber: s },
      });
      seatCount++;
    }
  }

  for (let i = 1; i <= 10; i++) {
    const table = await prisma.restaurantTable.upsert({
      where: { zoneId_code: { zoneId: vipBas.id, code: `B${pad(i)}` } },
      update: {},
      create: { zoneId: vipBas.id, code: `B${pad(i)}`, seatCount: 1 },
    });
    tableCount++;
    await prisma.tableSeat.upsert({
      where: { tableId_seatNumber: { tableId: table.id, seatNumber: 1 } },
      update: {},
      create: { tableId: table.id, seatNumber: 1 },
    });
    seatCount++;
  }

  for (let i = 1; i <= 13; i++) {
    const table = await prisma.restaurantTable.upsert({
      where: { zoneId_code: { zoneId: vipHaut.id, code: `H${pad(i)}` } },
      update: {},
      create: { zoneId: vipHaut.id, code: `H${pad(i)}`, seatCount: 1 },
    });
    tableCount++;
    await prisma.tableSeat.upsert({
      where: { tableId_seatNumber: { tableId: table.id, seatNumber: 1 } },
      update: {},
      create: { tableId: table.id, seatNumber: 1 },
    });
    seatCount++;
  }

  console.log(`✅ ${tableCount} tables (attendu 41), ${seatCount} sièges (attendu 77)`);
  console.log("=== Seed terminé ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
