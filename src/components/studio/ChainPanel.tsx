"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256 } from "viem";
import { CHAIN, explorerAddress, explorerTx, isAddress } from "@/config/brand";
import { CONTRACTS, CONTRACT_NAME, bookLive } from "@/config/contracts";
import { storageKey } from "@/config/storage";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { useLocalStore } from "@/components/wallet/useLocalStore";
import { CopyChip } from "@/components/site/CaCopy";
import { StatusBadge } from "@/components/site/PageHead";
import { BOOK_ABI } from "@/lib/abi";
import { explain, read, simulate, waitForReceipt } from "@/lib/client";
import { bitNames, BIT_TEXT } from "@/lib/rules/bits";
import { canonicalText, diffRules, ruleHash } from "@/lib/rules/canonical";
import { fromVersion, labelBytes, statusWord, toRuleInput } from "@/lib/rules/chain";
import { USD, dateText, usd, type Rule } from "@/lib/rules/engine";
import type { Known } from "@/lib/rules/parse";
import { useJson } from "@/lib/useJson";
import type { BooksAnswer, BookView } from "@/lib/server/books";

/*
 * On-chain mode of the studio: LotiqRuleBook through the visitor's wallet. Open a book with the draft as version 1, propose a new
 * version from the draft (parent = the active one), approve a proposed version by number AND hash, withdraw, pause / unpause / revoke,
 * approve one order above the threshold, and (as the agent) record a test order. Every write is simulated first; a refusal is
 * explained from the contract's reason bits. The canonical text of each version you propose is kept in this browser, keyed by hash,
 * so the review screen can show the text the hash commits to.
 */

export type ChainCtx = {
  address: string | null;
  active: { bookId: number; version: number } | null;
  checkOrder: (q: { agent: string; asset: string; amount: number; at: number }) => Promise<number>;
};

const TEXTS = storageKey("lq", "texts");

export function ChainPanel({ draft, problems, now, onCtx, assets }: { draft: Rule | null; problems: { field: string; text: string }[]; now: number; onCtx: (c: ChainCtx | null) => void; assets: Known[] }) {
  const wallet = useWallet();
  const { open } = useWalletModal();
  const live = bookLive();
  const [reload, setReload] = useState(0);
  const url = live && wallet.address ? `/api/books?owner=${wallet.address}${reload ? `&fresh=${reload}` : ""}` : null;
  const { data, error, loading } = useJson<BooksAnswer>(url, 30_000);
  const [sel, setSel] = useState<number | null>(null);
  const [texts, setTexts] = useLocalStore<Record<string, string>>(TEXTS, {});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; tx?: string } | null>(null);
  const [label, setLabel] = useState("weekly buys");
  const books = data?.books ?? [];
  const book: BookView | null = books.find((b) => b.id === sel) ?? books[books.length - 1] ?? null;
  const activeV = book?.versions.find((v) => v.n === book.active) ?? null;
  const symbolOf = (a: string) => assets.find((k) => k.address.toLowerCase() === a.toLowerCase())?.symbol ?? `${a.slice(0, 6)}…`;

  const ctx = useMemo<ChainCtx>(
    () => ({
      address: wallet.address ?? null,
      active: book && book.active ? { bookId: book.id, version: book.active } : null,
      checkOrder: async (q) => {
        if (!book) throw new Error("No rule book selected.");
        const bits = await read<bigint>({ to: CONTRACTS.book, abi: BOOK_ABI, fn: "checkOrder", args: [BigInt(book.id), getAddress(q.agent || "0x0000000000000000000000000000000000000001"), book.active, getAddress(q.asset), BigInt(q.amount), BigInt(Date.now() % 1e9), BigInt(q.at)] });
        return Number(bits);
      },
    }),
    [wallet.address, book],
  );
  useEffect(() => {
    onCtx(live ? ctx : null);
  }, [ctx, live, onCtx]);

  async function send(name: string, fn: string, args: readonly unknown[], after?: () => void) {
    if (!wallet.address) return open();
    if (!wallet.onChain) return wallet.switchNetwork();
    setBusy(name);
    setMsg(null);
    try {
      const data = encodeFunctionData({ abi: BOOK_ABI, functionName: fn, args } as never);
      await simulate(wallet.address, CONTRACTS.book, data);
      const hash = await wallet.sendTransaction({ to: CONTRACTS.book, data });
      setMsg({ ok: true, text: "Sent. Waiting for the block…", tx: hash });
      const rc = await waitForReceipt(hash);
      if (!rc.ok) throw new Error("The transaction reverted.");
      after?.();
      setMsg({ ok: true, text: `${name}: done in block ${rc.blockNumber.toLocaleString("en-US")}.`, tx: hash });
      setReload((x) => x + 1);
    } catch (e) {
      setMsg({ ok: false, text: explain(e) });
    } finally {
      setBusy(null);
    }
  }

  const ready = !!draft && problems.length === 0 && isAddress(draft.agent);
  const input = draft && isAddress(draft.agent) ? toRuleInput({ ...draft, validFrom: now }) : null;
  const remember = () => draft && setTexts({ ...texts, [ruleHash({ ...draft, validFrom: now })]: canonicalText({ ...draft, validFrom: now }) });

  if (!live)
    return (
      <section className="panel" aria-labelledby="nd-t" data-testid="chain-not-deployed">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="nd-t" className="h4">
            {CONTRACT_NAME} is not deployed yet
          </h2>
          <StatusBadge status="Prototype" />
        </div>
        <p className="mt-3 text-muted">
          The contract is written and tested (unit, fuzz, invariant and {CHAIN.name} fork tests) and waits for the owner&apos;s deployment. Until then,
          practice mode runs the same rules with the same reason codes. This is what the studio would send as version 1:
        </p>
        <pre className="codebox mt-4">{input ? JSON.stringify({ ...input, maxPerOrder: input.maxPerOrder.toString(), maxPerPeriod: input.maxPerPeriod.toString(), approvalAbove: input.approvalAbove.toString() }, null, 2) : "Finish steps 1 and 2 (and set an agent address) to see the struct."}</pre>
        <Link href="/method#contract" className="btn line mt-4">
          How the contract works
        </Link>
      </section>
    );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" data-testid="chain-panel">
      <div className="grid grid-cols-1 content-start gap-6">
        <section className="panel" aria-labelledby="cb-t">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="cb-t" className="h4">
              Your rule books on {CHAIN.name}
            </h2>
            <a className="ul text-[13px] text-muted" href={explorerAddress(CONTRACTS.book)} target="_blank" rel="noreferrer">
              {CONTRACT_NAME}
            </a>
          </div>
          {!wallet.address ? (
            <button type="button" className="btn brand mt-4" onClick={open} data-testid="chain-connect">
              Connect a wallet
            </button>
          ) : !wallet.onChain ? (
            <button type="button" className="btn brand mt-4" onClick={wallet.switchNetwork}>
              Switch to {CHAIN.name}
            </button>
          ) : (
            <>
              {loading && !data ? <p className="mt-3 text-muted">Reading the contract…</p> : null}
              {error ? <p className="rq-alert mt-3">{error}</p> : null}
              {data && books.length === 0 ? <p className="mt-3 text-muted">No rule book for this wallet yet.</p> : null}
              {books.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {books.map((b) => (
                    <button key={b.id} type="button" className="opt" aria-pressed={book?.id === b.id} onClick={() => setSel(b.id)} data-testid={`book-${b.id}`}>
                      #{b.id} {b.label || "rule book"} {b.revoked ? "· revoked" : b.paused ? "· paused" : ""}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label className="lbl" htmlFor="bk-label">
                    New rule book label
                  </label>
                  <input id="bk-label" className="inp" maxLength={31} value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                <button type="button" className="btn brand" disabled={!ready || !!busy} onClick={() => input && send("open", "openBook", [labelBytes(label), input], remember)} data-testid="chain-open">
                  Open with the draft as v1
                </button>
              </div>
              {!ready ? <p className="mt-2 text-[13px] text-muted">{!draft ? "Finish step 1 first." : problems.length ? "Fix the problems in step 2." : "Set the agent address in step 2."}</p> : null}
            </>
          )}
          {msg ? (
            <p className={`mt-4 ${msg.ok ? "note" : "rq-alert"}`} data-testid="chain-msg">
              {msg.text}{" "}
              {msg.tx ? (
                <a className="ul" href={explorerTx(msg.tx)} target="_blank" rel="noreferrer">
                  transaction
                </a>
              ) : null}
            </p>
          ) : null}
        </section>

        {book && wallet.address ? (
          <BookControls
            book={book}
            draft={draft}
            ready={ready}
            busy={busy}
            texts={texts}
            symbolOf={symbolOf}
            me={wallet.address}
            onPropose={() => input && send("propose", "propose", [BigInt(book.id), input, book.active], remember)}
            onApprove={(n, h) => send(`approve-${n}`, "approve", [BigInt(book.id), n, h])}
            onWithdraw={(n) => send(`withdraw-${n}`, "withdraw", [BigInt(book.id), n])}
            onPause={() => send(book.paused ? "unpause" : "pause", book.paused ? "unpause" : "pause", [BigInt(book.id)])}
            onRevoke={() => send("revoke", "revoke", [BigInt(book.id)])}
            onApproveOrder={(key) => send("approve-order", "approveOrder", [BigInt(book.id), key])}
            onRecord={(amount, nonce) => activeV && send("record", "recordOrder", [BigInt(book.id), book.active, getAddress(activeV.asset), BigInt(amount), BigInt(nonce), labelBytes(`studio-${nonce}`)])}
          />
        ) : null}
      </div>
      <div className="grid grid-cols-1 content-start gap-6">
        {data?.events?.length ? (
          <section className="panel" aria-labelledby="ev-t">
            <h2 id="ev-t" className="h4">
              On-chain history
            </h2>
            <ul className="mt-4 grid gap-2 text-[14px]" data-testid="chain-events">
              {data.events
                .filter((e) => !book || e.bookId === book.id)
                .slice(0, 20)
                .map((e) => (
                  <li key={`${e.tx}-${e.logIndex}`} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {e.name}
                      {e.args.version !== undefined ? ` v${String(e.args.version)}` : ""}
                    </span>
                    <a className="ul font-mono text-[12px] text-muted" href={explorerTx(e.tx)} target="_blank" rel="noreferrer">
                      block {e.block.toLocaleString("en-US")}
                    </a>
                  </li>
                ))}
            </ul>
            {data.scanned && !data.scanned.complete ? <p className="note warn mt-3">Part of the log range could not be read; the list may be incomplete.</p> : null}
          </section>
        ) : null}
        {activeV ? (
          <section className="panel" aria-labelledby="av-t">
            <h2 id="av-t" className="h4">
              Active version {activeV.n}
            </h2>
            <dl className="kv mt-4">
              <dt>Asset</dt>
              <dd>{symbolOf(activeV.asset)}</dd>
              <dt>Agent</dt>
              <dd className="font-mono text-[12px]">{activeV.agent}</dd>
              <dt>Max per order</dt>
              <dd>{usd(Number(activeV.maxPerOrder))}</dd>
              <dt>Max per period</dt>
              <dd>{usd(Number(activeV.maxPerPeriod))}</dd>
              <dt>Spent this window</dt>
              <dd>{usd(Number(book!.spent))}</dd>
              <dt>Orders recorded</dt>
              <dd>{book!.orders}</dd>
              <dt>Hash</dt>
              <dd>
                <CopyChip value={activeV.ruleHash} head={10} tail={6} />
              </dd>
            </dl>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function BookControls(p: {
  book: BookView;
  draft: Rule | null;
  ready: boolean;
  busy: string | null;
  texts: Record<string, string>;
  symbolOf: (a: string) => string;
  me: string;
  onPropose: () => void;
  onApprove: (n: number, hash: string) => void;
  onWithdraw: (n: number) => void;
  onPause: () => void;
  onRevoke: () => void;
  onApproveOrder: (key: `0x${string}`) => void;
  onRecord: (amount: number, nonce: number) => void;
}) {
  const { book } = p;
  const activeV = book.versions.find((v) => v.n === book.active) ?? null;
  const base = activeV ? fromVersion(activeV, p.symbolOf(activeV.asset)) : null;
  const changes = p.draft ? diffRules(base, p.draft).filter((c) => c.key !== "orderAmount") : [];
  const [amount, setAmount] = useState(10);
  const [nonce, setNonce] = useState(() => Math.floor(Date.now() / 1000) % 1_000_000);
  const isAgent = !!activeV && activeV.agent.toLowerCase() === p.me.toLowerCase();
  const isOwner = book.owner.toLowerCase() === p.me.toLowerCase();
  // keccak256(abi.encode(bookId, version, asset, amount, nonce)), same as LotiqRuleBook.orderKey
  const orderKeyHex: `0x${string}` | null = activeV
    ? keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint32" }, { type: "address" }, { type: "uint256" }, { type: "uint64" }], [BigInt(book.id), book.active, getAddress(activeV.asset), BigInt(Math.round(amount * USD)), BigInt(nonce)]))
    : null;
  const [preBits, setPreBits] = useState<number | null>(null);
  return (
    <section className="panel" aria-labelledby="bc-t" data-testid="book-controls">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="bc-t" className="h4">
          Rule book #{book.id} {book.label ? `· ${book.label}` : ""}
        </h2>
        {book.revoked ? <span className="status no">Revoked</span> : book.paused ? <span className="status wait">Paused</span> : book.active ? <span className="status ok">Version {book.active} active</span> : <span className="status off">Nothing approved</span>}
      </div>
      <ol className="timeline mt-4">
        {[...book.versions].reverse().map((v) => {
          const text = p.texts[v.ruleHash];
          return (
            <li key={v.n} className={v.status === 2 ? "on" : ""} data-testid={`chain-v${v.n}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="serif text-[20px]">Version {v.n}</span>
                <span className={`status ${v.status === 2 ? "ok" : v.status === 1 ? "wait" : "off"}`}>{statusWord(v.status)}</span>
                <span className="text-[12px] text-muted">proposed {dateText(v.proposedAt)}</span>
              </div>
              {v.status === 1 && isOwner ? (
                <div className="mt-3">
                  {text ? <pre className="codebox">{text}</pre> : <p className="note warn">The text of this version is not in this browser. Approve only if you know what hash {v.ruleHash.slice(0, 12)}… commits to.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn brand sm" disabled={!!p.busy || book.revoked} onClick={() => p.onApprove(v.n, v.ruleHash)} data-testid={`chain-approve-${v.n}`}>
                      Approve version {v.n} ({v.ruleHash.slice(0, 10)}…)
                    </button>
                    <button type="button" className="btn line sm" disabled={!!p.busy} onClick={() => p.onWithdraw(v.n)}>
                      Withdraw
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {isOwner ? (
        <>
          <p className="label mt-4">Draft vs active version</p>
          <ul className="mt-2 grid gap-1 text-[14px]">
            {changes.length === 0 ? <li className="text-muted">No limit differs.</li> : null}
            {changes.map((c) => (
              <li key={c.key}>
                {c.label}: <span className="diff-old">{c.before}</span> → <span className="diff-new">{c.after}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn brand sm" disabled={!p.ready || !!p.busy || book.revoked} onClick={p.onPropose} data-testid="chain-propose">
              Propose the draft as version {book.versionCount + 1}
            </button>
            <button type="button" className="btn line sm" disabled={!!p.busy || book.revoked} onClick={p.onPause} data-testid="chain-pause">
              {book.paused ? "Unpause" : "Pause"}
            </button>
            <button type="button" className="btn bad sm" disabled={!!p.busy || book.revoked} onClick={p.onRevoke}>
              Revoke
            </button>
          </div>
        </>
      ) : null}
      {activeV ? (
        <div className="mt-6 rounded border border-[var(--line)] p-4">
          <p className="text-[15px] font-medium">Test order on chain</p>
          <p className="mt-1 text-[13px] text-muted">
            The owner can approve one order above the threshold; the agent records it. Recording is a journal entry counted against your limits: no
            tokens move.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="lbl" htmlFor="t-amt">
                Amount ($)
              </label>
              <input id="t-amt" className="inp" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} data-testid="t-amount" />
            </div>
            <div>
              <label className="lbl" htmlFor="t-nonce">
                Order number (nonce)
              </label>
              <input id="t-nonce" className="inp" type="number" min={0} value={nonce} onChange={(e) => setNonce(Math.max(0, Math.round(Number(e.target.value))))} data-testid="t-nonce" />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn line sm"
              onClick={async () => {
                const bits = await read<bigint>({ to: CONTRACTS.book, abi: BOOK_ABI, fn: "checkOrder", args: [BigInt(book.id), getAddress(activeV.agent), book.active, getAddress(activeV.asset), BigInt(Math.round(amount * USD)), BigInt(nonce), BigInt(Math.floor(Date.now() / 1000))] }).catch(() => null);
                setPreBits(bits === null ? -1 : Number(bits));
              }}
              data-testid="t-check"
            >
              checkOrder
            </button>
            {isOwner ? (
              <button type="button" className="btn line sm" disabled={!orderKeyHex || !!p.busy} onClick={() => orderKeyHex && p.onApproveOrder(orderKeyHex)} data-testid="t-approve-order">
                Approve this order
              </button>
            ) : null}
            {isAgent ? (
              <button type="button" className="btn brand sm" disabled={!!p.busy} onClick={() => p.onRecord(Math.round(amount * USD), nonce)} data-testid="t-record">
                Record as the agent
              </button>
            ) : (
              <span className="self-center text-[12px] text-muted">Connect the agent wallet to record.</span>
            )}
          </div>
          {preBits !== null ? (
            <p className="mt-3 text-[14px]" data-testid="t-bits">
              {preBits < 0 ? "The contract could not be read." : preBits === 0 ? "checkOrder: 0, every rule passes." : `checkOrder: ${preBits} = ${bitNames(preBits).map((n) => BIT_TEXT[n].rule).join(", ")}`}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
