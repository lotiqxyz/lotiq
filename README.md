# Lotiq

Lotiq is for people who have a plan for buying stock tokens and want an agent to follow it exactly. You write the strategy the way you would say it ("buy $50 of NVDA every Monday, at most $120 a week, ask me above $40"). Lotiq turns it into a rule set you can read line by line, asks a question wherever a word could mean two things, runs test orders against the rules, and lets you approve one exact version of those rules on Robinhood Chain. Every change is a new version, and every version, approval and recorded order stays on the record.

Stock-token agent studio for Robinhood Chain. Build rules, test orders, approve actions.

## Read this before anything else

This repository is the working code behind https://lotiq.xyz.

- **What runs today.** The studio (`/studio`): a strategy parser written as fixed patterns (no language model) that asks clarification questions instead of guessing, a rule check where every line shows its source, a scenario lab that accepts or refuses test orders and names the rule that decided, and versions with diffs, exact-hash approval, withdraw, pause and revoke. Practice mode runs all of it in the browser without a wallet. The dashboard (`/dashboard`) shows versions, approvals, scenario runs and the change log. `examples/agent.mjs` is a minimal agent that checks before it records.
- **What reads live data.** The asset list re-proves every Robinhood stock token on Robinhood Chain (proxy code hash, beacon slot, minted supply) and reads the matching Chainlink feeds with their update times. The home page reads the head block and gas price. The on-chain mode and the dashboard read the rule book contract's views and events.
- **The contract.** `LotiqRuleBook` is live on Robinhood Chain at `0xe32009d97332710696bae0a2b0420759aff18288`, source-verified on the explorer, and tested (unit, fuzz, invariant and Robinhood Chain fork tests); practice mode uses the same rules without a wallet. It holds no funds, moves no tokens, has no admin, no fee and no upgrade path, and has not had an outside security review.
- **Token features (run today).** One wallet signature (EIP-4361, no gas, at most 4 hours) opens a session for the hosted service: rule books saved per wallet and the scenario lab run on the server, with quotas enforced on the server. Wallets holding at least 0.1 % of the $LOTIQ supply (balance ≥ total supply / 1000, read on chain at each request) get larger quotas; until the token launches everyone uses the free tier. Alerts are free for everyone: a bell inbox read from the contract's events and browser notifications while a tab is open.
- **Planned, not built.** Executing buys through a DEX (with the output forced to the owner) and a hosted agent runtime. Both are labelled Concept on the site.
- **What nothing here claims.** Rules limit what an agent may do; they do not make its orders good ones. A stock token is a token on Robinhood Chain, not the share itself. $LOTIQ has no promised value. Nothing here is financial advice.

## Layout

| Path | What it is |
|---|---|
| `src/app/` | Pages (`/`, `/studio`, `/dashboard`, `/assets`, `/account`, `/method`, `/token`) and API routes (`/api/chain`, `/api/rpc`, `/api/assets`, `/api/books`, `/api/holder`, `/api/hosted`, `/api/hosted/run`). |
| `src/lib/holder/` | The sign-in message, its verification and the holder rule, with tests. |
| `src/components/` | Home sections, the studio (`studio/`), the wallet dialog, header and footer. |
| `src/config/` | `brand.ts` (name, ticker, token address, links), `contracts.ts` (rule book address, testnet facts), `chain.ts` (stock-token proof constants, feeds), `quotas.ts` (free and holder quotas). |
| `src/lib/rules/` | The rule engine (`engine.ts`), reason bits (`bits.ts`), parser (`parse.ts`), canonical text and diff (`canonical.ts`), scenario lab (`scenarios.ts`), practice book (`book.ts`) and their tests. |
| `src/lib/server/` | Server-side chain reads (stock-token board, rule books from views and logs, chain snapshot), the holder tier, the hosted service and its storage. |
| `contracts/` | Solidity sources (`src/LotiqRuleBook.sol`, `src/LotiqRuleMath.sol`) and Foundry tests (`test/`). |
| `examples/` | `agent.mjs`: reads the version its owner approved, asks `checkOrder`, records only what fits, or submits and puts a refusal on the record. |
| `scripts/` | `verify-deployment` and the contract artifact builder. |
| `public/` | Brand images and wallet logos. |

## Run the tests

Node.js 20 or newer.

```
npm install
npm run typecheck
npm test
```

Contracts use [Foundry](https://book.getfoundry.sh/):

```
cd contracts
bash setup.sh
forge test
```

Fork tests against Robinhood Chain (they skip on any other chain):

```
forge test --match-contract Fork --fork-url https://rpc.mainnet.chain.robinhood.com --evm-version cancun
```

### What was checked for this snapshot

2026-11-25 (UTC), Node.js 25.8.2, forge 1.5.1: typecheck exit 0; `npm test` 41 pass / 0 fail (including sign-in message checks: foreign domain, spoofed Host header, non-standard text, expired, longer than 4 hours; the 0.1 % holder rule at the exact threshold and one unit under; server quotas; alerts from logs); `forge test` 39 passed (34 unit and fuzz tests, 5 invariants); fork suite 4 passed against Robinhood Chain mainnet state (real NVDA and TSLA stock tokens, the NVDA Chainlink feed, deploy gas). 2026-11-25 (UTC): the rule book deployed on Robinhood Chain mainnet (block 122889425) matches this build (`verify-deployment` MATCH; Sourcify exact match for creation and runtime code; source verified on Blockscout). An end-to-end browser run on a local Robinhood Chain devnet (chain id 4663) with injected test wallets, a test token and the example agent passed 13 of 13 steps (rule book open, approve, record, refuse, per-order approval, new version, pause, a refused order arriving in the alert bell and as a browser notification, a wallet with 0.05 % kept on the free tier and stopped at its quota, a wallet over 0.1 % on the holder tier, sign out), and `verify-deployment` printed MATCH for that devnet deployment and MISMATCH for a wrong address; that run is kept with the project's working notes, not in this repository.

## Look at the site

```
npm install
npm run build
npm start
```

Open http://localhost:6680. Without any configuration the site reads Robinhood Chain through its public RPC: the studio, practice mode, assets, method and token pages work. The on-chain mode and the dashboard's chain section read the live rule book set in `src/config/contracts.ts`. WalletConnect shows "Not configured on this site yet" until `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (32 hex characters) is set.

## Contracts

| Contract | Address | Explorer |
|---|---|---|
| `LotiqRuleBook` (with the internal library `LotiqRuleMath`) | `0xe32009d97332710696bae0a2b0420759aff18288` (block 122889425, tx `0xd1d6022fbd207b07f0fd62ae117919ed87da2061d65e3645822de753d302af00`) | [Blockscout, verified source](https://robinhoodchain.blockscout.com/address/0xe32009d97332710696bae0a2b0420759aff18288?tab=contract) |

A rule book belongs to its owner. Each version stores the keccak256 hash of the rule set's canonical text plus the enforced limits as plain fields: one asset, one agent, a maximum per order and per period (1, 7 or 30 days, in USD with 6 decimals), an approval threshold, weekdays and UTC hours, a minimum gap and a validity window (at most 730 days). `approve(book, version, hash)` activates exactly that version and supersedes the previous one in the same transaction. `checkOrder` answers a bitmask of 17 reasons for any order and time; the agent's `recordOrder` re-checks at the current block and reverts with those bits when a rule fails, otherwise counts the order against the period limit. `submitOrder` does the same but logs a refusal as `OrderRefused` instead of reverting, which is what the owner's alerts read. Orders above the threshold need `approveOrder` for that exact order. `pause`, `revoke` (final) and the agent's own `halt` take effect from the next call. Measured gas: deploy 2,508,382; `openBook` about 312k; `propose` about 183k; `approve` about 113k; `recordOrder` about 114k; `submitOrder` about 50k when refused.

## Verify a deployment

```
npm run verify-deployment -- --book 0xe32009d97332710696bae0a2b0420759aff18288 --book-tx 0xd1d6022fbd207b07f0fd62ae117919ed87da2061d65e3645822de753d302af00
```

The script compares the runtime code at the address and the creation transaction's input with the build in this repository and prints MATCH or the first difference.

## Add the network to your wallet

| Field | Value |
|---|---|
| Network | Robinhood Chain |
| Chain ID | 4663 |
| Currency | ETH |
| RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |

The site offers to add it when you connect. Robinhood Chain Testnet (chain ID 46630, RPC https://rpc.testnet.chain.robinhood.com, explorer https://explorer.testnet.chain.robinhood.com) can hold a trial copy of the contract; the studio itself works on mainnet, where stock-token identity can be proven.

## Data sources and limits

- Robinhood Chain JSON-RPC (the official endpoint, then public fallbacks). The browser reads through the site's relay `/api/rpc`, which only forwards a short list of read methods and targets and is rate limited.
- Stock tokens: candidates from a 23 Nov 2026 scan of the Robinhood beacon's upgrade events; each one is re-proven live (code hash of the beacon proxy, ERC-1967 beacon slot, minted supply). A ticker alone is never accepted.
- Chainlink data feeds on Robinhood Chain for prices, each with its update time; stock feeds pause outside US market hours.
- Rule books and alerts: views plus `eth_getLogs` over the contract's events; if part of the block range cannot be read, the page says the list may be incomplete. Alerts are computed in the browser from those events; the last seen block is kept in the browser.
- Holder tier: `balanceOf` and `totalSupply` of the token read at the same block, cached at most 30 seconds per wallet. Hosted data lives in the configured key-value store, or in server memory (bounded, may be lost on restart) when none is configured.

## Token

$LOTIQ is the community token of Lotiq on Robinhood Chain. Contract address: announced on https://lotiq.xyz at launch. It has no promised value and the studio never needs it.

Token features (run today, tested end to end on a local devnet with a test token): a wallet holding at least 0.1 % of the supply gets larger quotas on the hosted service.

| Hosted service | Free | Holder |
|---|---|---|
| Saved rule books per wallet | 2 | 25 |
| Server scenario runs per day | 20 | 300 |
| Run history kept | 10 | 200 |
| Alerts (bell + browser notifications) | yes | yes |

No fee discounts, revenue share, rewards or airdrops. Until the token launches the holder tier shows "Unlocks at launch".

## Deploy your own

1. Import the repository into a Next.js host (framework preset Next.js, root `./`).
2. Optional environment variables:

| Variable | What it is for | Format |
|---|---|---|
| `ROBINHOOD_RPC_URL` | Server-side RPC with `eth_getLogs` for the rule book history | `https://…` |
| `NEXT_PUBLIC_ROBINHOOD_RPC_URL` | Browser RPC override (public) | `https://…` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect in the wallet dialog | 32 hex characters |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Shared store for rate limits, hosted rule books, scenario history and signed-out sessions | `https://…`, token string |
| `STORE_KEY_PREFIX` | Key prefix in that store | short string, default `lotiq:` |

3. Contracts: deploy `LotiqRuleBook` (no constructor arguments, nothing to link), put its address, block and creation transaction into `src/config/contracts.ts`, and run `npm run verify-deployment -- --book <address> --book-tx <tx>`.
4. After the deploy, check that `/` answers 200, `/api/chain` returns JSON with a block number, `/api/assets` lists stock tokens, and `/deploy` answers 404 on the public host.

## Contributing

Fork the repository, branch from `main`, and run `npm run typecheck`, `npm test` and `npm run build`, and `bash setup.sh && forge test` in `contracts/` before opening a pull request. For a bug, open an issue with the expected and actual behavior and minimal steps. Keep private keys, seed phrases and environment values out of issues.

## Security

Please do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. The rule book contract, the API routes and the transaction building in the studio are in scope; wallets, RPC providers, explorers and price feeds are not. There is no bug bounty.

## Notices and license

This project's original code is released under the [MIT License](LICENSE). Fonts shipped in `src/fonts/` (Figtree, Instrument Serif, Chivo Mono) are under the SIL Open Font License; their license files sit next to them. Wallet logos in `public/wallets/` belong to their projects and are used only to identify each wallet. The Lotiq name, logo and artwork belong to the project and are not licensed for reuse as a brand. Lotiq is not affiliated with Robinhood.
