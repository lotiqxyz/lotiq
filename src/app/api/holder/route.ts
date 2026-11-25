import { NextResponse } from "next/server";
import { allow, allowPublic, tooMany } from "@/lib/guard";
import { authWallet, readTier, revokeSession } from "@/lib/server/holder";
import { dataStore } from "@/lib/server/data";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/* GET /api/holder (Authorization: Lotiq <signed session>) → the wallet's tier read from chain now (cached ≤ 30 s), with the numbers. */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "holder", 30, 600))) return tooMany();
  const a = await authWallet(request);
  if (!a.ok) return NextResponse.json({ error: a.reason }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!(await allow(getStore(), "holder-w", [a.wallet], 30, 60))) return tooMany();
  const tier = await readTier(a.wallet);
  return NextResponse.json({ wallet: a.wallet, ...tier, persistent: dataStore().persistent }, { headers: { "cache-control": "no-store" } });
}

/* DELETE /api/holder → sign out: this session's nonce is refused from now until it expires. */
export async function DELETE(request: Request) {
  if (!(await allowPublic(getStore(), request, "holder", 30, 600))) return tooMany();
  const a = await authWallet(request);
  if (!a.ok) return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  try {
    await revokeSession(dataStore().store, a.nonce, a.expiresAt);
  } catch {
    return NextResponse.json({ error: "Sign out could not be stored; close the tab to drop the session." }, { status: 507, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
