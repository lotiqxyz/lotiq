import { NextResponse } from "next/server";
import { allow, allowPublic, badBody, readBody, tooLarge, tooMany } from "@/lib/guard";
import { authWallet, readTier } from "@/lib/server/holder";
import { MemoryFull, dataStore } from "@/lib/server/data";
import { runOnServer } from "@/lib/server/hosted";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";

/* POST /api/hosted/run {rule} → the standard scenario lab computed on the server, counted against the tier's daily quota and kept. */
export async function POST(request: Request) {
  if (!(await allowPublic(getStore(), request, "hosted-run", 30, 600))) return tooMany();
  const a = await authWallet(request);
  if (!a.ok) return NextResponse.json({ error: a.reason }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!(await allow(getStore(), "hosted-run-w", [a.wallet], 30, 60))) return tooMany();
  const body = await readBody<{ rule?: unknown }>(request, 8000);
  if (!body.ok) return body.tooLarge ? tooLarge() : badBody();
  const t = await readTier(a.wallet);
  let r: Awaited<ReturnType<typeof runOnServer>>;
  try {
    r = await runOnServer(dataStore().store, a.wallet, t.tier, body.value.rule, Math.floor(Date.now() / 1000));
  } catch (e) {
    if (e instanceof MemoryFull) return NextResponse.json({ error: e.message }, { status: 507, headers: { "cache-control": "no-store" } });
    throw e;
  }
  if (!r.ok) return NextResponse.json({ error: r.error, tier: t.tier }, { status: r.status, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ run: r.run, usedToday: r.usedToday, tier: t.tier, quota: t.quotas.runsPerDay }, { headers: { "cache-control": "no-store" } });
}
