import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/studio", label: "Studio", tag: null },
  { href: "/studio?step=lab", label: "Scenario lab", tag: "NEW" },
  { href: "/assets", label: "Assets", tag: null },
  { href: "/dashboard", label: "Dashboard", tag: null },
  { href: "/account", label: "Account", tag: null },
  { href: "/token", label: BRAND.symbol, tag: null },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/studio", "/dashboard", "/assets", "/method", "/token", "/account"] as const;
