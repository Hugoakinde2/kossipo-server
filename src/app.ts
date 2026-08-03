/**
 * app.ts — Assemblage de l'API REST KOSSIPO (v2, PostgreSQL/Prisma).
 */
import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";
import authRoutes from "./routes/auth.routes";
import usersRoutes from "./routes/users.routes";
import catalogRoutes from "./routes/catalog.routes";
import tablesRoutes from "./routes/tables.routes";
import ordersRoutes from "./routes/orders.routes";
import salesRoutes from "./routes/sales.routes";
import stockRoutes from "./routes/stock.routes";
import inventoryRoutes from "./routes/inventory.routes";
import statsRoutes from "./routes/stats.routes";
import backupsRoutes from "./routes/backups.routes";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware";
import openapiSpec from "./docs/openapi.json";

export function mountApiV1(app: Express) {
  const api = express.Router();

  api.use("/auth", authRoutes);
  api.use("/users", usersRoutes);
  api.use("/catalog", catalogRoutes);
  api.use("/tables", tablesRoutes);
  api.use("/orders", ordersRoutes);
  api.use("/sales", salesRoutes);
  api.use("/stock", stockRoutes);
  api.use("/inventory", inventoryRoutes);
  api.use("/stats", statsRoutes);
  api.use("/backups", backupsRoutes);

  app.use("/api/v1", api);
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

  // 404 et gestion d'erreurs : montés en dernier, après toutes les routes réelles.
  app.use(notFoundHandler);
  app.use(errorHandler);
}
