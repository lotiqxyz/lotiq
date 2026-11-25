#!/usr/bin/env node
// A minimal Lotiq agent (Node + viem). It never decides what to buy: it reads the rule set its owner approved, asks the contract
// whether an order fits, and only then records it in the rule book's order journal. Recording moves no tokens.
//
//   RPC_URL=https://rpc.mainnet.chain.robinhood.com BOOK=0x<LotiqRuleBook> AGENT_KEY=0x<agent private key> node examples/agent.mjs status
//   ... node examples/agent.mjs record <bookId> <usd> [nonce]
//
// status  lists the rule books whose approved versions name this agent, with the active version's limits.
// record  checks first (checkOrder at the latest block time); refused => prints the rules that failed and exits 3; else sends recordOrder.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ART = JSON.parse(readFileSync(new URL("../src/lib/contracts/artifacts.json", import.meta.url), "utf8"));
const ABI = ART.contracts.LotiqRuleBook.abi;
const SOL = readFileSync(new URL("../contracts/src/LotiqRuleMath.sol", import.meta.url), "utf8");
const BITS = [...SOL.matchAll(/uint256 internal constant R_([A-Z_]+) = 1 << (\d+);/g)].map((m) => [m[1], Number(m[2])]);
const names = (bits) => BITS.filter(([, s]) => (bits >> BigInt(s)) & 1n).map(([n]) => n);

const { RPC_URL, BOOK, AGENT_KEY } = process.env;
if (!RPC_URL || !BOOK || !AGENT_KEY) {
  console.error("set RPC_URL, BOOK and AGENT_KEY");
  process.exit(2);
}
const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const account = privateKeyToAccount(AGENT_KEY);
const pub = createPublicClient({ chain, transport: http(RPC_URL, { timeout: 60_000, retryCount: 3 }) });
const wallet = createWalletClient({ chain, account, transport: http(RPC_URL, { timeout: 60_000, retryCount: 3 }) });
const read = (functionName, args = []) => pub.readContract({ address: BOOK, abi: ABI, functionName, args });
const usd = (v) => `$${(Number(v) / 1e6).toFixed(2)}`;

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "status") {
  const ids = await read("booksOfAgent", [account.address]);
  console.log(`agent ${account.address}: ${ids.length} rule book(s)`);
  for (const id of ids) {
    const b = await read("getBook", [id]);
    if (!b.active) {
      console.log(`#${id}: no approved version`);
      continue;
    }
    const v = await read("getVersion", [id, b.active]);
    const mine = v.agent.toLowerCase() === account.address.toLowerCase();
    console.log(`#${id} v${b.active} ${mine ? "bound to me" : "bound to another agent"} asset ${v.asset} max/order ${usd(v.maxPerOrder)} max/period ${usd(v.maxPerPeriod)} spent ${usd(b.spent)} paused ${b.paused} revoked ${b.revoked}`);
  }
} else if (cmd === "record") {
  const id = BigInt(args[0]);
  const amount = BigInt(Math.round(Number(args[1]) * 1e6));
  const nonce = BigInt(args[2] ?? Date.now() % 1e9);
  const b = await read("getBook", [id]);
  if (!b.active) {
    console.log("REFUSED no approved version");
    process.exit(3);
  }
  const v = await read("getVersion", [id, b.active]);
  const block = await pub.getBlock();
  const bits = await read("checkOrder", [id, account.address, b.active, v.asset, amount, nonce, block.timestamp]);
  if (bits !== 0n) {
    console.log(`REFUSED bits=${bits} ${names(bits).join(",")}`);
    process.exit(3);
  }
  const hash = await wallet.writeContract({ address: BOOK, abi: ABI, functionName: "recordOrder", args: [id, b.active, v.asset, amount, nonce, stringToHex(`agent-${nonce}`, { size: 32 })] });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") {
    console.log(`FAILED tx ${hash}`);
    process.exit(1);
  }
  console.log(`RECORDED ${usd(amount)} nonce ${nonce} tx ${hash} gas ${rc.gasUsed}`);
} else {
  console.log("usage: agent.mjs status | record <bookId> <usd> [nonce]");
  process.exit(2);
}
