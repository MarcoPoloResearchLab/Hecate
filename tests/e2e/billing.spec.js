// @ts-check

const { test, expect } = require("./coverage-fixture");
const { createBillingSummary, json, setupLoggedInRoutes } = require("./route-helpers");

async function installVisiblePaddleStub(page) {
  await page.route("**/cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      status: 200,
      body: `
        window.Paddle = {
          Environment: {
            set: function () {}
          },
          Initialize: function () {},
          Checkout: {
            open: function () {
              var existingRoot = document.getElementById("fakePaddleCheckout");
              if (existingRoot) {
                existingRoot.remove();
              }

              var root = document.createElement("div");
              var card = document.createElement("div");

              root.id = "fakePaddleCheckout";
              root.setAttribute("data-provider", "paddle");
              root.style.position = "fixed";
              root.style.inset = "0";
              root.style.display = "flex";
              root.style.alignItems = "center";
              root.style.justifyContent = "center";
              root.style.background = "rgba(2, 6, 23, 0.78)";
              root.style.zIndex = "2147483647";

              card.id = "fakePaddleCheckoutCard";
              card.setAttribute("role", "dialog");
              card.setAttribute("aria-label", "Paddle checkout");
              card.style.width = "min(34rem, calc(100vw - 2rem))";
              card.style.height = "min(42rem, calc(100vh - 2rem))";
              card.style.borderRadius = "20px";
              card.style.background = "rgb(255, 255, 255)";
              card.style.boxShadow = "0 30px 90px rgba(15, 23, 42, 0.35)";

              root.appendChild(card);
              document.body.appendChild(root);
            }
          }
        };
      `,
    })
  );
}

async function captureWindowOpen(page, options) {
  var returnNull = options && options.returnNull === true;

  await page.addInitScript((config) => {
    window.__openedUrls = [];
    window.open = function (url) {
      window.__openedUrls.push(typeof url === "string" ? url : String(url || ""));
      if (config && config.returnNull === true) {
        return null;
      }
      return {
        focus: function () {},
      };
    };
  }, { returnNull: returnNull });
}

function buildEnabledBillingSummary(overrides) {
  return createBillingSummary({
    provider_code: "paddle",
    balance: { coins: 2 },
    packs: [
      {
        code: "starter",
        credits: 200,
        label: "Starter Pack",
        price_display: "$20.00",
      },
      {
        code: "creator",
        credits: 600,
        label: "Creator Pack",
        price_display: "$54.00",
      },
      {
        code: "publisher",
        credits: 1400,
        label: "Publisher Pack",
        price_display: "$119.00",
      },
    ],
    activity: [
      {
        event_id: "evt_completed",
        event_type: "transaction.completed",
        transaction_id: "txn_paid",
        pack_code: "starter",
        credits_delta: 20,
        status: "completed",
        summary: "Starter Pack credited 20 credits.",
        occurred_at: "2026-03-28T18:30:00Z",
      },
    ],
    portal_available: true,
    ...(overrides || {}),
  });
}

async function openBillingFromInsufficientCredits(page) {
  await page.goto("/");
  await expect(page.locator("#puzzleView")).toBeVisible({ timeout: 5000 });
  await page.locator("#newCrosswordCard").click();
  await expect(page.locator("#generateBuyCreditsButton")).toBeVisible({ timeout: 5000 });
  await page.locator("#generateBuyCreditsButton").click();
  await expect(page.locator("#settingsDrawer")).toBeVisible({ timeout: 5000 });
}

test.describe("Billing parity with PoodleScanner contracts", () => {
  test("insufficient-credits CTA opens billing with packs and activity", async ({ page }) => {
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary())),
      },
    });

    await openBillingFromInsufficientCredits(page);

    await expect(page.locator("#settingsBillingBalanceValue")).toContainText("2 credits");
    await expect(page.locator("#settingsBillingPackList")).toContainText("Starter Pack");
    await expect(page.locator("#settingsBillingActivityList")).toContainText("Starter Pack credited 20 credits.");
  });

  test("pack checkout posts normalized pack code and requests provider checkout", async ({ page }) => {
    var requestedPackCode = "";

    await installVisiblePaddleStub(page);
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary())),
        "**/api/billing/checkout": async (route) => {
          var payload = {};
          try {
            payload = JSON.parse(route.request().postData() || "{}");
          } catch (error) {
            payload = {};
          }
          requestedPackCode = typeof payload.pack_code === "string" ? payload.pack_code : "";
          await route.fulfill(json(200, {
            checkout_mode: "overlay",
            provider_code: "paddle",
            transaction_id: "txn_overlay",
          }));
        },
      },
    });

    await openBillingFromInsufficientCredits(page);
    await page.locator('[data-billing-pack-button="starter"]').click();

    await expect.poll(async () => requestedPackCode).toBe("starter");
    await expect(page.locator("#fakePaddleCheckout")).toBeAttached({ timeout: 5000 });
  });

  test("pack checkout failure surfaces backend message", async ({ page }) => {
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary())),
        "**/api/billing/checkout": (route) =>
          route.fulfill(json(409, { error: "Pack checkout failed." })),
      },
    });

    await openBillingFromInsufficientCredits(page);
    await page.locator('[data-billing-pack-button="starter"]').click();

    await expect(page.locator("#settingsBillingStatus")).toContainText("Pack checkout failed.", { timeout: 5000 });
  });

  test("billing summary load failure surfaces backend message", async ({ page }) => {
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(503, { error: "Billing summary unavailable." })),
      },
    });

    await openBillingFromInsufficientCredits(page);

    await expect(page.locator("#settingsBillingStatus")).toContainText("Billing summary unavailable.", { timeout: 5000 });
  });

  test("billing activity renders below packs and includes manual credit grants", async ({ page }) => {
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary({
            activity: [
              {
                event_id: "evt_manual_credit",
                event_type: "manual.credit",
                transaction_id: "",
                pack_code: "",
                credits_delta: 12,
                status: "completed",
                summary: "Manual grant credited 12 credits.",
                occurred_at: "2026-03-28T18:35:00Z",
              },
            ],
          }))),
      },
    });

    await openBillingFromInsufficientCredits(page);

    await expect(page.locator("#settingsBillingActivityList")).toContainText("Manual grant credited 12 credits.");

    var packListBox = await page.locator("#settingsBillingPackList").boundingBox();
    var activityListBox = await page.locator("#settingsBillingActivityList").boundingBox();

    expect(packListBox).not.toBeNull();
    expect(activityListBox).not.toBeNull();
    expect(activityListBox.y).toBeGreaterThan(packListBox.y + packListBox.height - 1);
  });

  test("billing portal opens customer portal URL", async ({ page }) => {
    await captureWindowOpen(page, { returnNull: false });
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary({ portal_available: true }))),
        "**/api/billing/portal": (route) =>
          route.fulfill(json(200, {
            provider_code: "paddle",
            url: "https://billing.example.test/portal",
          })),
      },
    });

    await openBillingFromInsufficientCredits(page);
    await page.locator("#settingsManageBillingButton").click();

    await expect.poll(async () => page.evaluate(() => window.__openedUrls || [])).toEqual([
      "https://billing.example.test/portal",
    ]);
  });

  test("billing portal falls back to location navigation when popup is blocked", async ({ page }) => {
    await captureWindowOpen(page, { returnNull: true });
    await page.route("https://billing.example.test/portal", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Portal</body></html>",
      })
    );
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary({ portal_available: true }))),
        "**/api/billing/portal": (route) =>
          route.fulfill(json(200, {
            provider_code: "paddle",
            url: "https://billing.example.test/portal",
          })),
      },
    });

    await openBillingFromInsufficientCredits(page);
    await page.locator("#settingsManageBillingButton").click();

    await expect(page).toHaveURL("https://billing.example.test/portal");
  });

  test("credit-pack purchase renders Paddle checkout on screen above the settings drawer", async ({ page }) => {
    await installVisiblePaddleStub(page);
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary())),
        "**/api/billing/checkout": (route) =>
          route.fulfill(json(200, {
            checkout_mode: "overlay",
            provider_code: "paddle",
            transaction_id: "txn_overlay",
          })),
      },
    });

    await openBillingFromInsufficientCredits(page);
    await page.locator('[data-billing-pack-button="starter"]').click();
    await expect(page.locator("#fakePaddleCheckout")).toBeAttached({ timeout: 5000 });

    var visibility = await page.evaluate(() => {
      var overlayRoot = document.getElementById("fakePaddleCheckout");
      var overlayCard = document.getElementById("fakePaddleCheckoutCard");
      var cardRect;
      var probeX;
      var probeY;
      var topElement;

      if (!overlayRoot || !overlayCard) {
        return {
          overlayAttached: false,
          overlayOwnsCenterPoint: false,
          topElementId: "",
          topElementTag: "",
        };
      }

      cardRect = overlayCard.getBoundingClientRect();
      probeX = cardRect.left + (cardRect.width / 2);
      probeY = cardRect.top + (cardRect.height / 2);
      topElement = document.elementFromPoint(probeX, probeY);

      return {
        overlayAttached: true,
        overlayOwnsCenterPoint: Boolean(
          topElement &&
          (topElement === overlayCard || overlayCard.contains(topElement) || overlayRoot.contains(topElement))
        ),
        topElementId: topElement && topElement.id ? topElement.id : "",
        topElementTag: topElement && topElement.tagName ? topElement.tagName.toLowerCase() : "",
      };
    });

    expect(visibility.overlayAttached).toBe(true);
    expect(visibility.overlayOwnsCenterPoint).toBe(true);
  });
});
