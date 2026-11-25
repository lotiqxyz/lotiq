import { NextResponse } from "next/server";
import { allow, allowPublic, badBody, readBody, tooLarge, tooMany } from "@/lib/guard";
import { MAX_BOOK_BYTES } from "@/config/quotas";
import { authWallet, readTier } from "@/lib/server/holder";
import { MemoryFull, dataStore } from "@/lib/server/data";
import { deleteBook, listBooks, listRuns, saveBook } from "@/lib/server/hosted";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

/*
 * Hosted rule books + server scenario history for the signed-in wallet.
 *   GET            → { books, runs, tier, persistent }   (also the export: the whole answer is plain JSON)
 *   PUT {id,label,book} → save / replace one book, inside the tier's quota
 *   DELETE ?id=    → remove one book
 */
async function gate(request: Request) {
  if (!(await allowPublic(getStore(), request, "hosted", 60, 1200))) return { res: tooMany() };
  const a = await authWallet(request);
  if (!a.ok) return { res: NextResponse.json({ error: a.reason }, { status: 401, headers: noStore }) };
  if (!(await allow(getStore(), "hosted-w", [a.wallet], 60, 60))) return { res: tooMany() };
  return { wallet: a.wallet };
}

export async function GET(request: Request) {
  const g = await gate(request);
  if (!g.wallet) return g.res;
  const t = await readTier(g.wallet);
  const { store, persistent } = dataStore();
  const [books, runs] = await Promise.all([listBooks(store, g.wallet), listRuns(store, g.wallet, t.tier)]);
  return NextResponse.json({ wallet: g.wallet, tier: t, books, runs, persistent, exportedAt: new Date().toISOString() }, { headers: noStore });
}

export async function PUT(request: Request) {
  const g = await gate(request);
  if (!g.wallet) return g.res;
  const body = await readBody<{ id?: unknown; label?: unknown; book?: unknown }>(request, MAX_BOOK_BYTES + 2000);
  if (!body.ok) return body.tooLarge ? tooLarge() : badBody();
  const t = await readTier(g.wallet);
  let r: Awaited<ReturnType<typeof saveBook>>;
  try {
    r = await saveBook(dataStore().store, g.wallet, t.tier, body.value, Math.floor(Date.now() / 1000));
  } catch (e) {
    if (e instanceof MemoryFull) return NextResponse.json({ error: e.message }, { status: 507, headers: noStore });
    throw e;
  }
  if (!r.ok) return NextResponse.json({ error: r.error, tier: t.tier }, { status: r.status, headers: noStore });
  return NextResponse.json({ books: r.books, tier: t.tier }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const g = await gate(request);
  if (!g.wallet) return g.res;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return NextResponse.json({ error: "Give ?id=" }, { status: 400, headers: noStore });
  return NextResponse.json({ books: await deleteBook(dataStore().store, g.wallet, id) }, { headers: noStore });
}
