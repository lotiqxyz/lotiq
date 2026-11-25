"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { explorerTx } from "@/config/brand";
import { bookLive } from "@/config/contracts";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useJson } from "@/lib/useJson";
import { deriveAlerts, unread, type Alert } from "@/lib/rules/alerts";
import type { BooksAnswer } from "@/lib/server/books";

/*
 * Alerts, free for everyone, web only. Level 1: this bell, an inbox computed from LotiqRuleBook's events for the connected wallet's books
 * since its last visit (last seen block kept in this browser). Level 2: after "Enable browser notifications", new alerts also show as
 * browser notifications while a tab of the site is open (Notification API; no push service, no e-mail, no messenger).
 */
const SEEN = (a: string) => `lq.seen.${a.toLowerCase()}`;
const NOTIFY = "lq.notify";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export function Bell() {
  const wallet = useWallet();
  const live = bookLive();
  const { data } = useJson<BooksAnswer>(live && wallet.address ? `/api/books?owner=${wallet.address}` : null, 20_000);
  const alerts: Alert[] = useMemo(() => (data ? deriveAlerts(data.books, data.events) : []), [data]);
  const [seen, setSeen] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<string>("default");
  const [on, setOn] = useState(false);
  const notified = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState({ top: 80, right: 16 });

  useEffect(() => {
    const t = setTimeout(() => {
      setSeen(wallet.address ? Number(read(SEEN(wallet.address)) ?? 0) : 0);
      setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
      setOn(read(NOTIFY) === "1");
    }, 0);
    first.current = true;
    return () => clearTimeout(t);
  }, [wallet.address]);

  const fresh = unread(alerts, seen);
  // Level 2: a browser notification for every alert that appears while the page is open (not for the backlog found on load).
  useEffect(() => {
    if (!data) return;
    if (first.current) {
      alerts.forEach((a) => notified.current.add(a.id));
      first.current = false;
      return;
    }
    for (const a of alerts) {
      if (notified.current.has(a.id)) continue;
      notified.current.add(a.id);
      if (on && perm === "granted") {
        try {
          new Notification(a.title, { body: a.body, tag: a.id });
        } catch {}
      }
      (window as unknown as { __lqNotified?: string[] }).__lqNotified = [...((window as unknown as { __lqNotified?: string[] }).__lqNotified ?? []), a.title];
    }
  }, [alerts, data, on, perm]);

  const toggle = () => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right) });
    if (open && wallet.address && alerts[0]) {
      write(SEEN(wallet.address), String(alerts[0].block));
      setSeen(alerts[0].block);
    }
    setOpen(!open);
  };
  const enable = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === "granted") {
      write(NOTIFY, "1");
      setOn(true);
    }
  };
  const disable = () => {
    write(NOTIFY, "0");
    setOn(false);
  };

  return (
    <>
      <button ref={btn} type="button" className="rq-iconbtn relative" aria-label={`Alerts${fresh.length ? `, ${fresh.length} new` : ""}`} aria-expanded={open} onClick={toggle} data-testid="bell">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4.5 12.5V8a4.5 4.5 0 0 1 9 0v4.5l1.5 1.5h-12z" />
          <path d="M7.5 15.5a1.6 1.6 0 0 0 3 0" />
        </svg>
        {fresh.length ? (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--lime)] px-1 text-[10px] font-semibold text-[var(--bg)]" data-testid="bell-count">
            {fresh.length > 9 ? "9+" : fresh.length}
          </span>
        ) : null}
      </button>
      {open
        ? createPortal(
            <div className="rq-menu" role="dialog" aria-label="Alerts" style={{ top: pos.top, right: pos.right, left: "auto", width: "min(340px, calc(100vw - 24px))" }} data-testid="bell-panel">
              <div className="flex items-center justify-between gap-2">
                <span className="rq-label">Alerts · free</span>
                <button type="button" className="text-[12px] text-muted underline" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              {!live ? (
                <p className="mt-3 text-muted">Alerts start when LotiqRuleBook is deployed: they are read from its events.</p>
              ) : !wallet.address ? (
                <p className="mt-3 text-muted">Connect a wallet to see alerts for the rule books it owns.</p>
              ) : alerts.length === 0 ? (
                <p className="mt-3 text-muted">{data ? "Nothing yet for your rule books." : "Reading the chain…"}</p>
              ) : (
                <ul className="mt-3 grid max-h-[50vh] gap-2 overflow-y-auto" data-testid="bell-list">
                  {alerts.slice(0, 30).map((a) => (
                    <li key={a.id} className={`rounded p-2.5 ${a.block > seen ? "bg-[var(--card-3)]" : "bg-[var(--card-2)]"}`}>
                      <p className="text-[13px] font-medium">{a.title}</p>
                      <p className="text-[12px] text-muted">{a.body}</p>
                      <a className="ul text-[11px] text-muted" href={explorerTx(a.tx)} target="_blank" rel="noreferrer">
                        block {a.block.toLocaleString("en-US")}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 border-t border-[var(--line)] pt-3 text-[12px] text-muted">
                {perm === "unsupported" ? (
                  "This browser has no notifications; the inbox still works."
                ) : on && perm === "granted" ? (
                  <span className="flex items-center justify-between gap-2">
                    Browser notifications on while a tab is open.
                    <button type="button" className="underline" onClick={disable}>
                      Turn off
                    </button>
                  </span>
                ) : perm === "denied" ? (
                  "Notifications are blocked in this browser's site settings."
                ) : (
                  <button type="button" className="btn sm line w-full" onClick={enable} data-testid="bell-enable">
                    Enable browser notifications
                  </button>
                )}
                <p className="mt-2">
                  Only while a tab of the site is open. No e-mail, no push service. <Link className="ul" href="/account">Account</Link>
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
