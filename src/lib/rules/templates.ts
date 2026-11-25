/* Strategy templates for the studio (home "start from a template" tiles). Plain text on purpose: each one goes through the parser, so
   some of them deliberately trigger clarification questions. */
export const TEMPLATES = [
  { id: "weekly-nvda", title: "Weekly NVDA", color: "f-lime", text: "Buy $50 of NVDA every Monday between 14 and 20 UTC, max $50 a week. Ask me before any order above $50." },
  { id: "weekday-spy", title: "Weekday SPY", color: "f-blue", text: "Buy $20 of SPY every weekday between 14 and 21 UTC, at most $100 a week. Ask me before any order above $30." },
  { id: "two-day-googl", title: "Tue + Thu GOOGL", color: "f-pink", text: "Buy $75 of GOOGL on Tuesdays and Thursdays between 15 and 19 UTC, at most $150 a week, ask me above $60, until 2027-03-31." },
  { id: "daily-qqq", title: "Daily QQQ", color: "f-orange", text: "Buy $10 of QQQ every day, max $50 a week, at least 20 hours apart, for 8 weeks. No approval needed." },
  { id: "monthly-msft", title: "Monthly MSFT", color: "f-cream", text: "Buy $200 of MSFT monthly between 14 and 20 UTC. Ask me above $200." },
  { id: "ambiguous", title: "Needs answers", color: "f-lime", text: "Buy about $50 of NVDA or TSLA weekly at 3pm." },
  { id: "dip", title: "Price condition", color: "f-blue", text: "Buy $100 of AAPL every Friday if the price drops below $200." },
  { id: "fridays-tsla", title: "Friday TSLA", color: "f-pink", text: "Buy $40 of TSLA every Friday between 14 and 20 UTC, max $40 a week, for 12 weeks. Ask me before every order." },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]["id"];
