# Trading product UI research for Jev Trade

**Research date:** 2026-09-19  
**Scope:** Public product and help materials from TradingView, Robinhood, Webull, Public, eToro, Kalshi, and Polymarket. This is interaction research, not a visual imitation brief. Jev Trade should use its own words, components, colors, and brand assets.

## Product direction

Build Jev Trade as a **decision-first market workspace**. A visitor should understand the selected symbol, data freshness, Jev's frozen judgment, the deterministic market-risk reading, the paper-position risk, and the next simulated action without leaving the stock page.

The interface should feel like a professional trading tool while keeping the experiment legible to a first-time visitor. Dense data earns space only when it helps someone assess the published judgment. The primary experience is a transparent paper-trading game with a public evidence record.

The critical order is:

1. What instrument and market cutoff am I looking at?
2. Is this delayed, end-of-day, fixture, stale, or current data?
3. Can I make my blind `UP`, `FLAT`, or `DOWN` pick before reveal?
4. What did Jev judge, and when was that judgment frozen?
5. What action did the code-owned policy take?
6. How risky are the market conditions and the simulated position?
7. What evidence supported the judgment?
8. How have prior frozen judgments performed?

## Evidence from current products

| Product | Observed product pattern | Reusable lesson for Jev Trade |
| --- | --- | --- |
| TradingView | Supercharts keeps the chart central while watchlists, details, news, alerts, screeners, and portfolio open in an adjacent tool area. Its watchlists are available throughout the product and can expose different metric sets. | Keep symbol selection persistent on wide screens. Treat the chart as a shared context surface, with evidence, history, and scorecard details available without losing the selected symbol. Do not bring TradingView's full tool density into the first prototype. |
| Robinhood | Asset detail pages pair a price chart and time spans with position information. Legend uses linked, configurable widgets; selecting a symbol in a watchlist can update the related chart and position widgets. Mobile advanced charts use familiar touch gestures and progressively expose technical tools. | A symbol selection should update the whole workspace. Keep the default view simple, then disclose chart and evidence controls. Make the current house position visible beside the judgment instead of forcing a separate portfolio lookup. |
| Webull | Paper trading is available across platforms, tracks account and symbol P&L, and clearly differentiates the simulated environment. Webull specifically marks paper-order controls in orange and describes execution differences. | Put a persistent `SIMULATION` marker in the app shell and on every action card. State the fill assumptions near simulated actions and include them in history. A paper mode should be visually distinct even when screenshots crop the header. |
| eToro | The platform promotes a virtual portfolio, dark mode, integrated analysis, and cross-device continuity. | Dark mode is appropriate for prolonged data inspection. Keep navigation, terminology, and core cards stable across desktop and mobile so a later app can reuse the same mental model. |
| Public | Its chart education explicitly says chart patterns do not guarantee outcomes and labels editorial material as general information rather than investment advice. | Place limitations beside the model output. Use concrete language about uncertainty and avoid copy that treats a directional distribution as a promise or probability of profit. |
| Kalshi | Quick orders reduce a decision to an outcome side and amount, while the advanced order book remains available. Portfolio guidance distinguishes cash balance, portfolio value, current value, and possible cash-out value, and warns that a displayed value may not be executable. | The blind-pick game should offer three large, direct choices and one skip action. Paper portfolio figures need explicit labels and units. Explain how paper marks and fills are calculated instead of collapsing them into one balance. |
| Polymarket | A market page keeps open orders near the order book, while the portfolio gathers orders across markets. Displayed probability is derived from order-book pricing, and limit orders may partially fill. | Keep symbol-specific judgment and position events on the stock page, with a portfolio-wide ledger elsewhere. Label the source and meaning of every percentage. Jev's distribution, market movement, and execution assumptions must remain separate. |

## Recommended desktop information architecture

Use a restrained three-region workspace at widths of roughly 1180px and above:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Jev Trade   Search symbol…   Data cutoff / market status   SIMULATION│
├──────────────┬──────────────────────────────────┬────────────────────┤
│ Universe     │ Symbol, quote, freshness         │ Policy action      │
│ / watchlist  │ Blind pick or revealed judgment │ House position     │
│              │                                  │ Position risk      │
│ Symbol       │ Jev distribution                 │                    │
│ Last price   │ Market-risk index                │ Evidence status    │
│ Day change   │ Price chart + timeframe          │ Version / audit ID │
│ Freshness    │ Accessible price-data table      │                    │
├──────────────┴──────────────────────────────────┴────────────────────┤
│ Decision timeline / prior outcomes / correction events              │
└──────────────────────────────────────────────────────────────────────┘
```

### App shell

- Brand, global symbol search, market state, data cutoff, and `SIMULATION` status stay visible.
- Use a compact primary navigation: `Markets`, `Portfolio`, `Scorecard`, `Ledger`, `Method`.
- Show a data-source badge such as `FIXTURE`, `EOD`, or `15 MIN DELAYED`. The tooltip expands the provider, latest cutoff, and correction status.
- Preserve the selected symbol in the URL and page title. Search suggestions show ticker, company name, exchange, and eligibility state.

### Universe rail

- At desktop size, show an operator-approved universe as a sortable compact list.
- Default columns: symbol, last price, signed percent change, deterministic market-risk band, and freshness status.
- Selection updates the center and right regions together.
- Use text and shape with color: `▲ +1.8%`, `▼ −0.7%`, and `— 0.0%`. Never communicate direction through green and red alone.
- A watchlist is a browsing aid in the prototype. Avoid controls that imply a personal saved portfolio when there are no visitor accounts.

### Stock header

Place these items above all analytics:

- company name and ticker;
- last value with currency and signed session change;
- market session state;
- exact cutoff time including timezone;
- data status and age;
- immutable forecast ID when a forecast exists.

The header must state when price and forecast timestamps differ. A stale banner belongs directly below it and should explain what is unavailable or withheld.

### Blind pick and reveal

Before reveal, the hero card asks one bounded question: `Where will [SYMBOL] close after [1 / 5 / 20] sessions?`

- Present `UP`, `FLAT`, and `DOWN` as equal-width controls with plain-language threshold definitions available in the card.
- Include `Reveal without playing` as a lower-emphasis button.
- Freeze the visitor's selected horizon and choice before revealing Jev.
- After reveal, retain the visitor choice beside Jev's choice. Do not replace it with a celebratory state before resolution.
- The interaction must remain complete when analytics consent is declined or ignored.

### Revealed decision card

The revealed card should answer four things in this order:

1. **Jev judgment:** `UP`, `FLAT`, or `DOWN` with the complete three-way distribution.
2. **Policy action:** `ENTER`, `HOLD`, `EXIT`, `PASS`, or another controlled action label.
3. **Frozen at:** timestamp, market cutoff, model version, prompt/schema version, and forecast ID.
4. **Why this is limited:** compact evidence summary and a link to the immutable record.

Do not call the largest Jev class value “confidence.” Label the numbers `Jev distribution`, followed by copy such as: `Model judgment distribution. It is not a probability of profit or a guarantee.`

Use a horizontal segmented distribution with visible numeric labels and an adjacent semantic list:

```text
Jev distribution
UP 54%    FLAT 27%    DOWN 19%
Judgment: UP
```

The selected class needs a text label and stronger border or weight, in addition to color.

### Keep the three risk concepts visibly separate

Use three independent cards or sections. They must never merge into one gauge.

| Concept | Required label | Content | Prohibited shortcut |
| --- | --- | --- | --- |
| Jev judgment | `Jev distribution` | `UP / FLAT / DOWN`, complete percentages, frozen timestamp | `84% safe`, `84% chance to profit`, or a generic `AI score` |
| Deterministic conditions | `Market risk` | Numeric index, `LOW / MEDIUM / HIGH` band, and the code-owned inputs that drove it | Rephrasing model confidence as risk |
| Paper exposure | `Position risk` | Entry, virtual shares, stop/invalidation level, capital at risk, maximum planned portfolio loss, current paper P&L | Treating current P&L as maximum loss or forecast quality |

Each card gets a one-sentence definition and a `How calculated` disclosure. This separation is the primary trust feature of the product.

### Chart and evidence

- Default to a simple price chart with visible `1M`, `3M`, `6M`, and `1Y` spans appropriate to the forecast horizon.
- Mark the snapshot cutoff, simulated entry, invalidation/stop, exit, and resolution on the chart.
- Keep overlays limited to inputs actually used by the current feature schema. Extra indicators create false authority.
- Pair the chart with a semantic data table that includes date, open, high, low, close, volume, and adjustment state where licensed.
- State the displayed session and timezone. Extended-hours data should be opt-in and explicitly marked if later supported.
- If a chart fails, the table and decision record remain usable.

### Position and ledger

The right-side action card should show the policy decision before paper-position details. For an open Position trade, expose:

- virtual quantity and fill assumption;
- entry and latest paper mark;
- stop/invalidation level;
- capital at risk and maximum planned portfolio loss;
- unrealized paper P&L with currency and percentage;
- next scheduled review or expiry;
- exact policy reason for `HOLD`, `EXIT`, or `PASS`.

Use an event timeline for `PUBLISHED`, `ENTERED`, `MARKED`, `HELD`, `EXITED`, `RESOLVED`, `CORRECTED`, and `VOIDED`. Events should show time, data reference, version, and reason. Corrections append a new event and leave the original visible.

## Responsive behavior at 400 CSS pixels

At 400px, use one column and preserve this exact reading order:

1. compact brand row with `SIMULATION` and market-state text;
2. full-width symbol search;
3. stock header, quote, data status, and cutoff;
4. blind pick/reveal card;
5. revealed Jev judgment and policy action;
6. Jev distribution;
7. market-risk card;
8. position-risk card when applicable;
9. chart with timeframe controls;
10. accessible price-data rows;
11. evidence summary;
12. decision history and prior outcomes.

Implementation rules:

- Use 16px page gutters and a minimum 12px gap between interactive controls.
- Use full-width cards. Avoid horizontal page scrolling.
- Keep primary tap targets at least 44 by 44 CSS pixels, exceeding WCAG 2.2's 24px AA minimum.
- Render `UP`, `FLAT`, and `DOWN` as three controls only if each remains at least 44px high with readable labels. Stack them when translated copy or zoom causes crowding.
- Give the chart a 240–300px viewport. Hide secondary axis labels before shrinking primary price and time labels below readable size.
- Provide a `View as data` control immediately adjacent to the chart. On mobile, render the table as labeled date rows instead of a wide grid.
- Convert portfolio and ledger tables into key/value cards with the event time and type as the card heading.
- Collapse detailed evidence and methodology into native disclosure sections after the essential summary. Preserve headings when collapsed.
- Use a compact bottom navigation only if it does not cover the reveal, consent, or disclosure controls. Respect safe-area insets.
- Keep the blind-pick controls in normal document flow. Do not make a trade-like action sticky over market data.
- Test at 200% zoom, 320px reflow, and 400px viewport width. No critical label may truncate to an ambiguous acronym.

## States and feedback

Every async region needs the same state vocabulary:

- **Loading:** retain headings and known symbol/forecast identity; use labeled skeletons that do not animate under reduced motion.
- **Empty:** explain whether there is no published forecast, no open house position, or no resolved sample.
- **Stale:** keep the last value visible with age, cutoff, and the action withheld because of staleness.
- **Partial:** name the missing field or dependency. Avoid substituting zero.
- **Failed:** keep the immutable identity and other valid panels available; give a retry only when it can safely repeat the read.
- **Current:** show cutoff, source class, and version.
- **Corrected:** show the current projection and a visible link to the superseded record.
- **Externally unverified:** show the record but state that it is excluded from the prospective scorecard and paper policy.

Use polite `aria-live` announcements for completed pick, reveal, and retry actions. Do not announce every changing price tick.

## Visual system

A calm, dark-first system supports dense reading while giving the experiment its own identity. Suggested starting tokens:

| Role | Token | Contrast against `#111722` surface |
| --- | --- | ---: |
| Canvas | `#0B0E13` | — |
| Surface | `#111722` | — |
| Raised border | `#263244` | validate at component size |
| Primary text | `#F3F7FB` | 16.68:1 |
| Secondary text | `#A9B4C0` | 8.53:1 |
| Jev / focus accent | `#65D9FF` | 11.05:1 |
| Up / favorable | `#22C55E` | 7.88:1 |
| Down / adverse | `#F87171` | 6.49:1 |
| Flat / caution | `#FBBF24` | 10.76:1 |

These ratios cover text against the proposed surface. Borders, charts, focus rings, gradients, disabled states, and text placed on semantic colors still need component-level checks.

Additional rules:

- Use one sans-serif UI family and tabular numerals for prices, timestamps, percentages, quantities, and IDs.
- Right-align numeric columns on desktop and keep units in headers or labels.
- Reserve the cyan accent for selection, focus, and Jev-specific identity. Semantic green, red, and amber carry signed market meaning only when paired with symbols or words.
- Avoid neon gradients behind numeric content. Preserve contrast during hover, focus, stale, and disabled states.
- Use 1px borders, surface elevation, and spacing to group information. Excess glow makes risk states harder to compare.
- Never use red as the only treatment for an error, loss, `DOWN`, or `HIGH` risk.

## Trust and safety copy

Put operational truth near the action it qualifies. Recommended patterns:

- Global shell: `SIMULATION · No real orders are placed.`
- Data badge: `End-of-day data · Cutoff Sep 18, 2026, 4:00 PM ET.`
- Fixture mode: `Fixture data · For interface testing. Current market conditions are not represented.`
- Jev output: `Jev distribution describes this frozen model judgment. It is not a probability of profit.`
- Market risk: `Code-calculated from the published inputs below.`
- Position risk: `Paper position · Maximum planned loss assumes the displayed fill and stop. Gaps can exceed it in real markets.`
- Policy pass: `No paper entry: market risk exceeds the policy limit.`
- Stale state: `Last valid snapshot is 2 sessions old. New paper actions are paused.`
- Scorecard warning: `12 resolved forecasts · Early sample. Results are unstable and do not establish an edge.`
- Results: `Prospective simulated results. Past paper performance does not predict future results.`
- Visitor game: `Unauthenticated visitor picks are an engagement sample and are excluded from Jev's scorecard.`
- Analytics choice: `Help measure the experiment with anonymous product analytics. Declining does not limit the app.`

Avoid `safe`, `guaranteed`, `best stock`, `winning trade`, `easy money`, and personalized directives such as `you should buy`. Prefer `Jev judged`, `the policy entered`, and `the house simulation holds`.

## Restrained success celebration

Celebrate a resolved game result only after the server confirms the frozen visitor pick and frozen market outcome. The effect should acknowledge completion without turning market risk into casino feedback.

Recommended behavior:

- On a correct visitor pick, show a compact result panel with a check icon, `Your pick matched the outcome`, the realized return threshold, and links to the immutable outcome and Jev comparison.
- Permit one 500–700ms surface pulse and at most 12 small particles contained inside the result card. No sound, vibration, screen shake, jackpot language, or repeated loop.
- Use the same result layout for incorrect and flat outcomes, with plain factual copy and no punitive animation.
- Never celebrate an unresolved mark-to-market gain or a Jev forecast merely because it was published.
- Record celebration as already seen for that browser and outcome so navigation does not replay it.
- Keep share prompts after the evidence link, never between the result and its qualification.

For `prefers-reduced-motion: reduce`:

- remove particle movement, scale, bounce, parallax, shimmer, chart-trace animation, and smooth auto-scroll;
- replace the pulse with an immediate border/color change and static check icon;
- keep the full result text and status announcement;
- ensure disabling motion does not remove information or delay controls.

## Accessibility acceptance checks

Use WCAG 2.2 AA as the minimum release target:

- text contrast is at least 4.5:1, and large text at least 3:1;
- active component boundaries and focus indicators meet non-text contrast requirements;
- meaning never depends on color alone;
- every chart fact needed for a decision has a text or table equivalent;
- keyboard order follows the visual reading order and focus remains visible;
- native buttons, inputs, tables, headings, landmarks, and disclosure elements are preferred;
- no drag-only control is required for chart or timeline use;
- tap targets meet the 24px AA minimum and target 44px for the mobile product;
- changes after pick, reveal, retry, and resolution are announced without flooding assistive technology;
- interface motion can be disabled and nothing flashes more than three times per second;
- error text identifies the field or failed region and gives a concrete recovery step;
- status terms such as `UP`, `HIGH RISK`, `STALE`, and `SIMULATION` remain visible text in screenshots and at 200% zoom.

## Concrete prototype priorities

1. Implement the stock header, blind pick/reveal, Jev distribution, policy action, and three risk concepts as the first complete vertical slice.
2. Add a desktop universe rail that becomes search-first navigation at 400px.
3. Add the price chart only with its semantic table, cutoff marker, and required attribution.
4. Build a shared house-position card and append-only decision timeline before adding visual trading controls.
5. Apply the simulation, fixture/data-freshness, sample-size, and model-distribution copy in the first version.
6. Make loading, stale, partial, failed, corrected, and externally-unverified states part of the component API.
7. Add the restrained resolved-pick celebration after server-verified resolution and reduced-motion behavior are in place.
8. Defer customizable layouts, drawing tools, social feeds, advanced orders, and dense indicator catalogs until the evidence loop proves useful.

## Sources

All links were accessed 2026-09-19. Dates below are page dates where the publisher provides one; otherwise the page is marked undated.

- TradingView, [Getting started with Supercharts](https://www.tradingview.com/support/solutions/43000746464-getting-started-with-supercharts/) (undated): chart workspace, search, watchlist, details, news, screeners, and portfolio surfaces.
- TradingView, [Mastering the TradingView watchlists](https://www.tradingview.com/support/solutions/43000745825-mastering-the-tradingview-watchlists/) (undated): persistent lists, grouping, symbol search, news, fundamental, and technical context.
- Robinhood, [Widgets in Robinhood Legend](https://robinhood.com/us/en/support/articles/widgets-in-robinhood-legend/) (undated): linked widgets, chart and watchlist customization, positions, orders, and account summary.
- Robinhood, [Using advanced charts](https://robinhood.com/us/en/support/articles/using-advanced-charts/) (undated): mobile chart gestures, progressive chart tools, time spans, and warning for confirmation-bypassing actions.
- Webull, [Paper Trading](https://www.webull.com/help/faq/11069) (undated): cross-platform simulation, explicit paper-mode differentiation, P&L views, and execution behavior.
- Webull, [paperTrade](https://www.webull.com/paper-trading) (undated): distinct paper themes, virtual funds, realistic account logic, and charting.
- eToro, [The eToro online trading platform and mobile app](https://www.etoro.com/trading/platforms/) (undated): virtual portfolio, dark mode, integrated analysis, and cross-device use.
- Public, [How to read stock chart patterns](https://public.com/learn/how-to-read-stock-charts) (updated 2026-02-05): limits of chart patterns and general-information language.
- Kalshi, [Portfolio](https://help.kalshi.com/en/articles/13823844-portfolio) (updated 2026): distinction among cash, portfolio value, current value, and executable cash-out value.
- Kalshi, [The Orderbook](https://help.kalshi.com/en/articles/13823828-the-orderbook) (2026-03-10): price and quantity hierarchy and bid/ask views.
- Kalshi, [Quick Order Purchase](https://help.kalshi.com/en/articles/13823812-quick-order-purchase) (2026-03-17): bounded outcome choice and amount/contract input.
- Polymarket, [How Are Prices Calculated?](https://help.polymarket.com/en/articles/13364488-how-are-prices-calculated) (2026-03-13): how displayed probability relates to the order book.
- Polymarket, [Limit Orders](https://help.polymarket.com/en/articles/13364444-limit-orders) (2026-04-20): open orders on market pages, portfolio-wide order management, and partial fills.
- W3C, [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/) (Recommendation updated 2024-12-12): contrast, use of color, reflow, keyboard behavior, target size, and animation criteria.
- MDN, [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) (accessed 2026-09-19): operating-system motion preference detection and reduced-motion implementation.
