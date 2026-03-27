import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  // PGlite is single-threaded — limit Prisma to 2 connections
  const adapter = new PrismaPg({ connectionString, max: 2 });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Separate pool for raw SQL (templates, JSON field writes)
// PGlite is single-threaded — keep this small to avoid connection starvation
export const pgPool = globalForPrisma.pgPool ?? new pg.Pool({
  connectionString: process.env.DATABASE_URL!.split("?")[0] + "?sslmode=disable",
  connectionTimeoutMillis: 120_000,
  idleTimeoutMillis: 30_000,
  max: 2,
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pgPool;
}
