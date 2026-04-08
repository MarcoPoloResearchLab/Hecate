// @ts-check

const { test, expect } = require("./coverage-fixture");
const { createBillingSummary, json, setupLoggedInRoutes, setupLoggedOutRoutes } = require("./route-helpers");

async function stubPaddleCheckout(page) {
  await page.route("**/cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.__paddleCalls = {
          environment: [],
          initialize: null,
          opens: [],
        };
        window.__emitPaddleEvent = function (name, detail) {
          var eventData = Object.assign({ name: name }, detail || {});
          if (
            window.__paddleCalls.initialize &&
            typeof window.__paddleCalls.initialize.eventCallback === "function"
          ) {
            window.__paddleCalls.initialize.eventCallback(eventData);
          }
        };
        window.Paddle = {
          Environment: {
            set: function (value) {
              window.__paddleCalls.environment.push(value);
            }
          },
          Initialize: function (options) {
            window.__paddleCalls.initialize = options;
          },
          Checkout: {
            open: function (options) {
              window.__paddleCalls.opens.push(options);
            }
          }
        };
      `,
      status: 200,
    })
  );
}

function buildEnabledBillingSummary(overrides = {}) {
  return createBillingSummary({
    provider_code: "paddle",
    balance: { coins: 2 },
    packs: [
      {
        code: "starter",
        credits: 20,
        label: "Starter Pack",
        price_display: "$20.00",
      },
      {
        code: "creator",
        credits: 60,
        label: "Creator Pack",
        price_display: "$54.00",
      },
    ],
    activity: [
      {
        event_id: "evt_credited",
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

test.describe("Billing UI", () => {
  test("insufficient-credits CTA opens billing with packs and activity", async ({ page }) => {
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/summary": (route) =>
          route.fulfill(json(200, buildEnabledBillingSummary())),
      },
    });

    await page.goto("/");
    await expect(page.locator("#puzzleView")).toBeVisible({ timeout: 5000 });

    await page.locator("#newCrosswordCard").click();
    await expect(page.locator("#generateBuyCreditsButton")).toBeVisible({ timeout: 5000 });

    await page.locator("#generateBuyCreditsButton").click();

    await expect(page.locator("#settingsDrawer")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#settingsBillingBalanceValue")).toContainText("2 credits");
    await expect(page.locator("#settingsBillingPackList")).toContainText("Starter Pack");
    await expect(page.locator("#settingsBillingActivityList")).toContainText("Starter Pack credited 20 credits.");
    await expect(page.locator("#settingsManageBillingButton")).toBeVisible();
  });

  test("checkout overlay opens and refreshes the balance after completion", async ({ page }) => {
    var checkoutCompleted = false;
    var pendingSummary = buildEnabledBillingSummary({
      activity: [
        {
          event_id: "evt_created",
          event_type: "transaction.created",
          transaction_id: "txn_return",
          pack_code: "starter",
          credits_delta: 0,
          status: "ready",
          summary: "Checkout created.",
          occurred_at: "2026-03-28T18:31:00Z",
        },
      ],
    });
    var completedSummary = buildEnabledBillingSummary({
      balance: { coins: 22 },
      activity: [
        {
          event_id: "evt_completed",
          event_type: "transaction.completed",
          transaction_id: "txn_overlay",
          pack_code: "starter",
          credits_delta: 20,
          status: "completed",
          summary: "Starter Pack credited 20 credits.",
          occurred_at: "2026-03-28T18:32:00Z",
        },
      ],
    });

    await stubPaddleCheckout(page);
    await setupLoggedInRoutes(page, {
      coins: 2,
      extra: {
        "**/api/billing/checkout/reconcile": (route) => {
          route.fulfill(json(200, {
            provider_code: "paddle",
            transaction_id: "txn_overlay",
            status: checkoutCompleted ? "succeeded" : "pending",
          }));
        },
        "**/api/billing/checkout": (route) =>
          route.fulfill(json(200, {
            checkout_mode: "overlay",
            provider_code: "paddle",
            transaction_id: "txn_overlay",
          })),
        "**/api/billing/summary": (route) => {
          route.fulfill(json(200, checkoutCompleted ? completedSummary : pendingSummary));
        },
      },
    });

    await page.goto("/");

    await expect(page.locator("#puzzleView")).toBeVisible({ timeout: 5000 });
    await page.locator("#newCrosswordCard").click();
    await expect(page.locator("#generateBuyCreditsButton")).toBeVisible({ timeout: 5000 });
    await page.locator("#generateBuyCreditsButton").click();
    await expect(page.locator("#settingsDrawer")).toBeVisible({ timeout: 5000 });
    await page.locator('[data-billing-pack-button="starter"]').click();

    await expect.poll(async () => page.evaluate(() => (
      window.__paddleCalls ? window.__paddleCalls.opens.slice() : null
    ))).toEqual([
      {
        transactionId: "txn_overlay",
      },
    ]);

    checkoutCompleted = true;
    await page.evaluate(() => {
      window.__emitPaddleEvent("checkout.completed", {
        data: { transaction_id: "txn_overlay" },
      });
    });

    await expect(page.locator("#headerCreditBadge")).toContainText("22 credits", { timeout: 12000 });
    await expect(page.locator("#settingsBillingStatus")).toContainText("Payment confirmed", { timeout: 10000 });
  });

  test("anonymous users never see purchase entry points", async ({ page }) => {
    await setupLoggedOutRoutes(page);
    await page.goto("/");

    await expect(page.locator("#headerCreditBadge")).toBeHidden();
    await expect(page.locator("#generateBuyCreditsButton")).toBeHidden();
  });
});
