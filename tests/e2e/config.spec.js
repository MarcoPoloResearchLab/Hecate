// @ts-check

const { test, expect } = require("./coverage-fixture");
const { setupLoggedOutRoutes } = require("./route-helpers");

test.describe("Config — default behavior", () => {
  test("header has base-url set", async ({ page }) => {
    await setupLoggedOutRoutes(page);
    await page.goto("/");

    var baseUrl = await page.locator("mpr-header").getAttribute("base-url");
    expect(baseUrl).toBeTruthy();
  });

  test("mpr-ui bootstrap applies auth attributes from the frontend config", async ({ page }) => {
    await setupLoggedOutRoutes(page, {
      frontendConfig: {
        auth: {
          tauthUrl: "https://tauth.example.test",
          googleClientId: "test-google-client-id",
          tenantId: "crossword",
          loginPath: "/auth/google",
          logoutPath: "/auth/logout",
          noncePath: "/auth/nonce",
        },
      },
    });
    await page.goto("/");

    await expect(page.locator("#app-header")).toHaveAttribute("tauth-url", "https://tauth.example.test");
    await expect(page.locator("#app-header")).toHaveAttribute("google-site-id", "test-google-client-id");
    await expect(page.locator("#app-header")).toHaveAttribute("tauth-tenant-id", "crossword");
  });

  test("mpr-ui bootstrap loads the parser, config loader, and bundle once", async ({ page }) => {
    await setupLoggedOutRoutes(page);
    await page.goto("/");

    await expect.poll(async () => page.evaluate(() => ({
      jsYamlLoads: window.__jsYamlLoads || 0,
      mprUiBundleLoads: window.__mprUiBundleLoads || 0,
      mprUiConfigLoads: window.__mprUiConfigLoads || 0,
    }))).toEqual({
      jsYamlLoads: 1,
      mprUiBundleLoads: 1,
      mprUiConfigLoads: 1,
    });
  });

  test("service-config keeps frontend config on the site origin when apiBaseUrl is set", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent("<!doctype html><html><body><mpr-header id=\"app-header\"></mpr-header></body></html>");
    await page.evaluate(() => {
      window.LLMCrosswordRuntimeConfig = {
        services: {
          apiBaseUrl: "https://llm-crossword-api.mprlab.com",
        },
      };
    });
    await page.addScriptTag({ url: "/js/service-config.js" });

    expect(await page.evaluate(() => window.LLMCrosswordServices.getConfigUrl())).toBe(
      "http://localhost:8111/configs/frontend-config.yml"
    );
  });

  test("committed runtime config keeps split-origin service defaults", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ url: "/js/runtime-auth-config.js" });
    await page.addScriptTag({ url: "/js/service-config.js" });

    expect(await page.evaluate(() => window.LLMCrosswordServices.getConfig())).toEqual({
      apiBaseUrl: "https://llm-crossword-api.mprlab.com",
      authBaseUrl: "https://tauth-api.mprlab.com",
      configUrl: "/configs/frontend-config.yml",
      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",
    });
  });

  test("committed runtime config keeps production paddle defaults", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ url: "/js/runtime-auth-config.js" });

    const billingConfig = await page.evaluate(() => window.LLMCrosswordRuntimeConfig.billing);

    expect(billingConfig.providerCode).toBe("paddle");
    expect(billingConfig.environment).toBe("production");
    expect(billingConfig.clientToken).toMatch(/^live_/);
  });

  test("committed frontend config keeps the production auth host aligned with runtime config", async ({ page }) => {
    await page.goto("/blank.html");

    var configText = await page.evaluate(() =>
      window.fetch("/configs/frontend-config.yml", { cache: "no-store" }).then((response) => response.text())
    );

    expect(configText).toContain('tauthUrl: "https://tauth-api.mprlab.com"');
    expect(configText).not.toContain('tauthUrl: "https://tauth.mprlab.com"');
  });
});

test.describe("Config — fetch failure", () => {
  test("page still works when frontend config fetch fails", async ({ page }) => {
    await setupLoggedOutRoutes(page, {
      extra: {
        "**/configs/frontend-config.yml*": (route) => route.abort("failed"),
      },
    });
    await page.goto("/");

    await expect(page.getByText("Create crossword puzzles with AI")).toBeVisible();
    await page.getByRole("button", { name: "Try a pre-built puzzle" }).click();
    await expect(page.locator("#puzzleView").getByText("Across")).toBeVisible({ timeout: 10000 });
  });
});
