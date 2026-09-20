/**
 * Independent U2 UI/UX/accessibility audit runner.
 * Does not modify product source. Writes compact JSON + selected screenshots.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/home/admin/worktrees/jev-trade-v0.1-ui-target/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.U2_OUT_DIR || __dirname;
const CHROME = process.env.PLAYWRIGHT_CHROME_PATH || "/usr/bin/google-chrome";
const LOCAL = process.env.U2_LOCAL_ORIGIN || "http://127.0.0.1:3000";
const DEPLOYED = process.env.U2_DEPLOYED_ORIGIN || "https://www.jev-trade.dev";
const AXE_PATH =
  process.env.U2_AXE_PATH || "/tmp/jev-u2-axe/node_modules/axe-core/axe.min.js";
const axeSource = await readFile(AXE_PATH, "utf8");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 400, height: 860 },
];

const ROUTES = [
  { id: "home", path: "/", titleHint: "Jev Trade" },
  { id: "explore", path: "/explore" },
  { id: "stock-acme-current-blind", path: "/stocks/acme", state: "current" },
  { id: "stock-nova-current", path: "/stocks/nova", state: "current" },
  { id: "stock-mesa-resolved", path: "/stocks/mesa", state: "resolved" },
  { id: "stock-orbt-stale", path: "/stocks/orbt", state: "stale" },
  { id: "stock-heli-incomplete", path: "/stocks/heli", state: "incomplete" },
  { id: "stock-kite-failed", path: "/stocks/kite", state: "failed" },
  { id: "stock-vela-void", path: "/stocks/vela", state: "void" },
  { id: "stock-luma-corrected", path: "/stocks/luma", state: "corrected" },
  { id: "stock-unknown-empty", path: "/stocks/zzzz", expectStatus: 404 },
  {
    id: "forecast-mesa-resolved",
    path: "/forecasts/01K4MESA1SPRINTRES00001",
    state: "resolved",
  },
  {
    id: "forecast-orbt-stale",
    path: "/forecasts/01K3ORBT5SPRINTSTALE001",
    state: "stale",
  },
  {
    id: "forecast-heli-incomplete",
    path: "/forecasts/01K3HELI20POSINCOMP0001",
    state: "incomplete",
  },
  {
    id: "forecast-kite-failed",
    path: "/forecasts/01K3KITE1SPRINTFAIL0001",
    state: "failed",
  },
  {
    id: "forecast-vela-void",
    path: "/forecasts/01K2VELA5SPRINTVOID0001",
    state: "void",
  },
  {
    id: "forecast-luma-corrected",
    path: "/forecasts/01K2LUMA20POSCORR00001",
    state: "corrected",
  },
  {
    id: "forecast-nova-current",
    path: "/forecasts/01K5D3JEVNOVA20POS00001",
    state: "current",
  },
  {
    id: "forecast-acme-blind-blocked",
    path: "/forecasts/01K5D3JEVACME5SPRINT0001",
    expectStatus: 404,
  },
  {
    id: "share-mesa",
    path: "/forecasts/01K4MESA1SPRINTRES00001/share",
    state: "resolved",
  },
  {
    id: "share-acme-blind-blocked",
    path: "/forecasts/01K5D3JEVACME5SPRINT0001/share",
    expectStatus: 404,
  },
  { id: "portfolio", path: "/portfolio" },
  { id: "scorecard", path: "/scorecard" },
  { id: "methodology", path: "/methodology" },
  { id: "operator", path: "/operator" },
  { id: "not-found", path: "/this-route-does-not-exist", expectStatus: 404 },
];

const SCREENSHOT_ROUTES = new Set([
  "home",
  "stock-acme-current-blind",
  "stock-nova-current",
  "stock-orbt-stale",
  "stock-heli-incomplete",
  "stock-kite-failed",
  "stock-vela-void",
  "stock-luma-corrected",
  "forecast-luma-corrected",
  "portfolio",
  "scorecard",
  "methodology",
  "not-found",
]);

function relativeLuminance(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function parseRgb(input) {
  if (!input) return null;
  if (input === "transparent" || input.includes("rgba(0, 0, 0, 0)"))
    return null;
  const m = input.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a] = m[1].split(",").map((x) => Number(x.trim()));
  if (Number.isFinite(a) && a === 0) return null;
  return [r, g, b];
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(...fg);
  const L2 = relativeLuminance(...bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

async function collectPageMetrics(page) {
  return page.evaluate(() => {
    const overflowX =
      document.documentElement.scrollWidth - window.innerWidth > 1;
    const overflowYNeeded = document.documentElement.scrollHeight;
    const landmarks = [...document.querySelectorAll("header, nav, main, aside, footer, [role]")].map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        name:
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby") ||
          (el.id ? `#${el.id}` : null),
        id: el.id || null,
      }),
    );
    const mains = [...document.querySelectorAll("main, [role='main']")].map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        parentMain: Boolean(el.parentElement?.closest("main, [role='main']")),
      }),
    );
    const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
      (el) => ({
        level: Number(el.tagName.slice(1)),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
      }),
    );
    const skip = document.querySelector(".skip-link, a[href='#main-content']");
    const interactive = [
      ...document.querySelectorAll(
        "a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex='-1'])",
      ),
    ];
    const visibleInteractive = interactive.filter((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden")
        return false;
      if (style.opacity === "0") return false;
      if (rect.width === 0 && rect.height === 0) return false;
      return true;
    });
    const smallTargets = visibleInteractive
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.getAttribute("aria-label") || el.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80),
          href: el.getAttribute("href"),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
          display: style.display,
          position: `${Math.round(rect.x)},${Math.round(rect.y)}`,
        };
      })
      .filter((t) => t.width < 44 || t.height < 44);

    const images = [...document.querySelectorAll("img, svg[role='img']")].map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role"),
        labelled:
          Boolean(el.getAttribute("aria-label")) ||
          Boolean(el.getAttribute("aria-labelledby")) ||
          Boolean(el.querySelector("title")),
        alt: el.getAttribute("alt"),
      }),
    );

    const live = [...document.querySelectorAll("[aria-live], [role='status'], [role='alert']")].map(
      (el) => ({
        role: el.getAttribute("role"),
        live: el.getAttribute("aria-live"),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
      }),
    );

    const reducedMotionHonored = (() => {
      const probe = document.querySelector(".button, .pick-button, .skeleton");
      if (!probe) return null;
      return getComputedStyle(probe).transitionDuration;
    })();

    return {
      title: document.title,
      lang: document.documentElement.lang,
      overflowX,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: overflowYNeeded,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      landmarkCount: landmarks.length,
      mains,
      headings,
      skipExists: Boolean(skip),
      skipHref: skip?.getAttribute("href") || null,
      smallTargets,
      smallTargetCount: smallTargets.length,
      visibleInteractiveCount: visibleInteractive.length,
      images,
      live,
      reducedMotionSample: reducedMotionHonored,
      hasSimulationCopy: /simulat/i.test(document.body.innerText),
      hasFixtureCopy: /fixture|synthetic/i.test(document.body.innerText),
      hasNoAdvice: /not investment advice|does not execute trades/i.test(
        document.body.innerText,
      ),
      hasProbabilityOfProfitDisclaimer:
        /not.*(calibrated as )?a (chance|probability) of profit/i.test(
          document.body.innerText,
        ),
      hasJevJudgment: /JEV JUDGMENT/i.test(document.body.innerText),
      hasMarketRisk: /DETERMINISTIC MARKET RISK/i.test(document.body.innerText),
      hasPositionRisk: /DETERMINISTIC POSITION RISK|planned loss/i.test(
        document.body.innerText,
      ),
      hasPolicyAction: /CODE-OWNED POLICY ACTION|Policy action/i.test(
        document.body.innerText,
      ),
      navLabels: [...document.querySelectorAll("nav")].map(
        (n) => n.getAttribute("aria-label") || "(unlabeled)",
      ),
    };
  });
}

async function collectContrastSamples(page) {
  return page.evaluate(() => {
    const parse = (input) => {
      if (!input || input === "transparent") return null;
      const m = input.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(",").map((x) => Number(x.trim()));
      if (parts.length === 4 && parts[3] === 0) return null;
      return parts.slice(0, 3);
    };
    const lum = (r, g, b) => {
      const f = (c) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (fg, bg) => {
      const L1 = lum(...fg);
      const L2 = lum(...bg);
      const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
      return (hi + 0.05) / (lo + 0.05);
    };
    const bgOf = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg) return bg;
        node = node.parentElement;
      }
      return parse(getComputedStyle(document.documentElement).backgroundColor) || [
        7, 10, 13,
      ];
    };
    const selectors = [
      "h1",
      "h2",
      "p",
      ".muted",
      ".eyebrow",
      ".topbar-data",
      ".simulation-pill",
      ".status-badge",
      ".button-quiet",
      ".consent-status",
      ".card-links a",
      ".text-link",
      "footer p",
      ".rail-nav a span",
      ".mobile-nav a span",
      "label",
      ".field-hint",
      "caption",
      "dt",
      "dd",
    ];
    const seen = new Map();
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const fg = parse(style.color);
        if (!fg) continue;
        const bg = bgOf(el);
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const fontSize = parseFloat(style.fontSize);
        const bold = Number(style.fontWeight) >= 700;
        const large = fontSize >= 24 || (fontSize >= 18.66 && bold);
        const r = ratio(fg, bg);
        const key = `${sel}|${text.slice(0, 40)}|${r.toFixed(2)}`;
        if (seen.has(key)) continue;
        const needed = large ? 3 : 4.5;
        seen.set(key, {
          selector: sel,
          text: text.slice(0, 80),
          fontSize,
          bold,
          large,
          ratio: Math.round(r * 100) / 100,
          needed,
          pass: r + 1e-6 >= needed,
          fg: `rgb(${fg.join(",")})`,
          bg: `rgb(${bg.join(",")})`,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.ratio - b.ratio);
  });
}

async function runAxe(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
      resultTypes: ["violations", "incomplete"],
    });
    const compact = (items) =>
      items.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.slice(0, 6).map((n) => ({
          target: n.target,
          html: n.html.slice(0, 220),
          failureSummary: (n.failureSummary || "").slice(0, 400),
        })),
        nodeCount: v.nodes.length,
      }));
    return {
      violations: compact(result.violations),
      incomplete: compact(result.incomplete).slice(0, 12),
      violationCount: result.violations.length,
      timestamp: result.timestamp,
    };
  });
}

async function tabOrder(page, limit = 35) {
  const sequence = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body)
        return { tag: "body", text: "", href: null, visible: false };
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const outline = style.outline;
      const outlineWidth = style.outlineWidth;
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.getAttribute("aria-label") || el.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80),
        href: el.getAttribute("href"),
        id: el.id || null,
        className: typeof el.className === "string" ? el.className.slice(0, 80) : "",
        visible:
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          (rect.width > 0 || rect.height > 0),
        outline,
        outlineWidth,
        box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
      };
    });
    sequence.push(info);
    if (i > 3 && info.tag === "body") break;
  }
  return sequence;
}

async function screenshot(page, name) {
  const path = join(OUT, "screenshots", `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function auditOrigin(browser, origin, originName) {
  const originResult = {
    origin,
    name: originName,
    startedAt: new Date().toISOString(),
    health: null,
    routes: [],
    journeys: {},
  };

  const healthPage = await browser.newPage();
  try {
    const health = await healthPage.goto(`${origin}/api/health`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    originResult.health = {
      status: health?.status() ?? null,
      body: await healthPage.textContent("body"),
    };
  } catch (error) {
    originResult.health = { error: String(error) };
  }
  await healthPage.close();

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "no-preference",
      colorScheme: "dark",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    for (const route of ROUTES) {
      const record = {
        origin: originName,
        viewport: viewport.name,
        viewportPx: { width: viewport.width, height: viewport.height },
        route: route.id,
        path: route.path,
        at: new Date().toISOString(),
      };
      try {
        const response = await page.goto(`${origin}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(250);
        record.status = response?.status() ?? null;
        record.metrics = await collectPageMetrics(page);
        if (viewport.name === "desktop") {
          record.contrast = (await collectContrastSamples(page)).filter(
            (c) => !c.pass,
          );
          try {
            record.axe = await runAxe(page);
          } catch (error) {
            record.axe = { error: String(error) };
          }
        }
        if (
          SCREENSHOT_ROUTES.has(route.id) &&
          (viewport.name === "mobile" || viewport.name === "desktop")
        ) {
          record.screenshot = await screenshot(
            page,
            `${originName}-${viewport.name}-${route.id}`,
          );
        }
        if (
          route.id === "stock-acme-current-blind" &&
          viewport.name === "desktop"
        ) {
          record.keyboard = await tabOrder(page, 28);
        }
      } catch (error) {
        record.error = String(error);
      }
      originResult.routes.push(record);
    }

    await context.close();
  }

  // Reduced motion + light scheme + 200% zoom on a few critical routes.
  const extras = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  const extraPage = await extras.newPage();
  extraPage.setDefaultTimeout(25000);
  await extraPage.goto(`${origin}/stocks/acme`, { waitUntil: "domcontentloaded" });
  originResult.journeys.reducedMotionLight = await extraPage.evaluate(() => {
    const button = document.querySelector(".button, .pick-button");
    const htmlScheme = getComputedStyle(document.documentElement).colorScheme;
    return {
      colorScheme: htmlScheme,
      buttonTransition: button ? getComputedStyle(button).transitionDuration : null,
      canvas: getComputedStyle(document.documentElement).backgroundColor,
      text: getComputedStyle(document.body).color,
    };
  });
  originResult.journeys.reducedMotionContrast = (
    await collectContrastSamples(extraPage)
  )
    .filter((c) => !c.pass)
    .slice(0, 20);
  originResult.journeys.lightAxe = await runAxe(extraPage).catch((e) => ({
    error: String(e),
  }));
  originResult.journeys.lightScreenshot = await screenshot(
    extraPage,
    `${originName}-desktop-acme-light-reduced-motion`,
  );
  await extras.close();

  const zoomCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  const zoomPage = await zoomCtx.newPage();
  await zoomPage.goto(`${origin}/stocks/acme`, { waitUntil: "domcontentloaded" });
  await zoomPage.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await zoomPage.waitForTimeout(200);
  originResult.journeys.zoom200DesktopAcme = await collectPageMetrics(zoomPage);
  originResult.journeys.zoom200DesktopAcme.screenshot = await screenshot(
    zoomPage,
    `${originName}-desktop-acme-zoom200`,
  );
  await zoomPage.setViewportSize({ width: 400, height: 860 });
  await zoomPage.goto(`${origin}/stocks/nova`, { waitUntil: "domcontentloaded" });
  await zoomPage.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await zoomPage.waitForTimeout(200);
  originResult.journeys.zoom200MobileNova = await collectPageMetrics(zoomPage);
  originResult.journeys.zoom200MobileNova.screenshot = await screenshot(
    zoomPage,
    `${originName}-mobile-nova-zoom200`,
  );
  await zoomCtx.close();

  // Keyboard-only blind pick + reveal, plus skip-link.
  const kctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
  });
  const kpage = await kctx.newPage();
  await kpage.addInitScript(() => localStorage.clear());
  await kpage.goto(`${origin}/stocks/acme`, { waitUntil: "domcontentloaded" });
  await kpage.keyboard.press("Tab");
  const skipFocus = await kpage.evaluate(() => ({
    text: (document.activeElement?.textContent || "").trim(),
    href: document.activeElement?.getAttribute("href"),
    className: document.activeElement?.className,
  }));
  await kpage.keyboard.press("Enter");
  const afterSkip = await kpage.evaluate(() => ({
    activeId: document.activeElement?.id,
    activeTag: document.activeElement?.tagName,
    hash: location.hash,
    mainExists: Boolean(document.getElementById("main-content")),
  }));
  await kpage.goto(`${origin}/stocks/acme`, { waitUntil: "domcontentloaded" });
  await kpage.getByRole("button", { name: /decline analytics/i }).click();
  const beforeReveal = {
    jevVisible: await kpage.getByText("UP leads the distribution").count(),
    policyVisible: await kpage.getByText("CODE-OWNED POLICY ACTION").count(),
  };
  await kpage.getByRole("button", { name: /pick up/i }).click();
  await kpage.getByRole("button", { name: /reveal Jev/i }).click();
  await kpage.getByRole("heading", { name: /UP leads the distribution/i }).waitFor();
  const afterReveal = await collectPageMetrics(kpage);
  const triptych = await kpage.evaluate(() => {
    const cards = [...document.querySelectorAll(".risk-card")].map((card) =>
      (card.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240),
    );
    const action = document.querySelector(".action-panel")?.textContent || "";
    const disclosure =
      document.querySelector(".inline-disclosure")?.textContent || "";
    return {
      cards,
      action: action.replace(/\s+/g, " ").trim().slice(0, 280),
      disclosure: disclosure.replace(/\s+/g, " ").trim(),
    };
  });
  originResult.journeys.keyboardBlindPick = {
    skipFocus,
    afterSkip,
    beforeReveal,
    afterReveal: {
      hasJevJudgment: afterReveal.hasJevJudgment,
      hasMarketRisk: afterReveal.hasMarketRisk,
      hasPositionRisk: afterReveal.hasPositionRisk,
      hasPolicyAction: afterReveal.hasPolicyAction,
      hasProbabilityOfProfitDisclaimer:
        afterReveal.hasProbabilityOfProfitDisclaimer,
      overflowX: afterReveal.overflowX,
    },
    triptych,
    screenshot: await screenshot(kpage, `${originName}-desktop-acme-revealed`),
  };

  // Chart alternative + table disclosure
  await kpage.goto(`${origin}/stocks/nova`, { waitUntil: "domcontentloaded" });
  originResult.journeys.chartAlternative = await kpage.evaluate(() => {
    const svg = document.querySelector("svg[role='img']");
    const details = document.querySelector(".data-table-disclosure");
    const table = details?.querySelector("table");
    return {
      svgLabelledBy: svg?.getAttribute("aria-labelledby") || null,
      title: svg?.querySelector("title")?.textContent || null,
      desc: svg?.querySelector("desc")?.textContent || null,
      detailsOpen: details?.open ?? null,
      summary: details?.querySelector("summary")?.textContent?.trim() || null,
      tableCaption: table?.querySelector("caption")?.textContent || null,
      rowCount: table?.querySelectorAll("tbody tr").length ?? 0,
    };
  });
  await kpage.locator(".data-table-disclosure summary").first().click();
  originResult.journeys.chartAlternative.afterOpen = await kpage.evaluate(() => {
    const details = document.querySelector(".data-table-disclosure");
    return {
      open: details?.open ?? null,
      overflowX:
        document.documentElement.scrollWidth - window.innerWidth > 1,
    };
  });

  // Mobile keyboard/nav + overflow across states
  await kpage.setViewportSize({ width: 400, height: 860 });
  const mobileStates = [];
  for (const path of [
    "/",
    "/explore",
    "/stocks/acme",
    "/stocks/orbt",
    "/stocks/heli",
    "/stocks/kite",
    "/portfolio",
    "/scorecard",
    "/methodology",
    "/forecasts/01K2LUMA20POSCORR00001",
  ]) {
    await kpage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    const m = await collectPageMetrics(kpage);
    mobileStates.push({
      path,
      overflowX: m.overflowX,
      scrollWidth: m.scrollWidth,
      clientWidth: m.clientWidth,
      navLabels: m.navLabels,
      smallTargetCount: m.smallTargetCount,
      mains: m.mains,
    });
  }
  originResult.journeys.mobileOverflowSample = mobileStates;
  await kpage.goto(`${origin}/methodology`, { waitUntil: "domcontentloaded" });
  originResult.journeys.mobileMethodologyNav = await kpage.evaluate(() => {
    const nav = document.querySelector(".methodology-nav");
    if (!nav) return null;
    return {
      overflowX: nav.scrollWidth - nav.clientWidth > 1,
      scrollWidth: nav.scrollWidth,
      clientWidth: nav.clientWidth,
      linkBoxes: [...nav.querySelectorAll("a")].map((a) => {
        const r = a.getBoundingClientRect();
        return {
          text: a.textContent.trim(),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }),
    };
  });
  originResult.journeys.mobileMethodologyScreenshot = await screenshot(
    kpage,
    `${originName}-mobile-methodology`,
  );

  // Search empty state
  await kpage.setViewportSize({ width: 1440, height: 1000 });
  await kpage.goto(`${origin}/explore`, { waitUntil: "domcontentloaded" });
  await kpage.locator("#symbol-search").fill("ZZZZ");
  originResult.journeys.searchEmpty = await kpage.locator(".field-hint").innerText().catch(
    () => null,
  );

  await kctx.close();
  originResult.finishedAt = new Date().toISOString();
  return originResult;
}

async function main() {
  await mkdir(join(OUT, "screenshots"), { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const report = {
    generatedAt: new Date().toISOString(),
    chrome: CHROME,
    axe: AXE_PATH,
    local: LOCAL,
    deployed: DEPLOYED,
    origins: [],
  };
  const targets = [];
  if (!process.env.U2_SKIP_LOCAL) targets.push([LOCAL, "local"]);
  if (!process.env.U2_SKIP_DEPLOYED) targets.push([DEPLOYED, "deployed"]);
  for (const [origin, name] of targets) {
    report.origins.push(await auditOrigin(browser, origin, name));
  }
  await browser.close();
  const jsonPath = join(OUT, "audit-raw.json");
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  const summary = {
    generatedAt: report.generatedAt,
    origins: report.origins.map((o) => ({
      name: o.name,
      origin: o.origin,
      health: o.health,
      routeCount: o.routes.length,
      overflow: o.routes
        .filter((r) => r.metrics?.overflowX)
        .map((r) => `${r.viewport} ${r.path}`),
      nestedMains: o.routes
        .filter((r) => r.metrics?.mains?.some((m) => m.parentMain) || (r.metrics?.mains?.length ?? 0) > 1)
        .map((r) => ({
          viewport: r.viewport,
          path: r.path,
          mains: r.metrics.mains,
        })),
      axeViolations: o.routes
        .filter((r) => r.axe?.violationCount)
        .map((r) => ({
          viewport: r.viewport,
          path: r.path,
          count: r.axe.violationCount,
          ids: r.axe.violations.map((v) => `${v.id}:${v.impact}:${v.nodeCount}`),
        })),
      contrastFails: o.routes
        .filter((r) => r.contrast?.length)
        .map((r) => ({
          path: r.path,
          fails: r.contrast.slice(0, 8),
        })),
      smallTargets: o.routes
        .filter((r) => r.viewport === "mobile" && r.metrics?.smallTargetCount)
        .map((r) => ({
          path: r.path,
          count: r.metrics.smallTargetCount,
          samples: r.metrics.smallTargets.slice(0, 8),
        })),
      journeys: {
        skip: o.journeys.keyboardBlindPick?.skipFocus,
        afterSkip: o.journeys.keyboardBlindPick?.afterSkip,
        reveal: o.journeys.keyboardBlindPick?.afterReveal,
        zoomDesktopOverflow: o.journeys.zoom200DesktopAcme?.overflowX,
        zoomMobileOverflow: o.journeys.zoom200MobileNova?.overflowX,
        reducedMotion: o.journeys.reducedMotionLight,
        chart: o.journeys.chartAlternative,
        searchEmpty: o.journeys.searchEmpty,
        mobileOverflow: o.journeys.mobileOverflowSample,
      },
    })),
  };
  await writeFile(join(OUT, "audit-summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`WROTE ${jsonPath}`);
}

await main();
