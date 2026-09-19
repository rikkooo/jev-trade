# Market-data provider decision for the Jev Trade prototype

**Decision date:** 2026-09-19  
**Scope:** 20–50 liquid US-listed equities, one ETF benchmark, end-of-day operation, at least 300 requested sessions, public web display, prospective paper decisions, retained derived descriptors, Jev processing, and promotional screenshots/video.  
**Status:** Conditional procurement decision. No provider has yet granted the complete rights Jev Trade needs.

## Decision

Pursue a **Tiingo EOD + IEX Display Redistribution agreement as the primary source**, subject to a signed order form or supplemental terms that answer every blocking rights question below. Use **Twelve Data Business as the backup**, again only after the external-display/redistribution scope is in writing.

Tiingo is the best fit for this deliberately small EOD prototype because:

- its EOD response supplies raw and split/dividend-adjusted OHLCV together with dividend cash and split factors;
- it publishes 60+ years of history, far beyond the 300-session requirement;
- its product page publishes a startup display-redistribution price of **USD 250/month** and an enterprise price of **USD 500/month** for EOD + IEX, while requiring contact with sales to activate the license;
- its current terms explicitly allow retention and distribution of non-reconstructable analytical outputs such as volatility measures, rankings, scores, signals, classifications, and forecasts; and
- its EOD corrections and corporate-action fields are a better fit for a reproducible daily experiment than an intraday feed.

This recommendation is conditional because Tiingo does not document a market-calendar or current-market-status endpoint, its detailed corporate-action endpoints are described as beta/early release, and its standard API plans remain internal-use only. The signed redistribution agreement must cover the actual Jev Trade workflow, including charts, retained history, media captures, and onward processing of approved derived descriptors. A deterministic US exchange-calendar component can fill the technical calendar gap only if the agreement permits that composition and the project records its authoritative source and version.

Twelve Data is the backup because it documents all four adjustment modes (`all`, `splits`, `dividends`, `none`), dividends and splits, a current `market_state` endpoint, and an `exchange_schedule` endpoint. Its business pricing advertises external display on Venture and external distribution on Enterprise. Its general terms still say that external display or redistribution must be expressly authorized by the subscription, an add-on, or a separate agreement, and that caching is limited by undocumented permitted timeframes. The exchange-schedule endpoint also requires Enterprise. Those ambiguities must be resolved in writing before use.

**No provider-sourced field, chart, descriptor, forecast, scorecard, share card, screenshot, or promotional video may be made public until the launch gate in this document passes.** A working API key or paid self-service plan is not evidence of those rights.

## Required data flow

The quote request to each vendor must describe the complete flow, not only the API endpoints:

1. Jev Trade fetches at least 300 completed daily sessions for each allowlisted equity and a benchmark such as SPY.
2. It needs both raw/as-traded and consistently adjusted OHLCV, corporate-action metadata, exchange sessions, holidays/early closes, and market status.
3. Raw provider payloads remain server-side. The app retains normalized source records or permitted cached fields long enough to reproduce published decisions and resolve corrections.
4. Code derives returns, trends, moving-average distance, RSI, ATR, realized volatility, drawdown, volume regime, gaps, relative strength, benchmark regime, staleness, and missing-data flags.
5. Only approved structured descriptors, identifiers, and content hashes are sent to Jev through the selected AI processor. No provider-native payload is sent.
6. The public site displays permitted quotes/charts, derived risk measures, frozen Jev judgments, paper-position events, outcomes, and aggregate scorecards.
7. The team may capture the site in screenshots, share cards, livestreams, and recorded YouTube/social media promotion. Those media may remain available after the underlying subscription ends.

## Provider comparison

Prices are public list prices observed on the decision date. Taxes, exchange fees, startup qualification, professional status, add-ons, negotiated rights, and contract minimums can change the effective cost.

| Provider | Technical fit | Published public-use position | Published cost signal | Decision |
|---|---|---|---|---|
| **Tiingo** | Strong EOD fit. Raw and adjusted OHLCV, `divCash`, `splitFactor`, 60+ years, EOD corrections; detailed split/dividend endpoints exist but are described as beta/early release. No documented exchange-calendar or market-status endpoint. | Free, Power, and ordinary Commercial are internal use only. EOD + IEX Display Redistribution is a separate sales product. Current terms permit non-reconstructable derived statistics, scores, signals, classifications, forecasts, and sufficiently broad hashes; source data must be deleted when the paid plan ends unless separately agreed. Attribution is required when redistribution is permitted. | USD 250/month for qualifying startups; USD 500/month for enterprise, contact sales. | **Primary procurement target**, conditional on calendar design and complete written rights. |
| **Twelve Data** | Very strong one-API fit. Daily OHLCV supports `all`, `splits`, `dividends`, and `none`; dividends/splits; `market_state`; `exchange_schedule`; EOD global equities/ETFs. Exchange schedule is Enterprise-only. | Business pricing advertises external display on Venture and external distribution on Enterprise. Terms require an expressly authorized tier, Redistribution Rights Add-On, or separate agreement, and place responsibility for exchange rules on the customer. Derived data must be non-reconstructable. Retention/caching timeframes are not stated on the reviewed pages. | Venture is advertised from USD 149/month; the pricing page's displayed higher-credit configuration was USD 499 monthly or USD 4,990 annually. Enterprise was USD 1,099 monthly or USD 10,992 annually. | **Backup**, conditional on a written rights schedule and a costed tier that includes required endpoints. |
| **Financial Modeling Prep (FMP)** | Strong one-vendor feature fit: 30+ years, adjusted/unadjusted stock charts, dividends, splits, exchange hours and holidays, benchmark/index data. | Public display and redistribution require a specific Data Display and Licensing Agreement. Its terms prohibit public display, derivative works, transmission, and commercial use without prior written approval. | Enterprise/custom quote. | Credible procurement fallback if it quotes a narrow EOD agreement competitively; no self-service public launch. |
| **Massive (formerly Polygon.io)** | Strong US coverage, 20+ years on Business, raw and split-adjusted aggregates, dividends/splits, market status and upcoming holidays. Its documentation states aggregate history is adjusted for splits but not dividends; dividend adjustment would need code or separate factors. | Individual plans are expressly individual use. General market-data terms prohibit third-party display, derived works, non-display use, and commercial use absent express consent. Business terms allow use in customer applications subject to order forms and third-party agreements; exact edge-user/display/derived rights must be in the order form. | Stocks Business USD 2,499/month; Enterprise custom. | Technically credible but disproportionate for this EOD prototype and not licensed by an individual subscription. |
| **Alpha Vantage** | Technically adequate for the core series: raw daily, premium daily-adjusted data with split/dividend events, 25+ years, market-status utility, dividends/splits, and index data. It does not document the full public-display package required here. | Terms direct corporate or commercial users to contact sales. Self-service access does not establish redistribution, media, or derived-output rights. | Commercial quote required. | Development candidate only after written commercial terms; weaker procurement clarity than the leaders. |
| **Nasdaq Data Link** | Dataset marketplace rather than one normalized operational feed. QuoteMedia EOD US Prices is premium; calendar/status and corporate-action coverage depend on chosen datasets. | License scope is order-form specific. General terms prohibit redistribution, SaaS/cloud provision, and other use not detailed in the order form; third-party dataset terms also apply. | Dataset/order-form specific; public price not established for the complete scope. | Poor fast-prototype fit because technical coverage and rights would have to be assembled across datasets/contracts. |
| **Alpaca Market Data** | Strong developer API: daily bars since 2016, corporate actions, calendar and clock/status, benchmark-capable US equity/ETF coverage. | Alpaca's official support answer says its API data cannot be redistributed. Customer terms also prohibit reproduction, distribution, sale, or commercial exploitation without written consent. Broker partners can seek tailored solutions, but that is a different commercial relationship. | Free Basic and USD 99/month Algo Trader Plus are trader plans, not public redistribution licenses; broker/custom pricing is separate. | **Reject for the public prototype.** Useful only for internal development if its terms permit the exact internal use. |

## Why Tiingo wins the first sales call

### Technical coverage

The EOD endpoint exposes these fields per session:

- raw `open`, `high`, `low`, `close`, and `volume`;
- adjusted `adjOpen`, `adjHigh`, `adjLow`, `adjClose`, and `adjVolume`;
- `divCash`; and
- `splitFactor`.

Tiingo states that the adjustment methodology includes splits and dividends and that US equity data is normally available around 5:30 p.m. Eastern, with corrections applied through 8:00 p.m. This lets the adapter keep execution-price logic on raw bars while using adjusted history for indicators and total-return comparisons. Its 60+ years of coverage comfortably supports 300 requested sessions and a 272-valid-session post-validation floor.

The remaining technical gaps are explicit:

- no documented exchange-session/holiday/current-status API;
- detailed corporate actions are marked beta/early release even though `divCash` and `splitFactor` are stable EOD fields;
- symbol lifecycle beyond metadata and supported-ticker files must be tested, especially changes, delistings, mergers, and cancelled actions; and
- point-in-time correction/version semantics need a vendor answer because Jev Trade must reproduce what was known at publication time.

### Rights coverage

Tiingo's public terms are clearer than the other candidates about derived outputs. They permit outputs that cannot substitute for or reconstruct the source data, and specifically list aggregate backtest measures, suitably scoped percentage changes, volatility measures, rankings, scores, trading signals, classifications, forecasts, and secure hashes of at least five fields. They prohibit reconstructable sequences, source-like charts/tables/APIs, and model outputs that disclose or allow inference of source data.

That is compatible in principle with Jev Trade's compact semantic descriptors and frozen judgments. It does **not** by itself authorize sending any data or descriptor to a third-party AI processor, nor does it settle public chart display, recorded media, or retention of normalized source records. The display-redistribution order form must do that work.

### Cost fit

The published USD 250/month startup display license is the lowest explicit public-display price found among the reviewed providers. The narrow universe needs little call volume, so Jev Trade should buy rights and data quality rather than intraday throughput. The contract should not silently bundle an unnecessary real-time feed or exchange reporting burden merely because IEX is included in the named product.

## Why Twelve Data is the backup

Twelve Data minimizes technical composition. Its API documents:

- daily OHLCV with explicit adjustment modes for all events, only splits, only dividends, or none;
- dividend and split history/calendars;
- a current market-state endpoint; and
- exchange trading sessions through `exchange_schedule`.

The limitations are contractual and commercial. Venture advertises external display, Enterprise advertises external distribution, and `exchange_schedule` is Enterprise-only. The general terms nevertheless make external display conditional on the exact tier/add-on/agreement, say caching cannot exceed documentation-specific limits, and make the customer responsible for exchange requirements. Jev Trade needs a rights schedule that overrides ambiguity for its exact fields and data flow.

If Tiingo cannot grant the media, AI-processing, retention, and calendar composition rights at the published startup economics, request a Twelve Data Venture and Enterprise quote against the same written scope. Do not select based solely on the pricing-page feature labels.

## Binding rights questions

Send this checklist in writing to Tiingo and Twelve Data. FMP can receive the same request as a third quote. A salesperson's call summary is insufficient; the answers must be in the signed order form, an incorporated rights schedule, or a provider email that the contract says is binding.

### Identity, product, and audience

- What exact customer legal entity and product/domain are licensed?
- Does the license cover a free, anonymous, globally accessible public website with no end-user accounts or entitlement checks?
- Does it cover 20–50 allowlisted US-listed common stocks and one ETF benchmark such as SPY?
- Which exchanges, tapes, and third-party sources are included? Are any separate exchange agreements, declarations, professional classifications, fees, usage reports, or audits required?
- Is end-of-day/final data licensed, and at what exact time after the close may it become public?

### Fields and display

- May Jev Trade display latest completed-session open/high/low/close/volume, percentage changes, historical charts, benchmark comparisons, split/dividend markers, market-open/closed state, next session, and delayed/final timestamps?
- May the site display raw and adjusted series? If not, which exact fields and maximum history may be shown?
- Are tooltip-level values considered display, redistribution, or extraction?
- Must the UI block copy, download, CSV/JSON access, browser caching, or developer-tools visibility beyond ordinary rendered pages?
- What wording, logo, link, delay label, or attribution is mandatory, and on which views?

### Storage, corrections, and termination

- May the service retain at least 300 daily sessions per symbol and benchmark in its database, replicas, encrypted backups, and disaster-recovery copies?
- May it retain source identifiers, timestamps, provider revision/correction metadata, normalized fields, and cryptographic hashes indefinitely to reproduce a published forecast?
- Must historical adjusted series be rewritten after a corporate action, or can Jev Trade preserve both the original publication-time state and later corrected state?
- How are late corrections, delistings, mergers, symbol changes, dividends, and split cancellations delivered?
- When the subscription ends, which source, normalized, cached, backup, audit, and derived records must be deleted, on what schedule?
- May published forecasts, descriptors, paper ledger events, outcomes, and aggregate scorecards remain after termination?

### Derived data and public scorecards

- Are returns, RSI, ATR, realized volatility, drawdown, percentile regimes, trend labels, relative strength, benchmark regime, risk scores, and position-risk scores treated as permitted derived data?
- Are frozen Jev probability distributions, judgments, action labels, forecasts, Brier scores, calibration tables, hit rates, paper P&L, and aggregate benchmark comparisons permitted public outputs?
- What granularity, history length, anchors, or combinations would make those outputs reconstructable and therefore prohibited?
- May Jev Trade publish share cards or screenshots containing those outputs?
- Does the provider claim any rights in the model outputs, judgments, scorecards, or other customer-created derived data?

### Onward AI processing

- May approved, non-reconstructable derived descriptors and source hashes be transmitted to an external AI processor for inference?
- Name the intended processor and subprocessor path in the agreement: Jev through the selected OpenRouter/Vercel route, with no raw OHLCV or provider-native payload.
- Is this use treated as non-display, redistribution, a service bureau, outsourcing, or ordinary customer processing?
- May the processor retain prompts/responses, use them for training, route them across regions, or expose them to additional subprocessors? Which settings must Jev Trade enforce?
- Are embeddings, cached prompts, logs, traces, evaluations, and model outputs permitted, and for how long?
- Does the provider require a data-processing or subprocessor addendum?

### Screenshots, video, and promotion

- May Jev Trade record and publish screenshots, screen recordings, livestreams, YouTube videos, social posts, thumbnails, press images, and presentation slides that show licensed fields or charts?
- May those recordings be monetized, sponsored, advertised, embedded, clipped, or syndicated?
- May old media remain online after data corrections, contract expiry, or provider change?
- What attribution and delay/as-of statement must appear in the product and in each medium?
- Are share-card images or downloadable static reports separately classified as redistribution?

### Operations and enforcement

- May the application use a CDN, serverless functions, managed database, observability provider, error tracker, encrypted backups, and contractors as subprocessors?
- Which provider fields may appear in server logs, metrics, traces, or support exports?
- What rate, bandwidth, daily-call, concurrency, and burst limits apply to the proposed 51-symbol EOD job?
- Is a sandbox/evaluation key authorized for fixture validation and private development before the production contract starts?
- What SLA, correction notice, deprecation period, incident contact, audit obligation, and price-increase notice applies?
- Can the vendor terminate or change rights immediately, and what transition/export period follows?

## Adapter contract

The application-facing contract must not expose provider schemas. A provider implementation may compose a price source and a separate exchange-calendar source, but it must present one validated capability set to the domain layer.

```ts
type Adjustment = "raw" | "split" | "split_and_dividend";

type ProviderCapabilities = {
  rawDailyOhlcv: boolean;
  splitAdjustedDailyOhlcv: boolean;
  dividendAdjustedDailyOhlcv: boolean;
  corporateActions: boolean;
  historicalCorrections: boolean;
  exchangeSessions: boolean;
  currentMarketStatus: boolean;
  publicDisplayAuthorized: boolean;
  derivedOutputAuthorized: boolean;
  onwardAiAuthorized: boolean;
  mediaCaptureAuthorized: boolean;
};

interface MarketDataProvider {
  readonly providerId: string;
  readonly contractVersion: string;
  readonly capabilities: ProviderCapabilities;

  getInstrument(symbol: AllowedSymbol): Promise<InstrumentIdentity>;
  getDailyBars(request: DailyBarsRequest): Promise<SourceBatch<DailyBar>>;
  getCorporateActions(request: CorporateActionRequest): Promise<SourceBatch<CorporateAction>>;
  getSessions(request: SessionRequest): Promise<SourceBatch<ExchangeSession>>;
  getMarketStatus(request: MarketStatusRequest): Promise<SourceBatch<MarketStatus>>;
}
```

Normalized records must include:

- canonical symbol plus stable provider/security identifier, listing exchange/MIC, currency, and asset type;
- session date and exchange timezone;
- raw OHLCV and separately identified adjusted OHLCV/factors, never a field whose adjustment semantics are implicit;
- action type, declaration/ex/record/pay/effective dates where available, factors/cash, status, and provider event identifier;
- provider name, endpoint/dataset, request and receive times, source as-of/finalization time, correction/revision marker, and content hash;
- rights-record ID, permitted retention class, and permitted public projection class; and
- benchmark identity and the same provenance fields as the security.

`DailyBarsRequest` must ask for at least 300 sessions and specify the adjustment mode, completed-session cutoff, benchmark, and point-in-time bound. The normalization layer must reject unordered/duplicate dates, non-finite or non-positive prices, negative volume, inconsistent OHLC, mixed currencies, unknown adjustment semantics, future bars, partial current-day bars, missing benchmark sessions, and unexplained split/action discontinuities.

The snapshot builder must require at least 272 valid aligned completed sessions after gaps and warm-up. It must fail closed when the provider or calendar is stale, the latest completed session is missing, a split cannot be reconciled, a correction changes a published cutoff without an append-only correction event, or any required capability is absent.

### Public projection rules

- Raw provider payloads and credentials never leave the server and never enter logs.
- Public APIs return only fields named in the active rights record.
- Derived descriptors sent to Jev are allowlisted by version; they contain no raw bar sequence or reconstructable anchors unless the agreement expressly permits it.
- Provider payload retention and derived-record retention are separate policies.
- Every snapshot stores the provider contract/version, rights-record ID, normalized-state hash, feature version, calendar version, and benchmark version.
- A provider change creates a new source/version boundary; it never silently rewrites a published cohort.

## Public-launch gate

`PUBLIC_MARKET_DATA` must default to `false`. Enabling it requires all of the following evidence:

1. A signed provider order form or incorporated rights schedule names Jev Trade, its public domains, audience, territories, product tier, fields, exchanges, benchmark, delay/finality, display modes, storage, backups, derived outputs, AI processing, media use, attribution, termination, and effective dates.
2. Any required exchange declarations, agreements, fees, reporting setup, and professional/non-professional classification are complete.
3. A provider-rights record reproduces those permissions as machine-readable allowlists and is reviewed by the project owner.
4. The selected AI processor's terms and settings permit the same descriptors, retention, deletion, training, residency, and subprocessors authorized by the data provider.
5. Contract tests prove that public routes cannot return provider-native payloads or unlicensed fields and that missing/expired rights fail closed.
6. UI review confirms required attribution, source, as-of time, delay/finality, methodology, and simulation disclosures on desktop and mobile.
7. A screenshot/video test asset has been reviewed against the media clause before any YouTube or social promotion.
8. Backup deletion, subscription termination, provider correction, and provider-outage procedures have been exercised.

If any item is missing, the deployment stays in fixture/private mode. Public routes must not expose provider-sourced values, charts, data-derived market descriptors, live forecasts, scorecards, share cards, or promotional captures. Fixtures must be unmistakably labeled and excluded from prospective performance claims.

## Procurement sequence

1. Send the complete workflow and rights checklist to Tiingo, Twelve Data, and optionally FMP on the same day.
2. Request separate prices for 20, 50, and 51 instruments (including the benchmark), one EOD refresh daily, anonymous public display, no downloads, and the specified media/AI use.
3. Ask each vendor to mark every requested right as included, excluded, separately priced, or dependent on an exchange agreement.
4. Prefer Tiingo if its binding terms cover all required use at the published startup economics and accept the composed calendar source.
5. Choose Twelve Data if Tiingo cannot close the calendar, retention, media, or AI-processing gaps and Twelve Data supplies a complete rights schedule at an acceptable tier.
6. Consider FMP only if its custom agreement is more complete or competitively priced than the two leaders.
7. Continue fixture-only implementation if no vendor signs the required scope. Do not bridge the gap with an individual, free, trader, or internal-use plan.

## Official evidence reviewed

### Tiingo

- [EOD product and redistribution pricing](https://www.tiingo.com/products/end-of-day-stock-price-data)
- [EOD API fields and adjustment methodology](https://www.tiingo.com/documentation/end-of-day)
- [Terms: storage, retention, derived products, and API redistribution](https://api.tiingo.com/tos/)
- [General API licensing guidance](https://www.tiingo.com/documentation/general)
- [Detailed split endpoint status](https://www.tiingo.com/documentation/corporate-actions/splits)
- [Detailed dividend endpoint status](https://www.tiingo.com/documentation/corporate-actions/dividends)

### Twelve Data

- [Business pricing and display/distribution tiers](https://twelvedata.com/pricing-business)
- [API documentation: time series, adjustments, actions, market state, and exchange schedule](https://twelvedata.com/docs)
- [Terms: external display, derived data, retention constraints, and third-party requirements](https://twelvedata.com/terms)
- [Commercial and personal usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage)
- [EOD usage guidance](https://support.twelvedata.com/en/articles/12682324-end-of-day-eod-pricing-market-data)

### Financial Modeling Prep

- [Commercial pricing and licensing notice](https://site.financialmodelingprep.com/developer/docs/pricing?planType=commercial)
- [Terms of service](https://site.financialmodelingprep.com/terms-of-service)
- [Public app/website licensing guidance](https://site.financialmodelingprep.com/de/insights/platform/can-you-use-fmp-data-in-a-public-app-website-or-client-dashboard)

### Massive

- [Business pricing](https://massive.com/business)
- [Business terms](https://massive.com/legal/businesses-terms-of-service)
- [Market-data terms](https://massive.com/legal/market-data-terms-of-service)
- [Stocks API overview](https://massive.com/docs/rest/stocks/overview)
- [Adjustment behavior](https://massive.com/knowledge-base/article/is-massives-stock-data-adjusted-for-splits-or-dividends)
- [Market status and holidays](https://massive.com/knowledge-base/article/does-massive-have-a-market-holiday-or-status-page)

### Alpha Vantage

- [API documentation](https://www.alphavantage.co/documentation/)
- [Terms of service](https://www.alphavantage.co/terms_of_service/)
- [Premium plan page](https://www.alphavantage.co/premium/)

### Nasdaq Data Link

- [Data license terms](https://data.nasdaq.com/terms)
- [Data product organization](https://docs.data.nasdaq.com/docs/data-organization)

### Alpaca

- [Market-data plans and coverage](https://docs.alpaca.markets/us/docs/about-market-data-api)
- [Official redistribution answer](https://alpaca.markets/support/redistribute-alpaca-api)
- [Market-data product page](https://alpaca.markets/data)
- [Corporate-actions reference](https://docs.alpaca.markets/us/reference/corporateactions)

