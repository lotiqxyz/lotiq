import { allowPublic, tooMany } from "@/lib/guard";
import { readBoard } from "@/lib/server/stocks";
import { fail, ok } from "@/lib/server/respond";
import { getStore } from "@/lib/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/*
 * GET /api/assets → the stock tokens Lotiq supports, each proven live on Robinhood Chain (proxy code hash, beacon slot, minted
 * supply), with every matching Chainlink feed's latest answer and update time. One refresh at a time; the last usable board is
 * served when a refresh fails (src/lib/server/stocks.ts). CDN may keep it 30 s.
 */
export async function GET(request: Request) {
  if (!(await allowPublic(getStore(), request, "assets", 30, 600))) return tooMany();
  try {
    const board = await readBoard();
    if (!board.stocks.length) return fail(new Error("no stocks"));
    return ok(board, 30);
  } catch (e) {
    return fail(e);
  }
}
