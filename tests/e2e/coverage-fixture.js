const { test: base, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const NYC_OUTPUT = path.join(__dirname, "../../.nyc_output");
const NETWORK_IO_SUSPENDED_CODE = "ERR_NETWORK_IO_SUSPENDED";

const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const originalGoto = page.goto.bind(page);
    const originalReload = page.reload.bind(page);

    function withDefaultWaitUntil(options) {
      if (options && Object.prototype.hasOwnProperty.call(options, "waitUntil")) {
        return options;
      }

      return {
        ...(options || {}),
        waitUntil: "domcontentloaded",
      };
    }

    async function runNavigationWithRetry(navigate) {
      try {
        return await navigate();
      } catch (error) {
        if (!(error instanceof Error) || !String(error.message || "").includes(NETWORK_IO_SUSPENDED_CODE)) {
          throw error;
        }
        return navigate();
      }
    }

    page.goto = (url, options) => {
      return runNavigationWithRetry(() => originalGoto(url, withDefaultWaitUntil(options)));
    };
    page.reload = (options) => runNavigationWithRetry(() => originalReload(withDefaultWaitUntil(options)));

    await use(page);
    // Collect coverage after test
    try {
      const coverage = await page.evaluate(() => window.__coverage__);
      if (coverage) {
        if (!fs.existsSync(NYC_OUTPUT)) fs.mkdirSync(NYC_OUTPUT, { recursive: true });
        const file = path.join(NYC_OUTPUT, `cov-${testInfo.testId}.json`);
        fs.writeFileSync(file, JSON.stringify(coverage));
      }
    } catch (_) {}
  },
});

module.exports = { test, expect };
