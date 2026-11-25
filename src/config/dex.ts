/*
 * Other Robinhood Chain (4663) contracts Lotiq reads. Each address was read on chain through the official RPC (23-25 Nov 2026).
 * None of them is a Lotiq contract, and Lotiq never routes trades through them.
 */
export { ETH_USD_FEED } from "@/config/chain";

/** Global Dollar (USDG), 6 decimals. Lotiq's limits are written in USD with 6 decimals, the same scale. */
export const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
/** Wrapped ether, 18 decimals. */
export const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
