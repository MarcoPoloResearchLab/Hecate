// Shared Playwright route helpers — replaces the old __testOverrides shim.
//
// These use page.route() to intercept at the network level, so tests exercise
// the real window.fetch (including credentials: "include") rather than a
// monkey-patched wrapper.  If app code ever drops credentials or changes the
// /me check, the tests will notice.

const fs = require("fs");
const path = require("path");

const defaultPuzzles = [
  {
    title: "Moon Signals",
    subtitle: "A compact lunar crossword to start Hecate.",
    puzzle_type: "crossword",
    layout_seed: "route-helper-practice-moon-signals",
    layout_version: 1,
    items: [
      { word: "orbit", definition: "Path around Earth", hint: "elliptical route" },
      { word: "mare", definition: "A lunar sea", hint: "shares name with horse" },
      { word: "tides", definition: "Ocean rise-and-fall", hint: "regular shoreline shifts" },
      { word: "lunar", definition: "Relating to the Moon", hint: "companion" },
      { word: "apollo", definition: "Program to the Moon", hint: "Saturn V" },
    ],
  },
];

const defaultSession = Object.freeze({
  user_id: "user-123",
  email: "user@example.com",
  display: "Test User",
  avatar_url: "",
  roles: ["member"],
  expires: 4102444800,
  is_admin: false,
});

const appShellHtml = `<!doctype html>
<html>
  <body>
    <section id="landingPage">
      <button id="landingTypeCrossword" type="button" data-landing-puzzle-type data-puzzle-type="crossword" aria-pressed="true">Crossword</button>
      <button id="landingTypeWordSearch" type="button" data-landing-puzzle-type data-puzzle-type="word_search" aria-pressed="false">Word Search</button>
      <button id="landingTryPrebuilt" type="button">Try a sample puzzle</button>
      <button id="landingSignIn" type="button">Sign in to generate</button>
    </section>
    <span id="headerCreditBadge" style="display:none;"></span>
    <div id="puzzleView" style="display:none;">
      <div id="puzzleSidebar">
        <div id="newPuzzleCard" role="button" tabindex="0">New Puzzle</div>
        <div id="puzzleCardList"></div>
      </div>
      <button id="puzzleSidebarToggle" type="button"><span class="puzzle-sidebar__toggle-icon"></span></button>
      <div class="hdr">
        <div class="hdr__copy">
          <h1 id="title">Crossword Puzzle</h1>
          <div id="subtitle">Loading...</div>
        </div>
      </div>
      <div id="generatePanel" style="display:none;">
        <button id="generateTypeCrossword" type="button" data-generate-puzzle-type data-puzzle-type="crossword" aria-pressed="true">Crossword</button>
        <button id="generateTypeWordSearch" type="button" data-generate-puzzle-type data-puzzle-type="word_search" aria-pressed="false">Word Search</button>
        <input id="topicInput" type="text">
        <select id="wordCount">
          <option value="5">5</option>
          <option value="8" selected>8</option>
        </select>
        <button id="generateBtn" type="button">Generate</button>
        <div id="generateStatus"></div>
      </div>
      <div class="pane">
        <div id="gridViewport"><div id="grid"></div></div>
        <div class="clues">
          <div id="puzzleToolbar">
            <button id="check" type="button">Check</button>
            <button id="reveal" type="button">Reveal</button>
          </div>
          <div id="descriptionPanel" hidden>
            <p id="descriptionContent" hidden></p>
          </div>
          <div id="crosswordCluePanel">
            <ol id="across"></ol>
            <ol id="down"></ol>
          </div>
          <div id="wordSearchPanel" hidden>
            <div id="wordSearchProgress"></div>
            <div id="wordSearchHint"></div>
            <div id="wordSearchList"></div>
          </div>
        </div>
      </div>
      <div class="controls">
        <div id="status"></div>
        <div id="errorBox"></div>
        <div id="rewardStrip" hidden>
          <span id="rewardStripLabel"></span>
          <span id="rewardStripMeta"></span>
        </div>
        <button id="shareBtn" type="button" disabled>Share</button>
        <p id="shareHint" hidden></p>
      </div>
    </div>
    <dialog id="completionModal">
      <h2 id="completionTitle">Puzzle complete</h2>
      <p id="completionSummary"></p>
      <div id="completionBreakdown"></div>
      <p id="completionReason"></p>
      <button id="completionCloseButton" type="button">Close</button>
      <button id="completionSecondaryAction" type="button">Keep solving</button>
      <button id="completionPrimaryAction" type="button">Generate another</button>
    </dialog>
  </body>
</html>`;

const mprUiConfigStub = fs.readFileSync(
  path.join(__dirname, "mpr-ui-config.stub.js"),
  "utf8"
);

function json(status, body) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

function text(status, body) {
  return { status, contentType: "text/plain", body };
}

function createBillingSummary(overrides = {}) {
  return {
    client_token: "test_client_token",
    environment: "sandbox",
    provider_code: "paddle",
    balance: null,
    packs: [
      {
        code: "starter",
        credits: 20,
        label: "Starter Pack",
        price_display: "$20.00",
      },
    ],
    activity: [],
    portal_available: false,
    ...(overrides || {}),
  };
}

function createSession(overrides = {}) {
  return {
    ...defaultSession,
    ...(overrides || {}),
  };
}

function createFrontendConfig(overrides = {}) {
  var defaults = {
    description: "Local development",
    origins: ["http://localhost:8111"],
    auth: {
      tauthUrl: "http://localhost:8111",
      googleClientId: "test-google-client-id",
      tenantId: "hecate",
      loginPath: "/auth/google",
      logoutPath: "/auth/logout",
      noncePath: "/auth/nonce",
    },
    authButton: {
      text: "signin_with",
      size: "large",
      theme: "outline",
      shape: "circle",
    },
  };
  var resolvedOverrides = overrides || {};

  return {
    description: typeof resolvedOverrides.description === "string"
      ? resolvedOverrides.description
      : defaults.description,
    origins: Array.isArray(resolvedOverrides.origins)
      ? resolvedOverrides.origins.slice()
      : defaults.origins.slice(),
    auth: {
      ...defaults.auth,
      ...(resolvedOverrides.auth || {}),
    },
    authButton: {
      ...defaults.authButton,
      ...(resolvedOverrides.authButton || {}),
    },
  };
}

function yamlString(value) {
  return JSON.stringify(value == null ? "" : String(value));
}

function createFrontendConfigYaml(overrides = {}) {
  var frontendConfig = createFrontendConfig(overrides);
  var lines = [
    "environments:",
    "  - description: " + yamlString(frontendConfig.description),
    "    origins:",
  ];

  frontendConfig.origins.forEach(function appendOrigin(origin) {
    lines.push("      - " + yamlString(origin));
  });

  lines.push(
    "    auth:",
    "      tauthUrl: " + yamlString(frontendConfig.auth.tauthUrl),
    "      googleClientId: " + yamlString(frontendConfig.auth.googleClientId),
    "      tenantId: " + yamlString(frontendConfig.auth.tenantId),
    "      loginPath: " + yamlString(frontendConfig.auth.loginPath),
    "      logoutPath: " + yamlString(frontendConfig.auth.logoutPath),
    "      noncePath: " + yamlString(frontendConfig.auth.noncePath),
    "    authButton:",
    "      text: " + yamlString(frontendConfig.authButton.text),
    "      size: " + yamlString(frontendConfig.authButton.size),
    "      theme: " + yamlString(frontendConfig.authButton.theme),
    "      shape: " + yamlString(frontendConfig.authButton.shape)
  );

  return lines.join("\n") + "\n";
}

/**
 * Stub common server-side resources that the page loads but which have no
 * real backend in tests.  Without this the browser sends real requests to
 * localhost which fail with net errors, affecting component rendering.
 */
async function setupBaseRoutes(page) {
  await page.route("**/js-yaml*.js", (route) =>
    route.fulfill(text(200, "window.__jsYamlLoads = (window.__jsYamlLoads || 0) + 1;"))
  );
  await page.route("**/bootstrap-icons.min.css", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/css",
      body: "/* bootstrap-icons stub */",
    })
  );
  await page.route("**/mpr-ui.css", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/css",
      body: "/* mpr-ui css stub */",
    })
  );
  await page.route("**/gsi/client", (route) =>
    route.fulfill(text(200, "window.google = window.google || {};"))
  );
  // tauth.js is loaded from the pinned CDN in index.html during tests.
  await page.route("**/tauth.js", (route) =>
    route.fulfill(text(200, "/* tauth stub */"))
  );
  await page.route("**/auth/refresh", (route) =>
    route.fulfill(json(401, { error: "unauthorized" }))
  );
  // /api/session may be called by admin.js — return 401 by default.
  await page.route("**/api/session", (route) =>
    route.fulfill(json(401, { error: "unauthorized" }))
  );
  // Stub mpr-ui-config.js so it doesn't fetch the CDN bundle.
  await page.route("**/mpr-ui-config.js", (route) =>
    route.fulfill(text(200, "window.__mprUiConfigLoads = (window.__mprUiConfigLoads || 0) + 1;\n" + mprUiConfigStub))
  );
  await page.route("**/mpr-ui.js", (route) =>
    route.fulfill(text(200, "window.__mprUiBundleLoads = (window.__mprUiBundleLoads || 0) + 1;"))
  );
  await page.route("**/api/billing/summary", (route) =>
    route.fulfill(json(200, createBillingSummary()))
  );
  await page.route("**/api/billing/sync", (route) =>
    route.fulfill(json(200, { ok: true }))
  );
  await page.route("**/api/billing/checkout", (route) =>
    route.fulfill(json(503, { message: "billing unavailable" }))
  );
  await page.route("**/api/billing/portal", (route) =>
    route.fulfill(json(503, { message: "billing unavailable" }))
  );
  await page.route("**/config.yml*", (route) =>
    route.fulfill(text(200, "administrators: []\n"))
  );
  await page.route("**/configs/frontend-config.yml*", (route) =>
    route.fulfill(text(200, createFrontendConfigYaml()))
  );
}

/**
 * Set up page.route() mocks for a logged-in user.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object}  [opts]
 * @param {number}  [opts.coins=15]          — credit balance
 * @param {number}  [opts.generationCostCoins=4] — generation cost reflected by the backend
 * @param {Array}   [opts.puzzles]           — puzzle payload (defaults to defaultPuzzles)
 * @param {object}  [opts.frontendConfig]    — frontend config YAML environment payload
 * @param {string}  [opts.configYaml]        — optional backend config YAML stub
 * @param {Record<string, (route: import('@playwright/test').Route) => void>} [opts.extra]
 *        — additional route overrides keyed by URL glob
 */
async function setupLoggedInRoutes(page, opts = {}) {
  var coins = opts.coins != null ? opts.coins : 15;
  var generationCostCoins = opts.generationCostCoins != null ? opts.generationCostCoins : 4;
  var puzzles = opts.puzzles || defaultPuzzles;
  var ownedPuzzles = opts.ownedPuzzles || [];
  var session = createSession(opts.session);
  var frontendConfigYaml = createFrontendConfigYaml(opts.frontendConfig);

  await setupBaseRoutes(page);
  await page.unroute("**/auth/refresh");
  await page.route("**/auth/refresh", (route) =>
    route.fulfill(json(200, { ok: true }))
  );
  // Override the default 401 /api/session with the provided session data.
  await page.unroute("**/api/session");
  await page.route("**/api/session", (route) =>
    route.fulfill(json(200, session))
  );
  await page.route("**/me", (route) => route.fulfill(json(200, {})));
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill(json(200, {
      balance: {
        coins,
        generation_cost_coins: generationCostCoins,
      },
      grants: { bootstrap_coins: 0, daily_login_coins: 0, low_balance_coins: 0 },
    }))
  );
  await page.route("**/api/puzzles", (route) =>
    route.fulfill(json(200, { puzzles: ownedPuzzles }))
  );
  await page.unroute("**/configs/frontend-config.yml*");
  await page.route("**/configs/frontend-config.yml*", (route) =>
    route.fulfill(text(200, frontendConfigYaml))
  );
  if (typeof opts.configYaml === "string") {
    await page.unroute("**/config.yml*");
    await page.route("**/config.yml*", (route) =>
      route.fulfill(text(200, opts.configYaml))
    );
  }
  await page.route("**/assets/data/puzzles.json", (route) =>
    route.fulfill(json(200, puzzles))
  );
  await page.route("**/crosswords.json", (route) =>
    route.fulfill(json(200, puzzles))
  );

  if (opts.extra) {
    for (var pattern of Object.keys(opts.extra)) {
      await page.route(pattern, opts.extra[pattern]);
    }
  }
}

/**
 * Set up page.route() mocks for a logged-out user.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object}  [opts]
 * @param {number}  [opts.meStatus=401]      — status code for /me
 * @param {Array}   [opts.puzzles]           — puzzle payload
 * @param {object}  [opts.frontendConfig]    — frontend config YAML environment payload
 * @param {string}  [opts.configYaml]        — optional backend config YAML stub
 * @param {Record<string, (route: import('@playwright/test').Route) => void>} [opts.extra]
 */
async function setupLoggedOutRoutes(page, opts = {}) {
  var meStatus = opts.meStatus || 401;
  var puzzles = opts.puzzles || defaultPuzzles;
  var frontendConfigYaml = createFrontendConfigYaml(opts.frontendConfig);

  await setupBaseRoutes(page);
  await page.route("**/me", (route) =>
    route.fulfill(json(meStatus, { error: "unauthorized" }))
  );
  await page.unroute("**/configs/frontend-config.yml*");
  await page.route("**/configs/frontend-config.yml*", (route) =>
    route.fulfill(text(200, frontendConfigYaml))
  );
  if (typeof opts.configYaml === "string") {
    await page.unroute("**/config.yml*");
    await page.route("**/config.yml*", (route) =>
      route.fulfill(text(200, opts.configYaml))
    );
  }
  await page.route("**/assets/data/puzzles.json", (route) =>
    route.fulfill(json(200, puzzles))
  );
  await page.route("**/crosswords.json", (route) =>
    route.fulfill(json(200, puzzles))
  );

  if (opts.extra) {
    for (var pattern of Object.keys(opts.extra)) {
      await page.route(pattern, opts.extra[pattern]);
    }
  }
}

async function mountAppShell(page) {
  await page.goto("/blank.html");
  await page.setContent(appShellHtml);
}

module.exports = {
  appShellHtml,
  createBillingSummary,
  createFrontendConfig,
  createFrontendConfigYaml,
  createSession,
  defaultPuzzles,
  defaultSession,
  json,
  mountAppShell,
  text,
  setupLoggedInRoutes,
  setupLoggedOutRoutes,
};
