"use client";

import { useState } from "react";
import { useWallet } from "@/components/wallet/WalletProvider";
import { useWalletModal } from "@/components/wallet/WalletButton";
import { CHAIN, explorerAddress, explorerTx } from "@/config/brand";
import { TESTNET } from "@/config/contracts";
import { explain, waitForReceipt } from "@/lib/client";
import artifacts from "@/lib/contracts/artifacts.json";

/** forge gas report, 25 Nov 2026: 2,367,720 gas for the creation transaction (10,748 bytes of runtime code). */
export const DEPLOY_GAS = "about 2.37 million";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

/*
 * Owner tool. Mainnet goes through the site wallet (Valtora pattern). Testnet (chain 46630) uses the browser wallet directly: it is
 * switched/added to Robinhood Chain Testnet, sends the creation code, and the receipt is read from the testnet RPC.
 */
export function DeployPanel() {
  const { address, onChain, sendTransaction, switchNetwork } = useWallet();
  const { open } = useWalletModal();
  const [net, setNet] = useState<"mainnet" | "testnet">("mainnet");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ address: string; tx: string; block: number; net: string } | null>(null);
  const art = artifacts.contracts.LotiqRuleBook;

  async function deployMainnet() {
    if (!address) return open();
    if (!onChain) return switchNetwork();
    const hash = await sendTransaction({ data: art.creation as `0x${string}` });
    setMsg(`Sent ${hash}. Waiting for the block…`);
    const rc = await waitForReceipt(hash, 300_000);
    if (!rc.ok || !rc.contractAddress) throw new Error("The deployment reverted.");
    setDone({ address: rc.contractAddress, tx: hash, block: rc.blockNumber, net: CHAIN.name });
  }

  async function deployTestnet() {
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (!eth) throw new Error("No browser wallet found for the testnet deployment.");
    const [from] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: TESTNET.hex }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: TESTNET.hex, chainName: TESTNET.name, rpcUrls: [TESTNET.rpc], blockExplorerUrls: [TESTNET.explorer], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }] });
    }
    const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from, data: art.creation }] })) as string;
    setMsg(`Sent ${hash} on the testnet. Waiting for the block…`);
    for (let i = 0; i < 150; i++) {
      const rc = (await eth.request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null)) as { status: string; contractAddress: string | null; blockNumber: string } | null;
      if (rc) {
        if (rc.status !== "0x1" || !rc.contractAddress) throw new Error("The deployment reverted.");
        setDone({ address: rc.contractAddress, tx: hash, block: Number(BigInt(rc.blockNumber)), net: TESTNET.name });
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("No receipt yet; check the testnet explorer.");
  }

  async function deploy() {
    setBusy(true);
    setMsg(null);
    try {
      if (net === "mainnet") await deployMainnet();
      else await deployTestnet();
      setMsg(null);
    } catch (e) {
      setMsg(explain(e));
    } finally {
      setBusy(false);
    }
  }

  const exp = done?.net === TESTNET.name ? TESTNET.explorer : CHAIN.explorer;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="panel" data-testid="deploy-panel">
        <h2 className="h3">LotiqRuleBook</h2>
        <p className="mt-2 text-[14px] text-muted">No constructor arguments, no owner of the contract. Creation code sha256 {art.sha256.slice(0, 16)}…</p>
        <div className="seg mt-5" role="group" aria-label="Network">
          <button type="button" aria-pressed={net === "mainnet"} onClick={() => setNet("mainnet")}>
            {CHAIN.name} ({CHAIN.id})
          </button>
          <button type="button" aria-pressed={net === "testnet"} onClick={() => setNet("testnet")}>
            Testnet ({TESTNET.id})
          </button>
        </div>
        <button type="button" className="btn brand mt-5 w-full" disabled={busy} onClick={deploy} data-testid="deploy-submit">
          {net === "mainnet" ? (!address ? "Connect wallet" : !onChain ? `Switch to ${CHAIN.name}` : busy ? "Confirm in wallet…" : `Deploy on ${CHAIN.name}`) : busy ? "Confirm in wallet…" : `Deploy on ${TESTNET.name}`}
        </button>
        {msg ? (
          <p className="rq-alert mt-3" role="status">
            {msg}
          </p>
        ) : null}
        {done ? (
          <div className="mt-4 text-[13px] leading-relaxed" data-testid="deploy-done">
            <p className="font-semibold">Deployed on {done.net}.</p>
            <p className="break-all">
              Address{" "}
              <a className="ul" href={done.net === CHAIN.name ? explorerAddress(done.address) : `${exp}/address/${done.address}`} target="_blank" rel="noreferrer">
                {done.address}
              </a>
              <br />
              Tx{" "}
              <a className="ul" href={done.net === CHAIN.name ? explorerTx(done.tx) : `${exp}/tx/${done.tx}`} target="_blank" rel="noreferrer">
                {done.tx}
              </a>{" "}
              · block {done.block}
            </p>
            {done.net === CHAIN.name ? (
              <p className="mt-2">
                Paste into src/config/contracts.ts: <code className="break-all">{`book: "${done.address}", block: ${done.block}, tx: "${done.tx}"`}</code>. Then run{" "}
                <code className="break-all">
                  npm run verify-deployment -- --book {done.address} --book-tx {done.tx}
                </code>{" "}
                and verify the source with the kit in referensi/explorer.
              </p>
            ) : (
              <p className="mt-2">A testnet trial copy. The site keeps reading mainnet; note the address for your own tests.</p>
            )}
          </div>
        ) : null}
      </div>
      <div className="panel">
        <h2 className="h3">Before you deploy</h2>
        <ul className="mt-3 grid list-disc gap-2 pl-5 text-[14px] text-muted">
          <li>The rule book holds no funds and moves no tokens; it has no payable function and no receive().</li>
          <li>Unit, fuzz, invariant and Robinhood Chain fork tests plus a written self-review; no outside security review yet.</li>
          <li>Measured deploy gas: {DEPLOY_GAS}, paid in {CHAIN.nativeSymbol}. openBook ≈ 312k, propose ≈ 183k, approve ≈ 113k, recordOrder ≈ 112k.</li>
          <li>After the mainnet deployment, delete this page and its panel once the address is verified (the artifacts stay for verify-deployment).</li>
        </ul>
      </div>
    </div>
  );
}
