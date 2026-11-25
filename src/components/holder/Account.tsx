"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND, explorerAddress } from "@/config/brand";
import { QUOTAS } from "@/config/quotas";
import { storageKey } from "@/config/storage";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { StatusBadge } from "@/components/site/PageHead";
import { loadBook, type PracticeBook } from "@/lib/rules/book";
import { dateText } from "@/lib/rules/engine";
import type { HostedBook, RunRecord } from "@/lib/server/hosted";
import type { TierInfo } from "@/lib/server/holder";
import { useSession } from "./useSession";

/*
 * Account: connect -> sign one session message -> the tier read from chain with its numbers, then the hosted service: rule books saved
 * per wallet, server scenario runs with a daily quota, export / import as JSON. Quotas are enforced on the server.
 */
type Hosted = { tier: TierInfo; books: HostedBook[]; runs: RunRecord[]; persistent: boolean; wallet: string };
const fmt = (raw: string | null) => (raw === null ? "—" : (Number(BigInt(raw) / 10n ** 12n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 }));

export function Account() {
  const s = useSession();
  const { open } = useWalletModal();
  const [data, setData] = useState<Hosted | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bookRaw, setBookRaw] = useLocalStore<PracticeBook | null>(storageKey("lq", "book"), null);
  const practice = useMemo(() => loadBook(bookRaw ? JSON.stringify(bookRaw) : null), [bookRaw]);
  const active = practice.versions.find((v) => v.status === "active") ?? practice.versions[practice.versions.length - 1] ?? null;

  const refresh = useCallback(async () => {
    if (!s.cred) return;
    try {
      setData((await s.authFetch("/api/hosted")) as unknown as Hosted);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Read failed." });
    }
  }, [s]);
  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const act = async (name: string, f: () => Promise<unknown>, ok: string) => {
    setBusy(name);
    setMsg(null);
    try {
      await f();
      setMsg({ ok: true, text: ok });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
    } finally {
      setBusy(null);
    }
  };

  const saveCurrent = () =>
    act("save", () => s.authFetch("/api/hosted", { method: "PUT", body: JSON.stringify({ id: `book-${(data?.books.length ?? 0) + 1}-${Date.now() % 100000}`, label: active ? `${active.rule.assetSymbol} v${active.n}` : "Rule book", book: practice }) }), "Saved on the server.");
  const runServer = () => (active ? act("run", () => s.authFetch("/api/hosted/run", { method: "POST", body: JSON.stringify({ rule: active.rule }) }), "Scenario lab ran on the server.") : undefined);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lotiq-hosted-export.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text) as { books?: HostedBook[] };
    for (const b of parsed.books ?? []) await s.authFetch("/api/hosted", { method: "PUT", body: JSON.stringify({ id: b.id, label: b.label, book: b.book }) });
  };

  const t = data?.tier;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="panel" aria-labelledby="h-t" data-testid="holder-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="h-t" className="h4">
            Holder check
          </h2>
          <StatusBadge status="Prototype" />
        </div>
        {!s.address ? (
          <>
            <p className="mt-3 text-muted">Connect a wallet, then sign one message (no gas) to open a session for the hosted service.</p>
            <button type="button" className="btn brand mt-4" onClick={open}>
              Connect a wallet
            </button>
          </>
        ) : !s.cred ? (
          <>
            <p className="mt-3 text-muted">Sign one message to prove this wallet. It costs no gas, moves nothing, and expires after 4 hours. Externally owned wallets only in v1.</p>
            <button type="button" className="btn brand mt-4" disabled={s.busy} onClick={s.signIn} data-testid="sign-in">
              {s.busy ? "Check your wallet…" : "Sign in with this wallet"}
            </button>
            {s.error ? <p className="rq-alert mt-3">{s.error}</p> : null}
          </>
        ) : !t ? (
          <p className="mt-3 text-muted">Reading your tier from the chain…</p>
        ) : (
          <>
            <p className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`status ${t.tier === "holder" ? "ok" : t.status === "unlocks-at-launch" ? "off" : "wait"}`} data-testid="tier">
                {t.tier === "holder" ? "Holder tier" : t.status === "unlocks-at-launch" ? "Free tier · holder tier unlocks at launch" : t.status === "read-failed" ? "Free tier · token read failed" : "Free tier"}
              </span>
            </p>
            <dl className="kv mt-4" data-testid="tier-numbers">
              <dt>Wallet</dt>
              <dd className="font-mono text-[12px]">{data.wallet}</dd>
              <dt>Token</dt>
              <dd>{t.token ? <a className="ul font-mono text-[12px]" href={explorerAddress(t.token)} target="_blank" rel="noreferrer">{t.token}</a> : `${BRAND.symbol} not launched yet`}</dd>
              <dt>Your balance</dt>
              <dd>{fmt(t.balance)}</dd>
              <dt>Threshold (0.1 % of supply)</dt>
              <dd>{fmt(t.threshold)}</dd>
              <dt>Your share</dt>
              <dd>{t.balance && t.supply && BigInt(t.supply) > 0n ? `${(Number((BigInt(t.balance) * 1_000_000n) / BigInt(t.supply)) / 10_000).toFixed(4)} %` : "—"}</dd>
              <dt>Checked</dt>
              <dd>
                {dateText(t.checkedAt)}
                {t.block ? `, block ${t.block.toLocaleString("en-US")}` : ""}
              </dd>
            </dl>
            <button type="button" className="btn line sm mt-4" onClick={s.signOut}>
              Sign out
            </button>
          </>
        )}
        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <p className="label">What each tier gets (server-enforced)</p>
          <table className="tbl mt-2">
            <thead>
              <tr>
                <th></th>
                <th>Free</th>
                <th>Holder</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Hosted rule books</td>
                <td>{QUOTAS.free.books}</td>
                <td>{QUOTAS.holder.books}</td>
              </tr>
              <tr>
                <td>Server scenario runs / day</td>
                <td>{QUOTAS.free.runsPerDay}</td>
                <td>{QUOTAS.holder.runsPerDay}</td>
              </tr>
              <tr>
                <td>Run history kept</td>
                <td>{QUOTAS.free.history}</td>
                <td>{QUOTAS.holder.history}</td>
              </tr>
              <tr>
                <td>Alerts (bell + browser)</td>
                <td>yes</td>
                <td>yes</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[13px] text-muted">
            Practice mode, the studio and the contract never need the token or a session. Holder = balance ≥ total supply / 1000, read on chain at each request.
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="ho-t" data-testid="hosted-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ho-t" className="h4">
            Hosted service
          </h2>
          {data ? <span className="text-[13px] text-muted">{data.books.length} of {t?.quotas.books} rule books</span> : null}
        </div>
        {!s.cred ? (
          <p className="mt-3 text-muted">Sign in to save rule books on the server and run the scenario lab there.</p>
        ) : (
          <>
            {data && !data.persistent ? <p className="note warn mt-4">Not configured: saved data may be lost on restart. Use Export to keep a copy.</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn brand sm" disabled={!!busy || practice.versions.length === 0} onClick={saveCurrent} data-testid="save-hosted">
                Save my practice book
              </button>
              <button type="button" className="btn line sm" disabled={!!busy || !active} onClick={runServer} data-testid="run-hosted">
                Run the lab on the server
              </button>
              <button type="button" className="btn line sm" disabled={!data} onClick={exportJson}>
                Export JSON
              </button>
              <label className="btn line sm cursor-pointer">
                Import JSON
                <input type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && act("import", () => importJson(e.target.files![0]), "Imported.")} />
              </label>
            </div>
            {practice.versions.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">
                Propose a version in the <Link className="ul" href="/studio?step=approve">studio</Link> first.
              </p>
            ) : null}
            {msg ? (
              <p className={`mt-3 ${msg.ok ? "note" : "rq-alert"}`} data-testid="hosted-msg">
                {msg.text}
              </p>
            ) : null}
            <p className="label mt-6">Saved rule books</p>
            <ul className="mt-2 grid gap-2" data-testid="hosted-books">
              {(data?.books ?? []).length === 0 ? <li className="text-muted">None yet.</li> : null}
              {(data?.books ?? []).map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-[var(--bg)] p-3 text-[14px]">
                  <span>
                    {b.label} <span className="text-[12px] text-muted">· {b.book.versions.length} version(s) · {dateText(b.savedAt)}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn line sm" onClick={() => setBookRaw(b.book)}>
                      Load
                    </button>
                    <button type="button" className="btn bad sm" onClick={() => act("del", () => s.authFetch(`/api/hosted?id=${b.id}`, { method: "DELETE" }), "Deleted.")}>
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="label mt-6">Server scenario runs</p>
            <ul className="mt-2 grid gap-2" data-testid="hosted-runs">
              {(data?.runs ?? []).length === 0 ? <li className="text-muted">None yet.</li> : null}
              {(data?.runs ?? []).slice(0, 12).map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 rounded bg-[var(--bg)] p-3 text-[14px]">
                  <span>
                    {r.asset} · {r.ruleHash.slice(0, 10)}… <span className="text-[12px] text-muted">{dateText(r.at)}</span>
                  </span>
                  <span className={`status ${r.passed === r.total ? "ok" : "wait"}`}>
                    {r.passed}/{r.total} as expected
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
