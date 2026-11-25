"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { SESSION_CHAIN_ID, buildMessage, encodeCredential, parseMessage, type Credential } from "@/lib/holder/session";

/*
 * The signed holder session in this tab: one personal_sign (no gas), kept in sessionStorage per wallet, sent as the Authorization header
 * with every hosted request. The server re-verifies it each time; nothing secret lives on the server.
 */
const KEY = (addr: string) => `lq.session.${addr.toLowerCase()}`;
const HOURS = 4;

function load(addr: string | null): Credential | null {
  if (!addr) return null;
  try {
    const raw = sessionStorage.getItem(KEY(addr));
    if (!raw) return null;
    const c = JSON.parse(raw) as Credential;
    const f = parseMessage(c.message);
    if (!f || f.expiresAt <= Date.now() / 1000 || f.domain !== window.location.host) return null;
    return c;
  } catch {
    return null;
  }
}

export function useSession() {
  const wallet = useWallet();
  const [cred, setCred] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setCred(load(wallet.address ?? null)), 0);
    return () => clearTimeout(t);
  }, [wallet.address]);

  const signIn = useCallback(async () => {
    if (!wallet.address) return;
    setBusy(true);
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
      const message = buildMessage({ domain: window.location.host, uri: window.location.origin, address: wallet.address.toLowerCase(), chainId: SESSION_CHAIN_ID, nonce, issuedAt: now, expiresAt: now + HOURS * 3600 });
      const signature = (await wallet.signMessage(message)) as `0x${string}`;
      const c = { message, signature };
      try {
        sessionStorage.setItem(KEY(wallet.address), JSON.stringify(c));
      } catch {
        // storage refused: the session lasts until reload
      }
      setCred(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The wallet did not sign.");
    } finally {
      setBusy(false);
    }
  }, [wallet]);

  const signOut = useCallback(() => {
    // Revoke on the server too (best effort), so a copied credential stops working before it expires.
    if (cred) void fetch("/api/holder", { method: "DELETE", headers: { authorization: encodeCredential(cred) } }).catch(() => {});
    if (wallet.address) {
      try {
        sessionStorage.removeItem(KEY(wallet.address));
      } catch {}
    }
    setCred(null);
  }, [wallet.address, cred]);

  const authFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      if (!cred) throw new Error("Sign in first.");
      const res = await fetch(url, { ...init, cache: "no-store", headers: { ...(init.headers ?? {}), authorization: encodeCredential(cred), "content-type": "application/json" } });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 401) {
        try {
          if (wallet.address) sessionStorage.removeItem(KEY(wallet.address));
        } catch {}
        setCred(null);
      }
      if (!res.ok) throw Object.assign(new Error(String(body?.error ?? `Request failed (${res.status}).`)), { status: res.status });
      return body;
    },
    [cred, wallet.address],
  );

  return { address: wallet.address ?? null, cred, busy, error, signIn, signOut, authFetch, expiresAt: cred ? parseMessage(cred.message)?.expiresAt ?? null : null };
}
