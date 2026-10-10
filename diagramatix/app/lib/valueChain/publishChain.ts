import { prisma } from "@/app/lib/db";

/**
 * Publish a chain: freeze its current narrative, title and every prompt as the PUBLISHED version, which is what other people in the
 * repository (the Org's users, or everyone for the master) see and create projects from. Drafts stay private to those who manage the chain.
 *
 * The one implementation of "publish" — the maintenance screens call it, and so does "Create a New Value Chain" when a chain has been
 * written in full.
 */
export async function publishChainById(chainId: string): Promise<void> {
  const c = await prisma.valueChainLibrary.findUnique({ where: { id: chainId }, include: { prompts: true } });
  if (!c) return;
  await prisma.valueChainLibrary.update({
    where: { id: c.id },
    data: { publishedNarrative: c.narrative, publishedTitle: c.title, publishedAt: new Date() },
  });
  for (const p of c.prompts) {
    await prisma.valueChainPrompt.update({ where: { id: p.id }, data: { publishedPrompt: p.prompt } });
  }
}
