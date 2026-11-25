import { ALL_DAYS, DAY, MONTH30, NO_THRESHOLD, USD, WEEK, WEEKDAYS, scheduledDaysPerPeriod, type Period, type Rule } from "./engine";

/*
 * Lotiq's strategy parser. Deterministic: regular expressions and fixed rules, no language model. It reads a short plain-English
 * strategy ("Buy $50 of NVDA every Monday, at most $120 a week, ask me above $40") and returns:
 *   - fields it could read, each tagged with where the value came from (written / derived / default / answered),
 *   - clarification questions for anything ambiguous or missing that it must not guess (asset, amount, schedule, approval, time zone,
 *     fuzzy amounts, unsupported conditions); each question offers explicit choices, and the answer is applied on the next parse,
 *   - notes for things it ignored or rounded.
 * A rule set exists only when every question is answered.
 */

export type Known = { symbol: string; name: string; address: string };
export type Source = "written" | "derived" | "default" | "answered";
export type Field<T> = { value: T; source: Source; why: string };
export type Option = { id: string; label: string };
export type Clarification = { id: string; field: string; question: string; quote: string; options: Option[]; blocking: true };

export type Parsed = {
  fields: {
    asset?: Field<Known>;
    orderAmount?: Field<number>;
    maxPerOrder?: Field<number>;
    maxPerPeriod?: Field<number>;
    period?: Field<Period>;
    approvalAbove?: Field<number>;
    days?: Field<number>;
    hours?: Field<[number, number]>;
    minGap?: Field<number>;
    validUntil?: Field<number>;
  };
  clarifications: Clarification[];
  notes: string[];
  rule: Rule | null;
};

const STOP = new Set(["USD", "USDG", "UTC", "GMT", "DCA", "ETH", "I", "A", "AM", "PM", "MAX", "OK", "ET", "EST", "PST", "WIB", "AND", "OR", "THE", "BUY", "TO", "IF", "ON", "AT", "MY", "ME", "NO", "PER", "UP", "IN", "OF", "IT", "BE", "IS", "RH"]);
const COMMON_NAME_WORDS = new Set(["strategy", "trade", "state", "united", "general", "super", "space", "planet", "quantum", "power", "global", "comfort", "fair", "intuitive", "advanced", "applied", "nano", "rocket", "circle", "tower", "western", "bloom", "snap", "zoom", "oracle", "visa", "galaxy", "monolithic", "coherent", "everpure", "penguin", "clover", "constellation", "carnival", "united", "robinhood", "invesco", "ishares", "vanguard", "roundhill", "schwab", "tema", "vaneck", "first", "credo"]);
const DAY_RE: [RegExp, number][] = [
  [/\b(mondays?|mon)\b/, 0],
  [/\b(tuesdays?|tue|tues)\b/, 1],
  [/\b(wednesdays?|wed)\b/, 2],
  [/\b(thursdays?|thu|thurs)\b/, 3],
  [/\b(fridays?|fri)\b/, 4],
  [/\b(saturdays?|sat)\b/, 5],
  [/\b(sundays?|sun)\b/, 6],
];
const MAX_WORDS = /(max(?:imum)?|at most|no more than|not more than|up to|cap(?:ped)?(?: at)?|limit(?:ed)?(?: to)?|never (?:more|above) than)\s*(?:of\s*)?$/;
const OVER_WORDS = /(above|over|more than|bigger than|larger than|greater than|exceeding|beyond)\s*$/;
const FUZZY_WORDS = /(~|about|around|roughly|approximately|approx\.?|some|maybe|or so|ish)\s*$/;
const APPROVAL_CTX = /(approv|ask me|ask first|confirm|my ok|sign[- ]?off|check with me|wait for me|need me|needs me|permission)/;

const money = /(~\s*)?\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*(k\b)?|\b(\d[\d,]*(?:\.\d{1,2})?)\s*(k)?\s*(?:usd|usdg|dollars?|bucks)\b/g;

function toMicro(num: string, k: boolean) {
  const v = Number(num.replace(/,/g, "")) * (k ? 1000 : 1);
  return Number.isFinite(v) ? Math.round(v * USD) : NaN;
}

const fmt = (micro: number) => `$${(micro / USD).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function parseStrategy(text: string, known: Known[], answers: Record<string, string>, now: number): Parsed {
  const lower = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const f: Parsed["fields"] = {};
  const clar: Clarification[] = [];
  const notes: string[] = [];
  const ask = (c: Omit<Clarification, "blocking">) => {
    if (answers[c.id] && c.options.some((o) => o.id === answers[c.id])) return answers[c.id];
    clar.push({ ...c, blocking: true });
    return null;
  };
  const quote = (re: RegExp) => (lower.match(re)?.[0] ?? "").trim();

  // ---- unsupported intents: asked, never silently dropped ----------------------------------------------------
  if (/\b(sell|sells|selling|short|shorting|take profit|stop[- ]loss)\b/.test(lower)) {
    ask({ id: "side", field: "asset", question: "Lotiq v1 rule sets only buy on a schedule. Selling, shorting and stop-losses are not supported. Continue with a buy-only rule set?", quote: quote(/\b(sell\w*|short\w*|take profit|stop[- ]loss)\b/), options: [{ id: "buy-only", label: "Yes, buy only" }] });
  }
  if (/\b(dip|dips|drops?|falls?|crash\w*|rall\w*|rsi|moving average|ma\d+)\b/.test(lower) || /\b(if|when|whenever)\b[^.]{0,40}\b(price|below|above)\b/.test(lower)) {
    ask({ id: "condition", field: "days", question: "Price conditions (dips, moving averages, price levels) are not part of v1 rules: the agent buys on its schedule, inside its limits. Drop the price condition?", quote: quote(/\b(if|when|whenever)\b[^.]{0,40}|\b(dip|dips|drops?|falls?)\b[^.]{0,20}/), options: [{ id: "drop", label: "Drop it, buy on schedule" }] });
  }
  if (/\d\s*%|\b(half|all|portion|percent|quarter) of (my|the)\b/.test(lower)) {
    ask({ id: "percent", field: "orderAmount", question: "Amounts must be fixed dollar values, not a share of a balance (the rule set cannot see your balance). Edit the text to give a dollar amount, or confirm the dollar amounts already written are the ones to use.", quote: quote(/[^ ]*\d\s*%[^.]{0,20}|\b(half|all|portion|quarter) of (my|the)[^.]{0,15}/), options: [{ id: "dollars-only", label: "Use only the dollar amounts written" }] });
  }

  // ---- asset ---------------------------------------------------------------------------------------------
  const bySym = new Map(known.map((k) => [k.symbol.toUpperCase(), k]));
  const found = new Map<string, Known>();
  const unknownTickers: string[] = [];
  for (const m of text.matchAll(/\$?\b([A-Z][A-Z0-9.]{0,5})\b/g)) {
    const t = m[1].replace(/\.$/, "");
    if (STOP.has(t) || t.length < 2) continue;
    const k = bySym.get(t);
    if (k) found.set(k.symbol, k);
    else if (/^[A-Z]{2,5}$/.test(t)) unknownTickers.push(t);
  }
  // Company names count only when written capitalised as in the list and not an ordinary English word ("Strategy", "Trade Desk").
  for (const k of known) {
    const word = k.name.split(/[ ,.]/)[0].replace(/[^A-Za-z0-9-]/g, "");
    if (word.length < 4 || !/^[A-Z]/.test(word) || COMMON_NAME_WORDS.has(word.toLowerCase())) continue;
    if (new RegExp(`\\b${word}\\b`).test(text)) found.set(k.symbol, k);
  }
  for (const u of [...new Set(unknownTickers)]) notes.push(`"${u}" is not on the list of proven Robinhood Chain stock tokens, so it cannot be used.`);
  const assets = [...found.values()];
  if (assets.length === 1) f.asset = { value: assets[0], source: "written", why: `"${assets[0].symbol}" in your text` };
  else {
    const opts = (assets.length ? assets : ["NVDA", "AAPL", "TSLA", "SPY", "MSFT"].map((s) => bySym.get(s)).filter((x): x is Known => !!x)).map((k) => ({ id: k.symbol, label: `${k.symbol} · ${k.name}` }));
    const a = ask({ id: "asset", field: "asset", question: assets.length ? "A rule set covers one asset. Which one should this rule set buy?" : "Which stock token should the agent buy?", quote: assets.map((x) => x.symbol).join(", ") || unknownTickers.join(", "), options: opts });
    if (a && bySym.get(a)) f.asset = { value: bySym.get(a)!, source: "answered", why: "your answer" };
  }

  // ---- amounts --------------------------------------------------------------------------------------------
  const plain: { micro: number; quote: string }[] = [];
  let periodFromMax: Period | null = null;
  let n = 0;
  for (const m of lower.matchAll(money)) {
    const micro = toMicro(m[2] ?? m[4], !!(m[3] || m[5]));
    if (!Number.isFinite(micro) || micro <= 0) continue;
    const at = m.index ?? 0;
    const before = lower.slice(Math.max(0, at - 40), at);
    const after = lower.slice(at + m[0].length, at + m[0].length + 40);
    const sentence = lower.slice(Math.max(0, lower.lastIndexOf(".", at) + 1), (lower.indexOf(".", at) + 1 || lower.length + 1) - 1);
    const q = (before.slice(-18) + m[0] + after.slice(0, 18)).trim();
    const id = `fuzzy-${n++}`;
    if (FUZZY_WORDS.test(before) || m[1] || /^\s*(or so|ish)\b/.test(after)) {
      // Unanswered, the question blocks the rule set; the number is still read so no second question is asked about it.
      ask({ id, field: "orderAmount", question: `You wrote "${q}". Rules need exact numbers. Use exactly ${fmt(micro)}?`, quote: q, options: [{ id: "exact", label: `Use exactly ${fmt(micro)}` }] });
    }
    if (OVER_WORDS.test(before) && APPROVAL_CTX.test(sentence)) {
      f.approvalAbove = { value: micro, source: "written", why: `"${q}"` };
      continue;
    }
    const periodAfter = after.match(/^\s*(?:in total\s*)?(?:per|a|an|each|every)?\s*(day|week|month|30 days)\b|^\s*(daily|weekly|monthly)\b/);
    if (MAX_WORDS.test(before) || /^\s*(max|maximum|at most|tops)\b/.test(after)) {
      if (periodAfter) {
        const w = periodAfter[1] ?? periodAfter[2];
        periodFromMax = /day|daily/.test(w) ? DAY : /week/.test(w) ? WEEK : MONTH30;
        f.maxPerPeriod = { value: micro, source: "written", why: `"${q}"` };
      } else f.maxPerOrder = { value: micro, source: "written", why: `"${q}"` };
      continue;
    }
    if (periodAfter && /total|budget|spend/.test(before + after)) {
      const w = periodAfter[1] ?? periodAfter[2];
      periodFromMax = /day|daily/.test(w) ? DAY : /week/.test(w) ? WEEK : MONTH30;
      f.maxPerPeriod = { value: micro, source: "written", why: `"${q}"` };
      continue;
    }
    plain.push({ micro, quote: q });
  }
  if (plain.length === 1) f.orderAmount = { value: plain[0].micro, source: "written", why: `"${plain[0].quote}"` };
  else if (plain.length > 1) {
    const a = ask({ id: "amount", field: "orderAmount", question: "Several amounts could be the order amount. Which one is the amount per order?", quote: plain.map((p) => p.quote).join(" / "), options: plain.map((p, i) => ({ id: `a${i}`, label: fmt(p.micro) })) });
    if (a) f.orderAmount = { value: plain[Number(a.slice(1))].micro, source: "answered", why: "your answer" };
  }
  if (!f.orderAmount && f.maxPerOrder) f.orderAmount = { value: f.maxPerOrder.value, source: "derived", why: "no separate order amount: the maximum per order is used" };
  if (!f.orderAmount) {
    const a = ask({ id: "amount-missing", field: "orderAmount", question: "How much should each order spend (in US dollars)?", quote: "", options: [25, 50, 100, 250].map((v) => ({ id: String(v), label: `$${v}` })) });
    if (a) f.orderAmount = { value: Number(a) * USD, source: "answered", why: "your answer" };
  }

  // ---- schedule ------------------------------------------------------------------------------------------
  let days = 0;
  let periodHint: Period | null = null;
  if (/\b(every day|daily|each day|everyday)\b/.test(lower)) days = ALL_DAYS;
  else if (/\b(weekdays?|every weekday|monday to friday|mon-fri|monday-friday|business days?|working days?)\b/.test(lower)) days = 0x1f;
  else if (/\b(weekends?)\b/.test(lower)) days = 0x60;
  else for (const [re, d] of DAY_RE) if (re.test(lower)) days |= 1 << d;
  if (/\b(weekly|every week|each week|once a week|per week|a week)\b/.test(lower)) periodHint = WEEK;
  if (/\b(daily|every day|per day|a day)\b/.test(lower)) periodHint = periodHint ?? DAY;
  const monthly = /\b(monthly|every month|once a month|each month)\b/.test(lower);
  if (days) f.days = { value: days, source: "written", why: "weekdays named in your text" };
  else if (monthly) {
    const a = ask({ id: "monthly", field: "days", question: "Lotiq schedules by weekday. For a monthly buy, pick the weekday the agent may act on; the 30-day maximum then allows one planned order per 30 days.", quote: quote(/\b(monthly|every month|once a month|each month)\b/), options: WEEKDAYS.slice(0, 5).map((d, i) => ({ id: String(i), label: d })) });
    if (a) {
      f.days = { value: 1 << Number(a), source: "answered", why: "your answer (monthly)" };
      periodHint = MONTH30;
    }
  } else if (periodHint === WEEK) {
    const a = ask({ id: "weekday", field: "days", question: "Weekly on which day? The agent may act only on the day you pick.", quote: quote(/\b(weekly|every week|each week|once a week)\b/), options: WEEKDAYS.map((d, i) => ({ id: String(i), label: d })) });
    if (a) f.days = { value: 1 << Number(a), source: "answered", why: "your answer" };
  } else {
    const a = ask({ id: "schedule", field: "days", question: "When may the agent buy?", quote: "", options: [{ id: "mon", label: "Every Monday" }, { id: "weekdays", label: "Every weekday (Mon–Fri)" }, { id: "daily", label: "Every day" }] });
    if (a) {
      f.days = { value: a === "mon" ? 1 : a === "weekdays" ? 0x1f : ALL_DAYS, source: "answered", why: "your answer" };
      periodHint = a === "daily" ? DAY : WEEK;
    }
  }
  if (periodFromMax) f.period = { value: periodFromMax, source: "written", why: "the period of your maximum" };
  else if (periodHint) f.period = { value: periodHint, source: "derived", why: periodHint === MONTH30 ? "monthly schedule" : periodHint === DAY ? "daily schedule" : "weekly schedule" };
  else f.period = { value: WEEK, source: "default", why: "a weekly spending window (resets Monday 00:00 UTC)" };

  // ---- hours ---------------------------------------------------------------------------------------------
  const h12 = (h: string, ap?: string) => {
    let v = Number(h);
    if (ap === "pm" && v < 12) v += 12;
    if (ap === "am" && v === 12) v = 0;
    return v;
  };
  const range = lower.match(/\b(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|-|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(utc|gmt)?/);
  const single = range ? null : lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(utc|gmt)?\b(?!\s*(?:usd|dollars|\$))/);
  let hours: [number, number] | null = null;
  let tzGiven = false;
  let minutes = false;
  if (range) {
    hours = [h12(range[1], range[3] ?? range[6]), h12(range[4], range[6])];
    tzGiven = !!range[7];
    minutes = !!((range[2] && range[2] !== "00") || (range[5] && range[5] !== "00"));
  } else if (single && (single[2] || single[3] || single[4])) {
    const h = h12(single[1], single[3]);
    hours = [h, h + 1];
    tzGiven = !!single[4];
    minutes = !!(single[2] && single[2] !== "00");
  }
  if (hours && hours.every((h) => h >= 0 && h <= 24)) {
    if (minutes) notes.push("Hours are whole hours: minutes were rounded down to the start of the hour.");
    if (!tzGiven) {
      const a = ask({ id: "tz", field: "hours", question: `Lotiq stores hours in UTC. Was ${String(hours[0]).padStart(2, "0")}:00–${String(hours[1]).padStart(2, "0")}:00 meant in UTC?`, quote: (range ?? single)![0].trim(), options: [{ id: "utc", label: "Yes, UTC" }, { id: "ny", label: "New York time (UTC−5 in winter): convert" }, { id: "jkt", label: "Jakarta time (UTC+7): convert" }] });
      if (a) {
        const shift = a === "ny" ? 5 : a === "jkt" ? -7 : 0;
        const s = (((hours[0] + shift) % 24) + 24) % 24;
        let e = s + (hours[1] - hours[0]);
        if (e > 24) {
          e = 24;
          notes.push("The converted window crossed midnight UTC; it was cut at 24:00 UTC. Adjust it in the form if needed.");
        }
        f.hours = { value: [s, e], source: "answered", why: shift ? `converted to UTC (${shift > 0 ? "+" : ""}${shift} h)` : "your answer" };
      }
    } else f.hours = { value: hours, source: "written", why: "hours in your text (UTC)" };
  } else f.hours = { value: [0, 24], source: "default", why: "no hours given: any hour of an allowed day (UTC)" };

  // ---- gap, validity -------------------------------------------------------------------------------------
  const gap = lower.match(/\bat least (\d{1,3}) ?(hours?|h|days?)\b[^.]{0,20}\b(apart|between)/) ?? lower.match(/\b(?:at most|no more than|max(?:imum)?) (one|1) (?:order|buy|trade|purchase)s? (?:a|per|each) (day|week)\b/);
  if (gap) {
    const v = gap[1] === "one" || gap[1] === "1" ? 1 : Number(gap[1]);
    const unit = /day|week/.test(gap[2]) ? (/week/.test(gap[2]) ? WEEK : DAY) : 3600;
    f.minGap = { value: Math.min(v * unit, 30 * DAY), source: "written", why: `"${gap[0].trim()}"` };
  } else f.minGap = { value: 0, source: "default", why: "no minimum gap between orders" };

  const until = lower.match(/\b(?:until|till|through|ending|ends?)\s+(\d{4}-\d{2}-\d{2})\b/);
  const forN = lower.match(/\bfor (\d{1,3}) (days?|weeks?|months?)\b/);
  if (until) {
    const t = Date.parse(`${until[1]}T00:00:00Z`) / 1000;
    if (Number.isFinite(t)) f.validUntil = { value: t, source: "written", why: `"${until[0].trim()}"` };
  } else if (forN) {
    const unit = /day/.test(forN[2]) ? DAY : /week/.test(forN[2]) ? WEEK : MONTH30;
    f.validUntil = { value: now + Number(forN[1]) * unit, source: "written", why: `"${forN[0].trim()}"` };
  }
  if (!f.validUntil) f.validUntil = { value: now + 90 * DAY, source: "default", why: "valid for 90 days from now" };

  // ---- derived limits and the approval question ------------------------------------------------------------
  if (!f.maxPerOrder && f.orderAmount) f.maxPerOrder = { value: f.orderAmount.value, source: "derived", why: "the order amount is the most one order may spend" };
  if (!f.maxPerPeriod && f.orderAmount && f.days) {
    const k = Math.max(1, scheduledDaysPerPeriod(f.days.value, f.period!.value));
    f.maxPerPeriod = { value: f.maxPerOrder!.value * k, source: "derived", why: `max per order × ${k} scheduled day${k === 1 ? "" : "s"} in the period` };
  }
  if (!f.approvalAbove && /\b(no approvals? (?:is )?(?:needed|required)|without (?:my )?approval|don'?t ask me|never ask me)\b/.test(lower)) {
    f.approvalAbove = { value: NO_THRESHOLD, source: "written", why: `"${quote(/\b(no approvals? (?:is )?(?:needed|required)|without (?:my )?approval|don'?t ask me|never ask me)\b/)}"` };
  }
  if (!f.approvalAbove && /\b(ask me (?:before|for) (?:every|each|any) (?:order|buy)|approve (?:every|each) (?:order|buy)|every order needs (?:my )?approval)\b/.test(lower)) {
    f.approvalAbove = { value: 0, source: "written", why: `"${quote(/\b(ask me (?:before|for) (?:every|each|any) (?:order|buy)|approve (?:every|each) (?:order|buy)|every order needs (?:my )?approval)\b/)}"` };
  }
  if (!f.approvalAbove) {
    const a = ask({ id: "approval", field: "approvalAbove", question: "Should any order wait for your approval before the agent may record it?", quote: "", options: [{ id: "none", label: "No: orders inside the limits go ahead" }, { id: "all", label: "Yes: every order" }, ...(f.orderAmount ? [{ id: "above", label: `Only orders above ${fmt(f.orderAmount.value)}` }] : [])] });
    if (a) f.approvalAbove = { value: a === "none" ? NO_THRESHOLD : a === "all" ? 0 : f.orderAmount!.value, source: "answered", why: "your answer" };
  }

  const ready = clar.length === 0 && f.asset && f.orderAmount && f.maxPerOrder && f.maxPerPeriod && f.period && f.approvalAbove && f.days && f.hours && f.validUntil;
  const rule: Rule | null = ready
    ? {
        assetSymbol: f.asset!.value.symbol,
        asset: f.asset!.value.address,
        agent: "",
        orderAmount: f.orderAmount!.value,
        maxPerOrder: f.maxPerOrder!.value,
        maxPerPeriod: f.maxPerPeriod!.value,
        period: f.period!.value,
        approvalAbove: f.approvalAbove!.value,
        days: f.days!.value,
        startHour: f.hours!.value[0],
        endHour: f.hours!.value[1],
        minGap: f.minGap!.value,
        validFrom: now,
        validUntil: f.validUntil!.value,
      }
    : null;
  return { fields: f, clarifications: clar, notes, rule };
}
