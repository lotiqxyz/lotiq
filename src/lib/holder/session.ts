import { getAddress, recoverMessageAddress } from "viem";
import { BRAND } from "@/config/brand";
import { HOLDER_DIVISOR, SESSION_MAX_SECONDS } from "@/config/quotas";

/*
 * Holder session without a server secret, as an EIP-4361 (Sign-In with Ethereum) message, so wallets can warn when the domain in the
 * message is not the site asking. The wallet signs ONE message (personal_sign, no gas) with the site's domain and URI, chain 4663, a
 * random nonce, the issue time and an expiry at most 4 h later. The signed message is the bearer credential: the browser keeps it in
 * sessionStorage and sends it with each hosted request; the server re-checks signature, chain, expiry and that domain + URI are on a
 * FIXED allowlist from config (never the request's Host header) on every request. Sign out revokes the nonce on the server until it
 * expires (src/lib/server/holder.ts). EOA wallets only in v1 (no ERC-1271).
 */

export const SESSION_CHAIN_ID = 4663;
export const AUTH_SCHEME = "Lotiq";
const STATEMENT = "Sign in to the Lotiq hosted service (holder session). No gas, nothing moves.";
/** Local QA ports of this project; localhost is accepted only off Vercel. */
const LOCAL_PORTS = [6680, 6681];

/** Domains (host[:port]) a session may name, with the URI each must carry. */
export function allowedOrigins(env: { vercel?: string } = { vercel: process.env.VERCEL }): Map<string, string> {
  const m = new Map<string, string>([
    [BRAND.domain, `https://${BRAND.domain}`],
    [`www.${BRAND.domain}`, `https://www.${BRAND.domain}`],
  ]);
  if (env.vercel !== "1") for (const p of LOCAL_PORTS) for (const h of ["localhost", "127.0.0.1"]) m.set(`${h}:${p}`, `http://${h}:${p}`);
  return m;
}

export type SessionFields = { domain: string; uri: string; address: string; chainId: number; nonce: string; issuedAt: number; expiresAt: number };
export type Credential = { message: string; signature: `0x${string}` };

const iso = (t: number) => new Date(t * 1000).toISOString();

export function buildMessage(f: SessionFields): string {
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    getAddress(f.address),
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    "Version: 1",
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${iso(f.issuedAt)}`,
    `Expiration Time: ${iso(f.expiresAt)}`,
  ].join("\n");
}

export function parseMessage(m: string): SessionFields | null {
  if (m.length > 1200) return null;
  const lines = m.split("\n");
  const domain = lines[0]?.match(/^(\S+) wants you to sign in with your Ethereum account:$/)?.[1];
  const address = lines[1];
  if (!domain || !address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const line = (k: string) => m.match(new RegExp(`^${k}: (.+)$`, "m"))?.[1]?.trim() ?? null;
  const uri = line("URI");
  const chain = line("Chain ID");
  const nonce = line("Nonce");
  const iat = Date.parse(line("Issued At") ?? "");
  const exp = Date.parse(line("Expiration Time") ?? "");
  if (!uri || line("Version") !== "1" || !chain || !/^\d+$/.test(chain) || !nonce || !/^[0-9a-f]{16,64}$/.test(nonce)) return null;
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) return null;
  const f = { domain, uri, address: address.toLowerCase(), chainId: Number(chain), nonce, issuedAt: Math.floor(iat / 1000), expiresAt: Math.floor(exp / 1000) };
  // The text must be exactly what this site builds: nothing added, nothing reordered.
  return buildMessage(f) === m ? f : null;
}

export type Verified = { ok: true; address: string; nonce: string; expiresAt: number } | { ok: false; reason: string };

/** Full check of a credential at time `now` (seconds) against the fixed allowlist. */
export async function verifyCredential(c: Credential, now: number, allowed = allowedOrigins()): Promise<Verified> {
  const f = parseMessage(c.message);
  if (!f) return { ok: false, reason: "The signed message is not a Lotiq sign-in message." };
  if (allowed.get(f.domain) !== f.uri) return { ok: false, reason: "The session was signed for another site." };
  if (f.chainId !== SESSION_CHAIN_ID) return { ok: false, reason: "The session names another chain." };
  if (f.issuedAt > now + 60) return { ok: false, reason: "The session starts in the future." };
  if (f.expiresAt <= now) return { ok: false, reason: "The session has expired. Sign a new one." };
  if (f.expiresAt - f.issuedAt > SESSION_MAX_SECONDS) return { ok: false, reason: "A session may last at most 4 hours." };
  if (!/^0x[0-9a-fA-F]{130}$/.test(c.signature)) return { ok: false, reason: "Malformed signature." };
  let signer: string;
  try {
    signer = await recoverMessageAddress({ message: c.message, signature: c.signature });
  } catch {
    return { ok: false, reason: "The signature could not be read." };
  }
  if (signer.toLowerCase() !== f.address) return { ok: false, reason: "The signature is not from this wallet (smart-contract wallets are not supported in v1)." };
  return { ok: true, address: f.address, nonce: f.nonce, expiresAt: f.expiresAt };
}

export const encodeCredential = (c: Credential) => `${AUTH_SCHEME} ${btoa(JSON.stringify(c))}`;
export function decodeCredential(header: string | null): Credential | null {
  if (!header || header.length > 4000 || !header.startsWith(`${AUTH_SCHEME} `)) return null;
  try {
    const v = JSON.parse(atob(header.slice(AUTH_SCHEME.length + 1))) as Credential;
    return typeof v?.message === "string" && typeof v?.signature === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Holder rule: balance >= totalSupply / 1000 (integer division), and a zero supply makes nobody a holder. */
export function isHolder(balance: bigint, supply: bigint): boolean {
  if (supply <= 0n) return false;
  return balance >= supply / HOLDER_DIVISOR;
}
export const holderThreshold = (supply: bigint) => supply / HOLDER_DIVISOR;
