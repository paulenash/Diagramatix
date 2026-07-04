/** Shared handler bodies for the Risk & Control item/link/library routes, used
 *  by BOTH the org and project route trees (they differ only in the auth guard
 *  and the ownership scope). Each verifies the library belongs to the scope,
 *  then performs the op and returns a NextResponse. */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { ownedLibrary } from "./routeAuth";
import { createItem, updateItem, deleteItem, linkMitigation, unlinkMitigation, ItemOpError } from "./itemOps";

type Scope = { orgId?: string; projectId?: string };

const opErr = (err: unknown) => {
  if (err instanceof ItemOpError) return NextResponse.json({ error: err.message }, { status: err.status });
  throw err;
};

export async function hRenameLibrary(libraryId: string, scope: Scope, body: { name?: unknown }) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const library = await prisma.riskControlLibrary.update({ where: { id: libraryId }, data: { name } });
  return NextResponse.json({ library });
}

export async function hDeleteLibrary(libraryId: string, scope: Scope) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  await prisma.riskControlLibrary.delete({ where: { id: libraryId } });
  return NextResponse.json({ ok: true });
}

export async function hCreateItem(libraryId: string, scope: Scope, body: Record<string, unknown>) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  try { const item = await createItem(libraryId, body); return NextResponse.json({ item }, { status: 201 }); }
  catch (err) { return opErr(err); }
}

export async function hUpdateItem(libraryId: string, itemId: string, scope: Scope, body: Record<string, unknown>) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  try { const item = await updateItem(libraryId, itemId, body); return NextResponse.json({ item }); }
  catch (err) { return opErr(err); }
}

export async function hDeleteItem(libraryId: string, itemId: string, scope: Scope) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  try { await deleteItem(libraryId, itemId); return NextResponse.json({ ok: true }); }
  catch (err) { return opErr(err); }
}

export async function hLink(libraryId: string, scope: Scope, body: { controlId?: unknown; riskId?: unknown }) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  const controlId = typeof body.controlId === "string" ? body.controlId : "";
  const riskId = typeof body.riskId === "string" ? body.riskId : "";
  if (!controlId || !riskId) return NextResponse.json({ error: "controlId and riskId required" }, { status: 400 });
  try { const link = await linkMitigation(libraryId, controlId, riskId); return NextResponse.json({ link }, { status: 201 }); }
  catch (err) { return opErr(err); }
}

export async function hUnlink(libraryId: string, scope: Scope, body: { controlId?: unknown; riskId?: unknown }) {
  const notOwned = await ownedLibrary({ id: libraryId, ...scope }); if (notOwned) return notOwned;
  const controlId = typeof body.controlId === "string" ? body.controlId : "";
  const riskId = typeof body.riskId === "string" ? body.riskId : "";
  if (!controlId || !riskId) return NextResponse.json({ error: "controlId and riskId required" }, { status: 400 });
  await unlinkMitigation(libraryId, controlId, riskId);
  return NextResponse.json({ ok: true });
}
