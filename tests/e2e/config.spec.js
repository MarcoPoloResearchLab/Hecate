// @ts-check

const { test, expect } = require("./coverage-fixture");
const { setupLoggedOutRoutes, text } = require("./route-helpers");

test.describe("Config — default behavior", () => {
  test("header has base-url set", async ({ page }) => {
    await setupLoggedOutRoutes(page);
    await page.goto("/");

    var baseUrl = await page.locator("#app-header").getAttribute("base-url");
    expect(baseUrl).toBeTruthy();
  });

  test("mpr-ui bootstrap applies auth attributes from the frontend config", async ({ page }) => {
    await setupLoggedOutRoutes(page, {
      frontendConfig: {
        auth: {
          tauthUrl: "https://tauth.example.test",
          googleClientId: "test-google-client-id",
          tenantId: "hecate",
          loginPath: "/auth/google",
          logoutPath: "/auth/logout",
          noncePath: "/auth/nonce",
        },
      },
    });
    await page.goto("/");

    await expect(page.locator("#app-header")).toHaveAttribute("tauth-url", "https://tauth.example.test");
    await expect(page.locator("#app-header")).toHaveAttribute("google-site-id", "test-google-client-id");
    await expect(page.locator("#app-header")).toHaveAttribute("tauth-tenant-id", "hecate");
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

  test("localhost runtime config is applied before mpr-ui bootstrap", async ({ page }) => {
    await setupLoggedOutRoutes(page, {
      extra: {
        "**/js/runtime-auth-config.js": (route) =>
          route.fulfill(text(200, [
            "(function initRuntimeAuthConfig(globalScope) {",
            '  "use strict";',
            "  var hostname = (globalScope.location && globalScope.location.hostname) || \"\";",
            "  globalScope.HecateRuntimeConfig = Object.freeze(hostname === \"localhost\" ? {",
            "    billing: Object.freeze({",
            '      clientToken: "test_local_token",',
            '      environment: "sandbox",',
            '      providerCode: "paddle",',
            "    }),",
            "    services: Object.freeze({",
            '      apiBaseUrl: "",',
            '      authBaseUrl: "",',
            '      configUrl: "/configs/localhost-frontend-config.yml",',
            '      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",',
            "    }),",
            "  } : {",
            "    billing: Object.freeze({",
            '      clientToken: "live_hosted_token",',
            '      environment: "production",',
            '      providerCode: "paddle",',
            "    }),",
            "    services: Object.freeze({",
            '      apiBaseUrl: "https://llm-crossword-api.mprlab.com",',
            '      authBaseUrl: "https://tauth-api.mprlab.com",',
            '      configUrl: "/configs/hosted-frontend-config.yml",',
            '      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",',
            "    }),",
            "  });",
            "})(window);",
          ].join("\n"))),
        "**/configs/localhost-frontend-config.yml*": (route) =>
          route.fulfill(text(200, [
            "environments:",
            '  - description: "Local development"',
            "    origins:",
            '      - "http://localhost:8111"',
            "    auth:",
            '      tauthUrl: "https://override-auth.example.test"',
            '      googleClientId: "override-google-client-id"',
            '      tenantId: "hecate"',
            '      loginPath: "/auth/google"',
            '      logoutPath: "/auth/logout"',
            '      noncePath: "/auth/nonce"',
            "    authButton:",
            '      text: "signin_with"',
            '      size: "large"',
            '      theme: "outline"',
            '      shape: "circle"',
          ].join("\n"))),
      },
    });
    await page.goto("/");

    await expect(page.locator("#app-header")).toHaveAttribute("tauth-url", "https://override-auth.example.test");
    await expect(page.locator("#app-header")).toHaveAttribute("google-site-id", "override-google-client-id");
  });

  test("service-config keeps frontend config on the site origin when apiBaseUrl is set", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent("<!doctype html><html><body><mpr-header id=\"app-header\"></mpr-header></body></html>");
    await page.evaluate(() => {
      window.HecateRuntimeConfig = {
        services: {
          apiBaseUrl: "https://llm-crossword-api.mprlab.com",
        },
      };
    });
    await page.addScriptTag({ url: "/js/service-config.js" });

    expect(await page.evaluate(() => window.HecateServices.getConfigUrl())).toBe(
      "http://localhost:8111/configs/frontend-config.yml"
    );
  });

  test("committed runtime config resolves localhost defaults on localhost", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ url: "/js/runtime-auth-config.js" });
    await page.addScriptTag({ url: "/js/service-config.js" });

    expect(await page.evaluate(() => window.HecateServices.getConfig())).toEqual({
      apiBaseUrl: "http://localhost:8111",
      authBaseUrl: "http://localhost:8111",
      configUrl: "/configs/frontend-config.yml",
      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",
    });

    expect(await page.evaluate(() => window.HecateRuntimeConfig.services)).toEqual({
      apiBaseUrl: "",
      authBaseUrl: "",
      configUrl: "/configs/frontend-config.yml",
      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",
    });

    const billingConfig = await page.evaluate(() => window.HecateRuntimeConfig.billing);
    expect(billingConfig.providerCode).toBe("paddle");
    expect(billingConfig.environment).toBe("sandbox");
    expect(billingConfig.clientToken).toMatch(/^test_/);
  });

  test("committed runtime config selects hosted defaults on non-local hosts", async ({ page, request }) => {
    var hostedPageUrl = "http://llm-crossword.mprlab.com/hosted-runtime-config-test";
    var runtimeConfigSource = await request
      .get("http://localhost:8111/js/runtime-auth-config.js")
      .then((response) => response.text());
    var serviceConfigSource = await request
      .get("http://localhost:8111/js/service-config.js")
      .then((response) => response.text());

    await page.route(hostedPageUrl, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: [
          "<!doctype html>",
          "<html>",
          "  <body>",
          '    <mpr-header id="app-header"></mpr-header>',
          '    <script src="/js/runtime-auth-config.js"></script>',
          '    <script src="/js/service-config.js"></script>',
          "  </body>",
          "</html>",
        ].join("\n"),
      })
    );
    await page.route("http://llm-crossword.mprlab.com/js/runtime-auth-config.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: runtimeConfigSource,
      })
    );
    await page.route("http://llm-crossword.mprlab.com/js/service-config.js", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: serviceConfigSource,
      })
    );

    await page.goto(hostedPageUrl);

    expect(await page.evaluate(() => window.HecateRuntimeConfig.services)).toEqual({
      apiBaseUrl: "https://llm-crossword-api.mprlab.com",
      authBaseUrl: "https://tauth-api.mprlab.com",
      configUrl: "/configs/frontend-config.yml",
      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",
    });
    expect(await page.evaluate(() => window.HecateServices.getConfig())).toEqual({
      apiBaseUrl: "https://llm-crossword-api.mprlab.com",
      authBaseUrl: "https://tauth-api.mprlab.com",
      configUrl: "/configs/frontend-config.yml",
      tauthScriptUrl: "https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js",
    });
    expect(await page.evaluate(() => window.HecateRuntimeConfig.billing.providerCode)).toBe("paddle");
    expect(await page.evaluate(() => window.HecateRuntimeConfig.billing.environment)).toBe("production");
    expect(await page.evaluate(() => window.HecateRuntimeConfig.billing.clientToken)).toMatch(/^live_/);
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

    await expect(page.getByText("Create crosswords and word searches with AI")).toBeVisible();
    await page.getByRole("button", { name: "Try a sample puzzle" }).click();
    await expect(page.locator("#puzzleView").getByText("Across")).toBeVisible({ timeout: 10000 });
  });
});
