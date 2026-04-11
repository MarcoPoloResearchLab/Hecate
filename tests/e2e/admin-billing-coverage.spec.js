// @ts-check

const { test, expect } = require("./coverage-fixture");

function buildAdminBillingShell(options = {}) {
  const includeManageButton = options.includeManageButton !== false;
  const includePackList = options.includePackList !== false;
  const includeActivityList = options.includeActivityList !== false;

  return `<!doctype html>
    <html>
      <body>
        <div id="settingsDrawer"></div>
        <button id="settingsCloseButton" type="button">Close</button>
        <div id="userMenu"></div>
        <button id="settingsTabAccount" type="button">Account</button>
        <button id="settingsTabAdmin" type="button">Admin</button>
        <div id="settingsAccountTab"></div>
        <div id="settingsAdminTab" style="display:none;"></div>
        <img id="settingsAvatar" alt="">
        <div id="settingsName"></div>
        <div id="settingsEmail"></div>
        <dl id="settingsAccountDetails"></dl>
        <section id="settingsBillingPanel">
          <div id="settingsBillingBalanceValue"></div>
          <div id="settingsBillingBalanceMeta"></div>
          <div id="settingsBillingStatus"></div>
          ${includeManageButton ? '<button id="settingsManageBillingButton" type="button">Manage</button>' : ""}
          ${includePackList ? '<div id="settingsBillingPackList"></div>' : ""}
          ${includeActivityList ? '<div id="settingsBillingActivityList"></div>' : ""}
        </section>
        <button id="adminRefreshUsers" type="button">Refresh Users</button>
        <input id="adminUserSearch" type="text">
        <div id="adminUserList"></div>
        <div id="adminUsersStatus"></div>
        <div id="adminNoSelection"></div>
        <div id="adminUserDetails"></div>
        <div id="adminSelectedUser"></div>
        <div id="adminSelectedUserMeta"></div>
        <button id="adminRefreshUser" type="button">Refresh User</button>
        <div id="adminBalanceCoins"></div>
        <div id="adminBalanceTotal"></div>
        <div id="adminBalanceStatus"></div>
        <form id="adminGrantForm">
          <input id="adminGrantCoins" type="number">
          <input id="adminGrantReason" type="text">
          <button id="adminGrantBtn" type="submit">Grant</button>
        </form>
        <div id="adminGrantStatus"></div>
        <div id="adminGrantHistoryList"></div>
        <div id="adminGrantHistoryStatus"></div>
      </body>
    </html>`;
}

async function loadAdminScript(page) {
  await page.addScriptTag({ url: "/js/admin.js" });
}

test.describe("Admin billing coverage", () => {
  test("does not auto-open the billing drawer on startup", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent(buildAdminBillingShell());
    await page.evaluate(() => {
      window.fetch = function (url) {
        if (String(url).indexOf("/api/session") >= 0) {
          return Promise.resolve({
            json: function () {
              return Promise.resolve({
                display: "Admin User",
                email: "admin@example.com",
                is_admin: false,
              });
            },
            ok: true,
            status: 200,
          });
        }
        return Promise.resolve({
          json: function () {
            return Promise.resolve({});
          },
          ok: true,
          status: 200,
        });
      };
    });
    await loadAdminScript(page);

    await expect(page.locator("#settingsDrawer")).not.toHaveAttribute("open", "");
  });

  test("covers admin billing helpers, events, and coordinator actions", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent(buildAdminBillingShell());
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
      window.__checkoutCalls = [];
      window.__portalCalls = 0;
      window.__scrollCalls = [];
      window.fetch = function (url) {
        if (String(url).indexOf("/api/session") >= 0) {
          return Promise.resolve({
            json: function () {
              return Promise.resolve({ error: "unauthorized" });
            },
            ok: false,
            status: 401,
          });
        }
        return Promise.resolve({
          json: function () {
            return Promise.resolve({});
          },
          ok: true,
          status: 200,
        });
      };
      document.getElementById("settingsBillingPanel").scrollIntoView = function (options) {
        window.__scrollCalls.push(options);
      };
    });
    await loadAdminScript(page);

    const result = await page.evaluate(async () => {
      var admin = window.__LLM_CROSSWORD_TEST__.admin;
      var manageButton = document.getElementById("settingsManageBillingButton");
      var outcomes = {};

      async function flushPromises() {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }

      outcomes.balanceFromAvailable = admin.getBalanceCredits({ available_cents: 350 });
      outcomes.balanceFromCustomCoinValue = admin.getBalanceCredits({ available_cents: 350, coin_value_cents: 10 });
      outcomes.generationCostMissing = admin.getGenerationCostCredits({});
      outcomes.balanceInvalid = admin.getBalanceCredits({ available_cents: "nope" });
      outcomes.emptyPackLabel = admin.getBillingPackLabel("");

      admin.setBillingSummary(null);
      outcomes.emptySummary = {
        balance: document.getElementById("settingsBillingBalanceValue").textContent,
        manageDisplay: manageButton.style.display,
        meta: document.getElementById("settingsBillingBalanceMeta").textContent,
      };

      admin.setBillingSummary({
        activity: [
          {},
          {
            credits_delta: 20,
            event_type: "transaction.completed",
            occurred_at: "invalid-date",
            pack_code: "missing",
            status: "completed",
            transaction_id: "txn_123",
          },
        ],
        balance: { available_cents: 350, generation_cost_coins: 6 },
        packs: [
          {
            code: "starter",
            credits: null,
            label: "",
            price_display: null,
          },
        ],
        portal_available: true,
      });

      outcomes.liveSummary = {
        activityText: document.getElementById("settingsBillingActivityList").textContent,
        balance: document.getElementById("settingsBillingBalanceValue").textContent,
        manageDisabled: manageButton.disabled,
        manageDisplay: manageButton.style.display,
        meta: document.getElementById("settingsBillingBalanceMeta").textContent,
        packText: document.getElementById("settingsBillingPackList").textContent,
      };

      document.querySelector("[data-billing-pack-button]").click();
      outcomes.checkoutCallsWithoutProvider = window.__checkoutCalls.slice();
      manageButton.click();
      outcomes.portalCallsWithoutProvider = window.__portalCalls;

      window.CrosswordBilling = {
        getState: function () {
          return { lastStatus: { message: "Billing synced", tone: "success" } };
        },
        loadSummary: function () {
          return Promise.reject(new Error("summary failed"));
        },
        requestCheckout: function (packCode) {
          window.__checkoutCalls.push(packCode);
          return Promise.resolve();
        },
        requestPortalSession: function () {
          window.__portalCalls += 1;
          return Promise.resolve();
        },
      };

      outcomes.requestSummaryResult = await admin.requestBillingSummary(true);
      admin.syncBillingStatusFromCoordinator();
      outcomes.syncedStatus = document.getElementById("settingsBillingStatus").textContent;

      document.querySelector("[data-billing-pack-button]").click();
      await flushPromises();
      manageButton.click();
      await flushPromises();

      window.CrosswordBilling.requestCheckout = function () {
        return Promise.reject(new Error("checkout failed"));
      };
      window.CrosswordBilling.requestPortalSession = function () {
        return Promise.reject(new Error("portal failed"));
      };
      document.querySelector("[data-billing-pack-button]").click();
      await flushPromises();
      manageButton.click();
      await flushPromises();

      admin.setBillingSummary({
        activity: [],
        balance: {},
        packs: [
          {
            code: "",
            credits: 10,
            label: "Mystery pack",
            price_display: "$1.00",
          },
        ],
        portal_available: false,
      });
      outcomes.noPortalSummary = {
        balance: document.getElementById("settingsBillingBalanceValue").textContent,
        manageDisplay: manageButton.style.display,
        packButtonValue: document.querySelector("[data-billing-pack-button]").getAttribute("data-billing-pack-button"),
      };

      window.dispatchEvent(new CustomEvent("llm-crossword:billing-status"));
      outcomes.statusAfterEmptyEvent = document.getElementById("settingsBillingStatus").textContent;

      window.dispatchEvent(new CustomEvent("llm-crossword:billing-open-request"));
      await flushPromises();
      outcomes.drawerOpen = document.getElementById("settingsDrawer").getAttribute("open");
      outcomes.scrollCalls = window.__scrollCalls.slice();
      outcomes.checkoutCalls = window.__checkoutCalls.slice();
      outcomes.portalCalls = window.__portalCalls;
      return outcomes;
    });

    expect(result.balanceFromAvailable).toBe(3);
    expect(result.balanceFromCustomCoinValue).toBe(35);
    expect(result.generationCostMissing).toBeNull();
    expect(result.balanceInvalid).toBeNull();
    expect(result.emptyPackLabel).toBe("");
    expect(result.emptySummary).toEqual({
      balance: "—",
      manageDisplay: "none",
      meta: "Purchases are granted after Paddle confirms payment.",
    });
    expect(result.liveSummary.balance).toBe("3 credits");
    expect(result.liveSummary.manageDisplay).toBe("");
    expect(result.liveSummary.manageDisabled).toBe(false);
    expect(result.liveSummary.meta).toBe("Each new crossword costs 6 credits. Purchases are granted after Paddle confirms payment.");
    expect(result.liveSummary.packText).toContain("—");
    expect(result.liveSummary.activityText).toContain("Billing activity recorded.");
    expect(result.liveSummary.activityText).toContain("completed");
    expect(result.liveSummary.activityText).toContain("+20 credits");
    expect(result.liveSummary.activityText).toContain("invalid-date");
    expect(result.liveSummary.activityText).toContain("Transaction txn_123");
    expect(result.checkoutCallsWithoutProvider).toEqual([]);
    expect(result.portalCallsWithoutProvider).toBe(0);
    expect(result.requestSummaryResult).toBeNull();
    expect(result.syncedStatus).toContain("Billing synced");
    expect(result.statusAfterEmptyEvent).toBe("");
    expect(result.noPortalSummary).toEqual({
      balance: "—",
      manageDisplay: "none",
      packButtonValue: "",
    });
    expect(result.drawerOpen).toBe("");
    expect(result.scrollCalls).toEqual([{ behavior: "smooth", block: "start" }]);
    expect(result.checkoutCalls).toEqual(["starter"]);
    expect(result.portalCalls).toBe(1);
  });

  test("covers admin billing branches when optional nodes are absent", async ({ page }) => {
    await page.goto("/blank.html");
    await page.setContent(buildAdminBillingShell({
      includeActivityList: false,
      includeManageButton: false,
      includePackList: false,
    }));
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
      window.fetch = function (url) {
        if (String(url).indexOf("/api/session") >= 0) {
          return Promise.resolve({
            json: function () {
              return Promise.resolve({ error: "unauthorized" });
            },
            ok: false,
            status: 401,
          });
        }
        return Promise.resolve({
          json: function () {
            return Promise.resolve({});
          },
          ok: true,
          status: 200,
        });
      };
    });
    await loadAdminScript(page);

    const result = await page.evaluate(async () => {
      var admin = window.__LLM_CROSSWORD_TEST__.admin;
      var outcomes = {};

      async function flushPromises() {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }

      outcomes.balanceNull = admin.getBalanceCredits(null);
      outcomes.blankTimestamp = admin.formatBillingTimestamp("");

      admin.renderBillingActivity(null);
      admin.renderBillingPacks(null);
      admin.setBillingSummary(null);
      admin.setBillingSummary({
        activity: null,
        balance: {},
        packs: null,
        portal_available: false,
      });

      document.getElementById("settingsBillingPanel").scrollIntoView = null;
      window.dispatchEvent(new CustomEvent("llm-crossword:billing-open-request"));
      await flushPromises();

      outcomes.balanceValue = document.getElementById("settingsBillingBalanceValue").textContent;
      outcomes.metaValue = document.getElementById("settingsBillingBalanceMeta").textContent;
      outcomes.drawerOpen = document.getElementById("settingsDrawer").getAttribute("open");
      return outcomes;
    });

    expect(result.balanceNull).toBeNull();
    expect(result.blankTimestamp).toBe("—");
    expect(result.balanceValue).toBe("—");
    expect(result.metaValue).toBe("Purchases are granted after Paddle confirms payment.");
    expect(result.drawerOpen).toBe("");
  });
});
