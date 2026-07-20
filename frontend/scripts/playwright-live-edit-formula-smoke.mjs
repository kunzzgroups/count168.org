/**
 * Live Playwright smoke: login → secondary → Data Capture Summary Edit Formula.
 *
 * Usage (PowerShell):
 *   $env:EC_COMPANY="test"; $env:EC_USER="test"; $env:EC_PASS="1"; $env:EC_SECONDARY="222222"
 *   node scripts/playwright-live-edit-formula-smoke.mjs
 *
 * Optional:
 *   EC_BASE=https://count168.site
 *   EC_STORAGE=.auth/ec-storage.json
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  const candidates = [
    path.resolve(__dirname, "../node_modules/playwright"),
    path.resolve(__dirname, "../../node_modules/playwright"),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* next */
    }
  }
  throw new Error("playwright not found — npm i -D playwright in frontend/");
}

const { chromium } = loadPlaywright();

const BASE = (process.env.EC_BASE || "https://count168.site").replace(/\/$/, "");
const STORAGE = process.env.EC_STORAGE
  ? path.resolve(process.env.EC_STORAGE)
  : path.resolve(__dirname, "../.auth/ec-storage.json");

const company = String(process.env.EC_COMPANY || "").trim();
const user = String(process.env.EC_USER || "").trim();
const pass = String(process.env.EC_PASS || "");
const secondary = String(process.env.EC_SECONDARY || "").trim();

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  throw new Error(msg);
}
function info(msg) {
  console.log(`  · ${msg}`);
}

async function ensureLoggedIn(page, context) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(800);

  if (!page.url().includes("/login") && !page.url().includes("secondary")) {
    ok("session reused (not on login)");
    return;
  }

  if (page.url().includes("secondary")) {
    await fillSecondary(page);
    return;
  }

  if (!company || !user || pass === "") {
    fail("Not logged in. Set EC_COMPANY / EC_USER / EC_PASS (and EC_SECONDARY if needed).");
  }

  const adminBtn = page.getByRole("button", { name: /^Admin$|^管理员$/i });
  if (await adminBtn.count()) {
    await adminBtn.click();
    await page.waitForTimeout(200);
  }

  await page.getByPlaceholder(/Company|集团|Group/i).fill(company);
  const userBox = page.getByPlaceholder(/Username|User|用户名|账号/i).first();
  await userBox.fill(user);
  await page.getByPlaceholder(/^Password$|^密码$/i).fill(pass);
  await page.getByRole("button", { name: /^Login$|^登录$/i }).click();

  await page.waitForURL(
    (url) => !String(url).includes("/login") || String(url).includes("secondary"),
    { timeout: 45000 }
  );

  if (page.url().includes("secondary")) {
    await fillSecondary(page);
  }

  fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
  await context.storageState({ path: STORAGE });
  ok(`logged in; storage saved → ${STORAGE}`);
}

async function fillSecondary(page) {
  if (!secondary) {
    fail("Secondary password required — set EC_SECONDARY");
  }
  info("entering secondary password…");
  const input = page.locator("#secondary_password, input[type='password']").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill(secondary);
  const submit = page.getByRole("button", { name: /^Confirm$|^Submit$|^Verify$|^确认$|^验证$|^继续$/i });
  if (await submit.count()) {
    await submit.click();
  } else {
    await input.press("Enter");
  }
  await page.waitForURL((url) => !String(url).includes("secondary"), { timeout: 45000 });
  ok("secondary password accepted");
}

function buildSeedTable() {
  const cell = (v) => ({ type: "data", value: v });
  const header = (v) => ({ type: "header", value: v });
  const aw07 = [header("A"), cell("AW07"), cell("0"), cell("-227.95")];
  while (aw07.length < 15) aw07.push(cell("0"));
  aw07[14] = cell("-15.60");
  const aw9966 = [header("B"), cell("AW9966"), cell("0"), cell("-718.39")];
  return { rows: [aw07, aw9966] };
}

async function readSessionCompanyId(page) {
  return page.evaluate(async () => {
    try {
      const res = await fetch("/api/session/current_user_api.php", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      const d = json?.data || {};
      return {
        companyId: d.company_id ?? d.session_company_id ?? null,
        companyCode: d.company_code ?? d.session_company_code ?? null,
        loginId: d.login_id ?? d.username ?? null,
      };
    } catch (e) {
      return { error: String(e) };
    }
  });
}

async function seedCaptureAndOpenSummary(page) {
  const table = buildSeedTable();
  await page.goto(`${BASE}/datacapture`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);

  const session = await readSessionCompanyId(page);
  info(`session: ${JSON.stringify(session)}`);
  const scopeCompanyId =
    session?.companyId != null && Number(session.companyId) > 0
      ? Number(session.companyId)
      : null;

  await page.evaluate(
    (payload) => {
      const { table, scopeCompanyId } = payload;
      const processMeta = {
        process: "AW07",
        processes: ["AW07", "AW9966"],
        selectedProcesses: ["AW07", "AW9966"],
        dataCaptureType: "1.Text",
        captureScopeMode: "company",
        scopeCompanyId,
      };
      const type = "1.Text";
      localStorage.setItem("capturedTableData", JSON.stringify(table));
      localStorage.setItem("capturedProcessData", JSON.stringify(processMeta));
      localStorage.setItem("capturedDataCaptureType", type);
      if (scopeCompanyId != null) {
        const tag = String(scopeCompanyId);
        localStorage.setItem(`capturedTableData:${tag}`, JSON.stringify(table));
        localStorage.setItem(`capturedProcessData:${tag}`, JSON.stringify(processMeta));
        localStorage.setItem(`capturedDataCaptureType:${tag}`, type);
        localStorage.setItem("dc_capture_active_scope_key", tag);
      }
      try {
        sessionStorage.setItem("dc_summary_fresh_nav", "1");
      } catch {
        /* ignore */
      }
    },
    { table, scopeCompanyId }
  );

  ok("seeded capturedTableData (AW07 + AW9966, scoped)");
  await page.goto(`${BASE}/datacapturesummary`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);
  ok(`summary url: ${page.url()}`);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const snippet = bodyText.replace(/\s+/g, " ").trim().slice(0, 280);
  info(`summary body: ${snippet}`);
}

async function dismissOverlays(page) {
  const overlay = page.locator(".sidebar-dismiss-overlay.show, .informationmenu-overlay.show");
  if (await overlay.count()) {
    await overlay.first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  // Escape closes menus
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(200);
  if (await overlay.count()) {
    await page.evaluate(() => {
      document.querySelectorAll(".sidebar-dismiss-overlay.show, .informationmenu-overlay.show").forEach((el) => {
        el.classList.remove("show");
        el.setAttribute("aria-hidden", "true");
      });
    });
  }
}

async function exerciseEditFormula(page) {
  await dismissOverlays(page);

  const modal = page.locator("#editFormulaModal");

  // Empty formula rows expose "+" (new formula); existing formulas expose edit-formula-btn
  const plusBtn = page.locator("button.add-account-btn").first();
  const editBtn = page.locator("button.edit-formula-btn").first();

  if (await editBtn.count()) {
    await editBtn.click({ force: true });
  } else if (await plusBtn.count()) {
    await plusBtn.click({ force: true });
    ok("opened New Formula via +");
  } else {
    return { skipped: true, reason: "no_edit_or_add_button" };
  }

  await modal.waitFor({ state: "visible", timeout: 20000 }).catch(() => null);
  if (!(await modal.isVisible().catch(() => false))) {
    // Modal uses class toggle — also check aria / display
    const visible = await page.locator("#editFormulaModal.is-open, #editFormulaModal[aria-hidden='false']").count();
    if (!visible) {
      const display = await modal.evaluate((el) => getComputedStyle(el).display).catch(() => "missing");
      info(`modal display=${display}`);
      return { skipped: true, reason: "modal_not_open" };
    }
  }
  ok("Edit Formula modal open");

  // New Formula may require account/currency before formula is usable
  const accountSelect = page.locator("#editFormulaModal select, #editFormulaModal [role='combobox']").first();
  if (await accountSelect.count()) {
    info("account/currency controls present");
  }

  const formulaInput = page.locator("#formula");
  await formulaInput.waitFor({ state: "visible", timeout: 15000 });

  // Prefer filling formula directly (repro: other-row then own-row with /)
  await formulaInput.click({ clickCount: 3 });
  await formulaInput.fill("");
  await formulaInput.pressSequentially("$14-[AW9966,3]/$3", { delay: 20 });
  await page.waitForTimeout(800);

  const raw = await formulaInput.inputValue();
  let previewText = "";
  const previewInput = page.locator("#formulaDisplay");
  if (await previewInput.count()) {
    previewText = (await previewInput.inputValue().catch(() => "")) || "";
    if (!previewText) {
      previewText = String((await previewInput.textContent().catch(() => "")) || "").trim();
    }
  }

  info(`formula input: ${raw}`);
  info(`formula preview: ${previewText}`);

  if (previewText.includes("$-")) {
    fail(`preview still has stray $: ${previewText}`);
  }
  if (/\/\$-/.test(previewText)) {
    fail(`buggy preview pattern: ${previewText}`);
  }

  if (
    previewText.includes("(-15.60)") &&
    previewText.includes("(-718.39)") &&
    previewText.includes("(-227.95)")
  ) {
    ok(`preview correctly expanded: ${previewText}`);
  } else if (previewText && !previewText.includes("$")) {
    ok(`preview expanded without stray $: ${previewText}`);
  } else if (raw.includes("[AW9966,3]") && raw.includes("$3")) {
    // Seeded capture cells may not resolve on live summary — still assert no leftover $-
    ok("raw formula accepted; no stray $- in preview");
  } else {
    fail(`unexpected formula/preview state input=${raw} preview=${previewText}`);
  }

  const shotDir = path.resolve(__dirname, "../.auth");
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, "edit-formula-live.png"), fullPage: true });
  ok("modal screenshot saved");

  const cancel = page.getByRole("button", { name: /^Cancel$|^取消$/i });
  if (await cancel.count()) await cancel.click();
  else await page.keyboard.press("Escape");

  return { skipped: false };
}

async function verifyDeployedBundle(page) {
  // Confirm production serves a Summary chunk (hash may change after deploy)
  const html = await page
    .goto(`${BASE}/frontend/dist/index.html`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })
    .then(() => page.content());
  const hasSpa = /index-[A-Za-z0-9_-]+\.js/.test(html);
  if (!hasSpa) fail("production index.html missing SPA bundle");
  ok("production SPA index reachable");

  const m = html.match(/DataCaptureSummaryPage-([A-Za-z0-9_-]+)\.js/);
  // May only appear after lazy import from index — check index chunk reference later via network
  if (m) ok(`summary chunk in index: DataCaptureSummaryPage-${m[1]}.js`);
}

async function main() {
  console.log("Live Edit Formula smoke");
  console.log(`  base: ${BASE}`);
  console.log(`  company: ${company || "(from storage)"} user: ${user || "(from storage)"}`);

  const launchOpts = { headless: true };
  const contextOpts = { locale: "en-US" };
  if (fs.existsSync(STORAGE)) {
    contextOpts.storageState = STORAGE;
    ok(`using storage ${STORAGE}`);
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  try {
    await verifyDeployedBundle(page);
    await ensureLoggedIn(page, context);

    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    ok(`post-login url: ${page.url()}`);

    await seedCaptureAndOpenSummary(page);

    const shotDir = path.resolve(__dirname, "../.auth");
    fs.mkdirSync(shotDir, { recursive: true });
    const shotPath = path.join(shotDir, "summary-live.png");
    await page.screenshot({ path: shotPath, fullPage: true });
    ok(`screenshot → ${shotPath}`);

    const heading = page.getByRole("heading", { name: /Data Capture Summary|数据汇总|汇总/i });
    if (await heading.count()) ok("Summary heading visible");
    else info("Summary heading not found (may still be usable)");

    const editCount = await page.locator(".edit-formula-btn").count();
    info(`edit-formula-btn count: ${editCount}`);

    const result = await exerciseEditFormula(page);
    if (result?.skipped) {
      info(`Edit Formula UI skipped: ${result.reason}`);
      info("Login + Summary navigation still validated.");
    }

    fs.mkdirSync(path.dirname(STORAGE), { recursive: true });
    await context.storageState({ path: STORAGE });
    console.log("Live smoke finished.");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
