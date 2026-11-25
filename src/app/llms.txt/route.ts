import { BRAND, CHAIN } from "@/config/brand";
import { CONTRACTS, CONTRACT_NAME, bookLive } from "@/config/contracts";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${BRAND.name}`,
    "",
    `> ${BRAND.slogan} ${BRAND.tagline} A rule studio for stock-token agents on ${CHAIN.name} (chain ${CHAIN.id}): a deterministic parser turns a plain-English buy strategy into a rule set (one proven stock token, weekdays and UTC hours, max per order, max per 1/7/30-day period, an approval threshold, a minimum gap, a validity window) and asks clarification questions instead of guessing. A scenario lab runs test orders and names the rule behind every accept or refuse. ${CONTRACT_NAME} stores each version as a commitment (keccak256 of the canonical rule text + the key limits), the owner approves an exact version, checkOrder returns a reason bitmask, and recordOrder journals the agent's orders without moving tokens. Prototype; no token needed. Not affiliated with Robinhood.`,
    "",
    `Studio: ${BRAND.url}/studio`,
    `Dashboard: ${BRAND.url}/dashboard`,
    `Supported assets with on-chain proof (JSON): ${BRAND.url}/api/assets`,
    `Rule books of a wallet (JSON): ${BRAND.url}/api/books?owner=<address> or ?agent=<address>`,
    `${CONTRACT_NAME}: ${bookLive() ? CONTRACTS.book : "not deployed yet"}`,
    `Method and limits: ${BRAND.url}/method`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
