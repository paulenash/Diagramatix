import { PrismaClient } from "../../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const ps = await prisma.project.findMany({
    where: { OR: [{ exampleType: { not: null } }, { name: { contains: "Demo" } }] },
    select: { id: true, name: true, exampleType: true, sourceExampleId: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  for (const p of ps)
    console.log(`${(p.exampleType ?? "—").padEnd(13)} src=${p.sourceExampleId ? "set" : "null"}  created=${p.createdAt.toISOString().slice(0,16)}  updated=${p.updatedAt.toISOString().slice(0,16)}  ${p.name}`);
  await prisma.$disconnect();
}
main().catch(e=>{console.log("ERR "+e.message.slice(0,150));process.exit(0);});
