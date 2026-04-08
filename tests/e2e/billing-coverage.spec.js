// @ts-check

const { test, expect } = require("./coverage-fixture");
const { createBillingSummary, mountAppShell, setupLoggedOutRoutes } = require("./route-helpers");

async function loadScript(page, fileName) {
  await page.addScriptTag({ url: `/js/${fileName}` });
}

async function stubPaddleCheckout(page) {
  await page.route("**/cdn.paddle.com/paddle/v2/paddle.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
        window.__paddleCalls = {
          environment: [],
          eventCallback: null,
          initialize: null,
          initializeCalls: [],
          opens: [],
          updates: [],
        };
        window.__emitPaddleEvent = function (name, detail) {
          var eventData = Object.assign({ name: name }, detail || {});
          if (typeof window.__paddleCalls.eventCallback === "function") {
            window.__paddleCalls.eventCallback(eventData);
          }
        };
        window.Paddle = {
          Initialized: false,
          Environment: {
            set: function (value) {
              window.__paddleCalls.environment.push(value);
            }
          },
          Initialize: function (options) {
            window.Paddle.Initialized = true;
            window.__paddleCalls.initialize = options;
            window.__paddleCalls.initializeCalls.push(options);
            window.__paddleCalls.eventCallback = options && options.eventCallback;
          },
          Update: function (options) {
            window.__paddleCalls.updates.push(options);
            if (options && Object.prototype.hasOwnProperty.call(options, "eventCallback")) {
              window.__paddleCalls.eventCallback = options.eventCallback;
            }
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

function jsonResponse(status, body) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

test.describe("Billing coverage", () => {
  test("covers billing helpers and error handling through the test hook", async ({ page }) => {
    await page.goto("/blank.html");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
      window.__billingEvents = [];
      [
        "billing-no-detail",
        "billing-open-request",
        "billing-summary",
        "billing-status",
      ].forEach(function (name) {
        window.addEventListener("llm-crossword:" + name, function (event) {
          window.__billingEvents.push({
            detail: event.detail || null,
            name: name,
          });
        });
      });
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      var billing = window.__LLM_CROSSWORD_TEST__.billing;
      var knownSummary = {
        activity: [],
        balance: null,
        client_token: "test_client_token",
        environment: "sandbox",
        packs: [{ code: "starter" }],
        portal_available: false,
        provider_code: "paddle",
      };
      var outcomes = {};

      billing.dispatchBillingEvent("billing-no-detail");
      billing.updateBillingStatus();
      outcomes.defaultStatus = window.CrosswordBilling.getState().lastStatus;
      outcomes.normalized = billing.normalizeSummary(null);
      outcomes.messageError = billing.describeBillingError({
        data: { message: "  Checkout denied  " },
      }, "fallback");
      outcomes.fallbackError = billing.describeBillingError({}, "fallback");

      billing.setState({
        loggedIn: true,
        summary: knownSummary,
      });
      window.fetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.reject(new Error("bad json"));
          },
          ok: false,
          status: 500,
        });
      };
      delete window.authFetch;
      try {
        await billing.loadSummary();
      } catch (error) {
        outcomes.summaryError = error.message;
      }
      outcomes.summaryErrorStatus = window.CrosswordBilling.getState().lastStatus;

      window.fetch = function () {
        return Promise.reject({});
      };
      try {
        await billing.loadSummary({
          force: true,
        });
      } catch (error) {}
      outcomes.fallbackSummaryStatus = window.CrosswordBilling.getState().lastStatus;

      billing.updateBillingStatus("Suppressed status", "info", true);
      window.fetch = function () {
        return Promise.reject(new Error("suppressed"));
      };
      try {
        await billing.loadSummary({
          force: true,
          suppressErrors: true,
        });
      } catch (error) {}
      outcomes.suppressedSummaryStatus = window.CrosswordBilling.getState().lastStatus;

      window.authFetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({});
          },
          ok: false,
          status: 401,
        });
      };
      outcomes.unauthorizedSummary = await billing.loadSummary();

	      billing.setState({
	        loggedIn: false,
	        summary: knownSummary,
	      });
	      outcomes.loggedOutSummary = await billing.loadSummary();
	      delete window.authFetch;
	      outcomes.syncWhileLoggedOut = await billing.requestBillingSync();

	      billing.setState({ loggedIn: true });
	      window.fetch = function () {
	        return Promise.resolve({
	          json: function () {
	            return Promise.resolve({ synced: true });
	          },
	          ok: true,
	          status: 200,
	        });
	      };
	      outcomes.syncOk = await billing.requestBillingSync();
	      window.fetch = function () {
	        return Promise.resolve({
	          json: function () {
	            return Promise.resolve(null);
	          },
	          ok: true,
	          status: 200,
	        });
	      };
	      outcomes.syncOkEmpty = await billing.requestBillingSync();
	      window.fetch = function () {
	        return Promise.resolve({
	          json: function () {
	            return Promise.resolve({ message: "  Refresh denied  " });
	          },
	          ok: false,
	          status: 500,
	        });
	      };
	      try {
	        await billing.requestBillingSync();
	      } catch (error) {
	        outcomes.syncError = error.message;
	      }
	      outcomes.syncAcceptedStatuses = [];
	      for (const status of [401, 403]) {
	        window.fetch = function () {
	          return Promise.resolve({
	            json: function () {
	              return Promise.resolve({ accepted_status: status });
	            },
	            ok: false,
	            status: status,
	          });
	        };
	        outcomes.syncAcceptedStatuses.push(await billing.requestBillingSync());
	      }
	      outcomes.syncRejectedStatuses = [];
	      for (const status of [404, 503]) {
	        window.fetch = function () {
	          return Promise.resolve({
	            json: function () {
	              return Promise.resolve({ message: "sync status " + status });
	            },
	            ok: false,
	            status: status,
	          });
	        };
	        try {
	          await billing.requestBillingSync();
	        } catch (error) {
	          outcomes.syncRejectedStatuses.push(error.message);
	        }
	      }
	      window.fetch = function () {
	        return Promise.resolve({
	          json: function () {
	            return Promise.resolve(null);
	          },
	          ok: false,
	          status: 401,
	        });
	      };
	      outcomes.syncAcceptedEmpty = await billing.requestBillingSync();

	      billing.setState({ loggedIn: false });
	      outcomes.reconcileWhileLoggedOut = await billing.requestCheckoutReconcile("txn_logged_out");
	      outcomes.reconcileNonString = await billing.requestCheckoutReconcile(42);
	      outcomes.reconcileNormalized = billing.normalizeCheckoutReconcileResult({
	        provider_code: "paddle",
	        status: " Completed ",
	        transaction_id: " txn_explicit ",
	      }, "txn_fallback");
	      outcomes.reconcileInvalidRaw = billing.normalizeCheckoutReconcileResult("bad-result", "txn_invalid");

	      billing.setState({ loggedIn: true });
	      window.fetch = function () {
	        return Promise.resolve({
	          json: function () {
	            return Promise.resolve({ status: "completed" });
	          },
	          ok: false,
	          status: 500,
	        });
	      };
	      outcomes.reconcileFallback = await billing.requestCheckoutReconcile("txn_failed");

	      billing.setState({ summary: knownSummary });
      window.fetch = function () {
        return Promise.reject(new Error("offline"));
      };
      delete window.authFetch;
      outcomes.setLoggedInSummary = await window.CrosswordBilling.setLoggedIn(true);

      window.Paddle = {
        Environment: {
          set: function () {},
        },
        Initialize: function () {},
        Checkout: {
          open: function () {},
        },
      };

      window.fetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve({
            json: function () {
              return Promise.resolve(knownSummary);
            },
            ok: true,
            status: 200,
          });
        }
        return Promise.resolve({
          json: function () {
            return Promise.resolve({ message: "  Pack unavailable  " });
          },
          ok: false,
          status: 400,
        });
      };
      try {
        await billing.requestCheckout("starter");
      } catch (error) {
        outcomes.checkoutError = error.message;
      }

      window.fetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve({
            json: function () {
              return Promise.resolve(knownSummary);
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
      try {
        await billing.requestCheckout("starter");
      } catch (error) {
        outcomes.checkoutMissingTransaction = error.message;
      }

      try {
        await billing.requestCheckout("   ");
      } catch (error) {
        outcomes.checkoutBlankPack = error.message;
      }

      window.fetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({});
          },
          ok: false,
          status: 500,
        });
      };
      try {
        await billing.requestPortalSession();
      } catch (error) {
        outcomes.portalError = error.message;
      }

      window.fetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({});
          },
          ok: true,
          status: 200,
        });
      };
      try {
        await billing.requestPortalSession();
      } catch (error) {
        outcomes.portalMissingURL = error.message;
      }

      billing.setState({
        loggedIn: true,
        summary: knownSummary,
      });
      window.authFetch = function () {
        return Promise.reject(new Error("offline"));
      };
      outcomes.restoredSummary = await billing.openAccountBilling({
        force: true,
        isBusy: true,
        message: "Open drawer",
        suppressErrors: true,
        tone: "info",
      });
      outcomes.openDrawerStatus = window.CrosswordBilling.getState().lastStatus;
      outcomes.events = window.__billingEvents.slice();
      return outcomes;
    });

    expect(result.defaultStatus).toEqual({
      isBusy: false,
      message: "",
      tone: "",
    });
    expect(result.normalized).toEqual({
      activity: [],
      balance: null,
      client_token: "",
      environment: "",
      packs: [],
      portal_available: false,
      provider_code: "",
    });
    expect(result.messageError).toBe("Checkout denied");
    expect(result.fallbackError).toBe("fallback");
    expect(result.summaryError).toBe("We couldn't load billing right now.");
    expect(result.summaryErrorStatus).toEqual({
      isBusy: false,
      message: "We couldn't load billing right now.",
      tone: "error",
    });
    expect(result.fallbackSummaryStatus).toEqual({
      isBusy: false,
      message: "We couldn't load billing right now.",
      tone: "error",
    });
    expect(result.suppressedSummaryStatus).toEqual({
      isBusy: true,
      message: "Suppressed status",
      tone: "info",
    });
    expect(result.unauthorizedSummary).toEqual({
      activity: [],
      balance: null,
      client_token: "",
      environment: "",
      packs: [],
      portal_available: false,
      provider_code: "",
    });
	    expect(result.loggedOutSummary).toEqual({
	      activity: [],
	      balance: null,
	      client_token: "",
	      environment: "",
      packs: [],
	      portal_available: false,
	      provider_code: "",
	    });
	    expect(result.syncWhileLoggedOut).toEqual({ ok: true });
	    expect(result.syncOk).toEqual({ synced: true });
	    expect(result.syncOkEmpty).toEqual({});
	    expect(result.syncError).toBe("Refresh denied");
	    expect(result.syncAcceptedStatuses).toEqual([
	      { accepted_status: 401 },
	      { accepted_status: 403 },
	    ]);
	    expect(result.syncRejectedStatuses).toEqual([
	      "sync status 404",
	      "sync status 503",
	    ]);
	    expect(result.syncAcceptedEmpty).toEqual({});
	    expect(result.reconcileWhileLoggedOut).toEqual({
	      provider_code: "",
	      status: "unknown",
	      transaction_id: "txn_logged_out",
	    });
	    expect(result.reconcileNonString).toEqual({
	      provider_code: "",
	      status: "unknown",
	      transaction_id: "",
	    });
	    expect(result.reconcileNormalized).toEqual({
	      provider_code: "paddle",
	      status: "completed",
	      transaction_id: "txn_explicit",
	    });
	    expect(result.reconcileInvalidRaw).toEqual({
	      provider_code: "",
	      status: "unknown",
	      transaction_id: "txn_invalid",
	    });
	    expect(result.reconcileFallback).toEqual({
	      provider_code: "",
	      status: "unknown",
	      transaction_id: "txn_failed",
	    });
	    expect(result.setLoggedInSummary).toEqual({
	      activity: [],
	      balance: null,
      client_token: "test_client_token",
      environment: "sandbox",
      packs: [{ code: "starter" }],
      portal_available: false,
      provider_code: "paddle",
    });
    expect(result.checkoutError).toBe("Pack unavailable");
    expect(result.checkoutMissingTransaction).toBe("Checkout did not return a transaction.");
    expect(result.checkoutBlankPack).toBe("Choose a credit pack first.");
    expect(result.portalError).toBe("We couldn't open billing right now.");
    expect(result.portalMissingURL).toBe("Billing portal did not return a URL.");
    expect(result.restoredSummary).toEqual({
      activity: [],
      balance: null,
      client_token: "test_client_token",
      environment: "sandbox",
      packs: [{ code: "starter" }],
      portal_available: false,
      provider_code: "paddle",
    });
    expect(result.openDrawerStatus).toEqual({
      isBusy: true,
      message: "Open drawer",
      tone: "info",
    });
    expect(result.events.find((event) => event.name === "billing-no-detail")).toEqual({
      detail: {},
      name: "billing-no-detail",
    });
    expect(result.events.find((event) => event.name === "billing-open-request")).toEqual({
      detail: {
        force: true,
        isBusy: true,
        message: "Open drawer",
        suppressErrors: true,
        tone: "info",
      },
      name: "billing-open-request",
    });
  });

  test("covers billing polling, timers, and url helpers", async ({ page }) => {
    await page.goto("/blank.html");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
      window.__billingEvents = [];
      [
        "billing-open-request",
        "billing-status",
        "billing-transaction-complete",
        "billing-transaction-timeout",
      ].forEach(function (name) {
        window.addEventListener("llm-crossword:" + name, function (event) {
          window.__billingEvents.push({
            detail: event.detail || null,
            name: name,
          });
        });
      });
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      var billing = window.__LLM_CROSSWORD_TEST__.billing;
      var clearTimeoutCalls = [];
      var replaceCalls = [];
      var scheduledCallbacks = [];
      var scheduledTimeouts = [];
      var originalClearTimeout = window.clearTimeout;
      var originalHistoryReplaceState = window.history.replaceState.bind(window.history);
      var originalSetTimeout = window.setTimeout;
      var originalURL = window.URL;
      var outcomes = {};

      window.clearTimeout = function (timerId) {
        clearTimeoutCalls.push(timerId);
      };
      window.setTimeout = function (callback, delay) {
        scheduledCallbacks.push(callback);
        scheduledTimeouts.push(delay);
        return scheduledTimeouts.length;
      };
      window.history.replaceState = function (state, title, url) {
        replaceCalls.push(url);
      };

      outcomes.guardNoSummary = billing.findTransactionActivity(null, "txn");
      outcomes.noMatch = billing.findTransactionActivity({
        activity: [{ transaction_id: "other", status: "pending" }],
      }, "txn");
      outcomes.firstMatch = billing.findTransactionActivity({
        activity: [
          { transaction_id: "txn", status: "pending" },
          { transaction_id: "txn", status: "open" },
        ],
      }, "txn");
      outcomes.completedMatch = billing.findTransactionActivity({
        activity: [
          { transaction_id: "txn", status: "pending" },
          { event_type: "transaction.completed", transaction_id: "txn" },
        ],
      }, "txn");
      outcomes.completedChecks = {
        event: billing.isCompletedTransactionActivity({ event_type: "transaction.completed" }),
        pending: billing.isCompletedTransactionActivity({ status: "pending" }),
        status: billing.isCompletedTransactionActivity({ status: "completed" }),
      };

      window.URL = function () {
        throw new Error("bad url");
      };
      outcomes.badReturnTransactionID = billing.getReturnTransactionID();
      billing.clearReturnTransactionID();
      window.URL = originalURL;

      billing.clearReturnTransactionID();
      outcomes.replaceCallsWithoutQuery = replaceCalls.slice();

      billing.setState({ pollTimerId: 77 });
      billing.clearPollTimer();

      billing.setState({
        activeTransactionId: "txn-stop",
        loggedIn: false,
        pollDeadlineTimestamp: Date.now() + 1000,
        pollTimerId: 88,
      });
      await billing.pollForTransactionResult();
      outcomes.afterEarlyStop = window.CrosswordBilling.getState();

      window.authFetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({
              activity: [{ status: "pending", transaction_id: "txn-timeout-activity" }],
            });
          },
          ok: true,
          status: 200,
        });
      };
      billing.setState({
        activeTransactionId: "txn-timeout-activity",
        loggedIn: true,
        pollDeadlineTimestamp: 0,
      });
      await billing.pollForTransactionResult();
      outcomes.timeoutWithActivity = window.CrosswordBilling.getState().lastStatus.message;

      window.authFetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({
              activity: [],
            });
          },
          ok: true,
          status: 200,
        });
      };
      billing.setState({
        activeTransactionId: "txn-timeout-empty",
        loggedIn: true,
        pollDeadlineTimestamp: 0,
      });
      await billing.pollForTransactionResult();
      outcomes.timeoutWithoutActivity = window.CrosswordBilling.getState().lastStatus.message;

      window.authFetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({
              activity: [{ status: "pending", transaction_id: "txn-pending" }],
            });
          },
          ok: true,
          status: 200,
        });
      };
      billing.setState({
        activeTransactionId: "txn-pending",
        loggedIn: true,
        pollDeadlineTimestamp: Date.now() + 1000,
      });
      await billing.pollForTransactionResult();
      outcomes.pendingWithActivity = window.CrosswordBilling.getState().lastStatus.message;

      window.authFetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({
              activity: [],
            });
          },
          ok: true,
          status: 200,
        });
      };
      billing.setState({
        activeTransactionId: "txn-waiting",
        loggedIn: true,
        pollDeadlineTimestamp: Date.now() + 1000,
      });
      await billing.pollForTransactionResult();
      outcomes.pendingWithoutActivity = window.CrosswordBilling.getState().lastStatus.message;

      window.authFetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({
              activity: [{ event_type: "transaction.completed", transaction_id: "txn-complete" }],
            });
          },
          ok: true,
          status: 200,
        });
      };
      billing.setState({
        activeTransactionId: "txn-complete",
        loggedIn: true,
        pollDeadlineTimestamp: Date.now() + 1000,
      });
      await billing.pollForTransactionResult();
      outcomes.completedMessage = window.CrosswordBilling.getState().lastStatus.message;

      window.authFetch = function () {
        return Promise.reject(new Error("offline"));
      };
      billing.setState({
        activeTransactionId: "txn-error-timeout",
        loggedIn: true,
        pollDeadlineTimestamp: 0,
      });
      await billing.pollForTransactionResult();
      outcomes.errorTimeoutMessage = window.CrosswordBilling.getState().lastStatus.message;

      window.authFetch = function () {
        return Promise.reject(new Error("offline"));
      };
      billing.setState({
        activeTransactionId: "txn-error-retry",
        loggedIn: true,
        pollDeadlineTimestamp: Date.now() + 1000,
      });
      await billing.pollForTransactionResult();

      billing.setState({
        activeTransactionId: "",
        loggedIn: true,
      });
      billing.startTransactionPolling("   ");
      outcomes.blankStartTransactionID = window.CrosswordBilling.getState().activeTransactionId;

      window.authFetch = function () {
        return Promise.reject(new Error("offline"));
      };
      billing.setState({
        activeTransactionId: "",
        loggedIn: true,
        pollDeadlineTimestamp: 0,
      });
      await billing.startTransactionPolling("txn-same");
      outcomes.afterStartTransaction = window.CrosswordBilling.getState();
      await billing.startTransactionPolling("txn-same");

      outcomes.clearTimeoutCalls = clearTimeoutCalls.slice();
      billing.setState({
        activeTransactionId: "",
        loggedIn: false,
      });
      if (scheduledCallbacks.length > 0) {
        scheduledCallbacks[0]();
      }
      outcomes.scheduledTimeouts = scheduledTimeouts.slice();
      outcomes.restoreDrawerPending = window.sessionStorage.getItem("llm-crossword-billing-restore-drawer");
      outcomes.events = window.__billingEvents.slice();

      window.clearTimeout = originalClearTimeout;
      window.history.replaceState = originalHistoryReplaceState;
      window.setTimeout = originalSetTimeout;
      return outcomes;
    });

    expect(result.guardNoSummary).toBeNull();
    expect(result.noMatch).toBeNull();
    expect(result.firstMatch).toEqual({
      status: "pending",
      transaction_id: "txn",
    });
    expect(result.completedMatch).toEqual({
      event_type: "transaction.completed",
      transaction_id: "txn",
    });
    expect(result.completedChecks).toEqual({
      event: true,
      pending: false,
      status: true,
    });
    expect(result.badReturnTransactionID).toBe("");
    expect(result.replaceCallsWithoutQuery).toEqual([]);
    expect(result.afterEarlyStop.activeTransactionId).toBe("");
    expect(result.timeoutWithActivity).toBe("Payment is still processing. Refresh billing in a moment if credits do not appear.");
    expect(result.timeoutWithoutActivity).toBe("Checkout closed before payment completed.");
    expect(result.pendingWithActivity).toBe("Waiting for payment confirmation...");
    expect(result.pendingWithoutActivity).toBe("Returning from checkout. Waiting for billing activity...");
    expect(result.completedMessage).toBe("Payment confirmed. Your credits are ready to use.");
    expect(result.errorTimeoutMessage).toBe("We couldn't confirm payment automatically. Refresh billing in a moment.");
    expect(result.blankStartTransactionID).toBe("");
    expect(result.afterStartTransaction.activeTransactionId).toBe("txn-same");
    expect(result.clearTimeoutCalls).toEqual(expect.arrayContaining([77, 88]));
    expect(result.scheduledTimeouts).toEqual(expect.arrayContaining([2500]));
    expect(result.restoreDrawerPending).toBe("1");
    expect(result.events.filter((event) => event.name === "billing-open-request")).toEqual([
      {
        detail: {
          restore: true,
          source: "checkout_return",
          transaction_id: "txn-same",
        },
        name: "billing-open-request",
      },
    ]);
    expect(result.events.find((event) => event.name === "billing-transaction-complete")).toEqual({
      detail: {
        activity: {
          event_type: "transaction.completed",
          transaction_id: "txn-complete",
        },
        transaction_id: "",
      },
      name: "billing-transaction-complete",
    });
    expect(result.events.filter((event) => event.name === "billing-transaction-timeout")).toEqual([
      {
        detail: {
          activity: {
            status: "pending",
            transaction_id: "txn-timeout-activity",
          },
          transaction_id: "",
        },
        name: "billing-transaction-timeout",
      },
      {
        detail: {
          activity: null,
          transaction_id: "",
        },
        name: "billing-transaction-timeout",
      },
    ]);
  });

  test("covers checkout success handling without losing billing coverage", async ({ page }) => {
    await stubPaddleCheckout(page);
    await page.route("**/api/billing/summary", (route) =>
      route.fulfill(jsonResponse(200, createBillingSummary()))
    );
    await page.route("**/api/billing/checkout", (route) =>
      route.fulfill(jsonResponse(200, {
        checkout_mode: "overlay",
        provider_code: "paddle",
        transaction_id: "txn_checkout_success",
      }))
    );

    await page.goto("/blank.html");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      window.__LLM_CROSSWORD_TEST__.billing.setState({ loggedIn: true });
      return window.CrosswordBilling.requestCheckout("starter").then(function (data) {
        return {
          checkoutMode: data.checkout_mode,
          environmentCalls: window.__paddleCalls.environment.slice(),
          initializeToken: window.__paddleCalls.initialize && window.__paddleCalls.initialize.token,
          openCalls: window.__paddleCalls.opens.slice(),
          transactionID: data.transaction_id,
        };
      });
    });

    expect(result).toEqual({
      checkoutMode: "overlay",
      environmentCalls: ["sandbox"],
      initializeToken: "test_client_token",
      openCalls: [{ transactionId: "txn_checkout_success" }],
      transactionID: "txn_checkout_success",
    });
  });

  test("covers portal success handling without losing billing coverage", async ({ page }) => {
    await page.route("**/api/billing/portal", (route) =>
      route.fulfill(jsonResponse(200, { url: "#portal-success" }))
    );

    await page.goto("/blank.html");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      return window.CrosswordBilling.requestPortalSession().then(function (data) {
        return {
          portalURL: data.url,
          locationHash: window.location.hash,
        };
      });
    });

    expect(result).toEqual({
      portalURL: "#portal-success",
      locationHash: "#portal-success",
    });
  });

  test("covers billing direct-checkout fallbacks and default hook paths", async ({ page }) => {
    await page.goto("/blank.html");
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      var billing = window.__LLM_CROSSWORD_TEST__.billing;
      var outcomes = {};

      billing.updateBillingStatus("Keep this status", "info", true);
      billing.setState({
        loggedIn: true,
      });

      window.fetch = function () {
        return Promise.reject({});
      };
      try {
        await billing.loadSummary({
          suppressErrors: true,
        });
      } catch (error) {}

      outcomes.suppressedStatus = window.CrosswordBilling.getState().lastStatus;
      outcomes.completedNullActivity = billing.isCompletedTransactionActivity(null);

      try {
        await billing.requestCheckout(null);
      } catch (error) {
        outcomes.nullPackError = error.message;
      }

      try {
        await billing.requestCheckout("starter");
      } catch (error) {
        outcomes.checkoutFallbackStatus = window.CrosswordBilling.getState().lastStatus;
      }

      window.Paddle = {
        Environment: {
          set: function (value) {
            outcomes.checkoutEnvironment = value;
          },
        },
        Initialize: function (options) {
          outcomes.checkoutToken = options.token;
        },
        Checkout: {
          open: function (options) {
            outcomes.checkoutOpen = options;
          },
        },
      };
      window.fetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve({
            json: function () {
              return Promise.resolve({
                client_token: "direct_token",
                environment: "production",
                provider_code: "paddle",
              });
            },
            ok: true,
            status: 200,
          });
        }
        return Promise.resolve({
          json: function () {
            return Promise.resolve({
              checkout_mode: "overlay",
              transaction_id: "txn_direct_success",
            });
          },
          ok: true,
          status: 200,
        });
      };
      outcomes.checkoutSuccess = await billing.requestCheckout("starter");
      outcomes.checkoutStatus = window.CrosswordBilling.getState().lastStatus;

      window.fetch = function () {
        return Promise.reject({});
      };
      try {
        await billing.requestPortalSession();
      } catch (error) {
        outcomes.portalFallbackStatus = window.CrosswordBilling.getState().lastStatus;
      }

      window.fetch = function () {
        return Promise.resolve({
          json: function () {
            return Promise.resolve({ url: "#portal-direct-success" });
          },
          ok: true,
          status: 200,
        });
      };
      outcomes.portalSuccess = await billing.requestPortalSession();
      outcomes.portalHash = window.location.hash;

      outcomes.openWithoutOptions = await billing.openAccountBilling();
      outcomes.statusAfterOpenWithoutOptions = window.CrosswordBilling.getState().lastStatus;

      outcomes.nullStartPolling = billing.startTransactionPolling(null);
      billing.setState();
      outcomes.testHookExists = Boolean(window.__LLM_CROSSWORD_TEST__ && billing);
      return outcomes;
    });

    expect(result.suppressedStatus).toEqual({
      isBusy: true,
      message: "Keep this status",
      tone: "info",
    });
    expect(result.completedNullActivity).toBe(false);
    expect(result.nullPackError).toBe("Choose a credit pack first.");
    expect(result.checkoutFallbackStatus).toEqual({
      isBusy: false,
      message: "We couldn't start checkout.",
      tone: "error",
    });
    expect(result.checkoutSuccess).toEqual({
      checkout_mode: "overlay",
      transaction_id: "txn_direct_success",
    });
    expect(result.checkoutEnvironment).toBe("production");
    expect(result.checkoutToken).toBe("direct_token");
    expect(result.checkoutOpen).toEqual({
      transactionId: "txn_direct_success",
    });
    expect(result.checkoutStatus).toEqual({
      isBusy: false,
      message: "Checkout opened. Complete payment in Paddle to continue.",
      tone: "",
    });
    expect(result.portalFallbackStatus).toEqual({
      isBusy: false,
      message: "We couldn't open billing right now.",
      tone: "error",
    });
    expect(result.portalSuccess).toEqual({
      url: "#portal-direct-success",
    });
    expect(result.portalHash).toBe("#portal-direct-success");
    expect(result.openWithoutOptions).toEqual({
      activity: [],
      balance: null,
      client_token: "",
      environment: "",
      packs: [],
      portal_available: false,
      provider_code: "",
    });
    expect(result.statusAfterOpenWithoutOptions).toEqual({
      isBusy: true,
      message: "Opening billing portal...",
      tone: "",
    });
    expect(result.nullStartPolling).toBeUndefined();
    expect(result.testHookExists).toBe(true);
  });

  test("covers direct Paddle checkout lifecycle events", async ({ page }) => {
    await stubPaddleCheckout(page);
    await page.goto("/blank.html");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      var billing = window.__LLM_CROSSWORD_TEST__.billing;
      var events = [];

      await billing.openPaddleCheckout({
        client_token: "checkout_token",
        environment: "production",
        provider_code: "paddle",
      }, {
        checkout_mode: "overlay",
        transaction_id: "txn_lifecycle",
      }, {
        onClosed: function (transactionID) {
          events.push({ name: "closed", transactionID: transactionID });
        },
        onCompleted: function (transactionID) {
          events.push({ name: "completed", transactionID: transactionID });
        },
      });

      window.__emitPaddleEvent("checkout.completed", {
        data: { transaction_id: "txn_other" },
      });
      window.__emitPaddleEvent("checkout.completed", {
        data: { transactionId: "txn_lifecycle" },
      });
      window.__emitPaddleEvent("checkout.closed", {
        transactionId: "txn_lifecycle",
      });

      return {
        environmentCalls: window.__paddleCalls.environment.slice(),
        events: events,
        initializeToken: window.__paddleCalls.initialize && window.__paddleCalls.initialize.token,
        openCalls: window.__paddleCalls.opens.slice(),
      };
    });

    expect(result.environmentCalls).toEqual(["production"]);
    expect(result.initializeToken).toBe("checkout_token");
    expect(result.openCalls).toEqual([
      {
        transactionId: "txn_lifecycle",
      },
    ]);
    expect(result.events).toEqual([
      {
        name: "completed",
        transactionID: "txn_lifecycle",
      },
      {
        name: "closed",
        transactionID: "txn_lifecycle",
      },
    ]);
  });

  test("reuses initialized Paddle checkout state across repeated checkout opens", async ({ page }) => {
    await page.route("**/cdn.paddle.com/paddle/v2/paddle.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
          window.__paddleCalls = {
            environment: [],
            eventCallback: null,
            initialize: null,
            initializeCalls: [],
            opens: [],
          };
          window.Paddle = {
            Initialized: false,
            Environment: {
              set: function (value) {
                window.__paddleCalls.environment.push(value);
              }
            },
            Initialize: function (options) {
              window.Paddle.Initialized = true;
              window.__paddleCalls.initialize = options;
              window.__paddleCalls.initializeCalls.push(options);
              window.__paddleCalls.eventCallback = options && options.eventCallback;
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
    await page.goto("/blank.html");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      var billing = window.__LLM_CROSSWORD_TEST__.billing;

      await billing.openPaddleCheckout({
        client_token: "first_token",
        environment: "sandbox",
        provider_code: "paddle",
      }, {
        checkout_mode: "overlay",
        transaction_id: "txn_first",
      });
      await billing.openPaddleCheckout({
        client_token: "rotated_token",
        environment: "production",
        provider_code: "paddle",
      }, {
        checkout_mode: "overlay",
        transaction_id: "txn_second",
      });

      return {
        environmentCalls: window.__paddleCalls.environment.slice(),
        initializeCallCount: window.__paddleCalls.initializeCalls.length,
        initializeToken: window.__paddleCalls.initialize && window.__paddleCalls.initialize.token,
        openCalls: window.__paddleCalls.opens.slice(),
      };
    });

    expect(result).toEqual({
      environmentCalls: ["sandbox", "production"],
      initializeCallCount: 2,
      initializeToken: "rotated_token",
      openCalls: [
        { transactionId: "txn_first" },
        { transactionId: "txn_second" },
      ],
    });
  });

  test("covers Paddle SDK helper failures and closed-checkout branches", async ({ page }) => {
    var successScriptLoads = 0;
    var invalidScriptLoads = 0;
    var failedScriptLoads = 0;

    await page.route("https://sdk.local/success.js", (route) => {
      successScriptLoads += 1;
      route.fulfill({
        contentType: "text/javascript",
        body: `
          window.Paddle = {
            Environment: { set: function () {} },
            Initialize: function () {},
            Checkout: { open: function () {} }
          };
        `,
        status: 200,
      });
    });
    await page.route("https://sdk.local/invalid.js", (route) => {
      invalidScriptLoads += 1;
      route.fulfill({
        contentType: "text/javascript",
        body: "window.__invalidPaddleLoaded = true;",
        status: 200,
      });
    });
    await page.route("https://sdk.local/fail.js", (route) => {
      failedScriptLoads += 1;
      route.abort();
    });
    await stubPaddleCheckout(page);
    await page.goto("/blank.html?billing_transaction_id=txn_returned");
    await page.evaluate(() => {
      window.__LLM_CROSSWORD_TEST__ = {};
    });
    await loadScript(page, "billing.js");

    const result = await page.evaluate(async () => {
      var billing = window.__LLM_CROSSWORD_TEST__.billing;
      var baseSummary = {
        activity: [],
        balance: null,
        client_token: "test_client_token",
        environment: "sandbox",
        packs: [{ code: "starter" }],
        portal_available: false,
        provider_code: "paddle",
      };
      var checkoutTransactionID = "txn_closed";
      var mode = "return-pending";
      var outcomes = {};

      function completedSummary(transactionID) {
        return {
          activity: [{
            event_id: "evt_" + transactionID,
            event_type: "transaction.completed",
            transaction_id: transactionID,
            status: "completed",
          }],
          balance: null,
          client_token: "test_client_token",
          environment: "sandbox",
          packs: [{ code: "starter" }],
          portal_available: false,
          provider_code: "paddle",
        };
      }

      function jsonResult(body) {
        return Promise.resolve({
          json: function () {
            return Promise.resolve(body);
          },
          ok: true,
          status: 200,
        });
      }

      window.fetch = function (url, options) {
        var normalizedURL = String(url);

        if (normalizedURL.indexOf("/api/billing/sync") >= 0) {
          return jsonResult({});
        }
        if (normalizedURL.indexOf("/api/billing/summary") >= 0) {
          if (mode === "invalid-summary") {
            return jsonResult({
              client_token: "",
              environment: "sandbox",
              provider_code: "paddle",
            });
          }
          if (mode === "sync-complete") {
            return jsonResult(completedSummary("txn_synced"));
          }
          if (mode === "sync-succeeded-no-activity") {
            return jsonResult(baseSummary);
          }
          if (mode === "overlay-complete") {
            return jsonResult(completedSummary("txn_completed"));
          }
          if (mode === "sync-succeeded-summary-error") {
            return Promise.reject(new Error("offline"));
          }
          if (mode === "sync-error") {
            return Promise.reject(new Error("offline"));
          }
          return jsonResult(baseSummary);
        }
        if (normalizedURL.indexOf("/api/billing/checkout/reconcile") >= 0) {
          return jsonResult({
            status: mode === "overlay-complete" || mode === "sync-succeeded-no-activity" || mode === "sync-succeeded-summary-error"
              ? "succeeded"
              : "pending",
            transaction_id: JSON.parse(options.body).transaction_id,
          });
        }
        if (normalizedURL.indexOf("/api/billing/checkout") >= 0) {
          return jsonResult({
            checkout_mode: "overlay",
            transaction_id: checkoutTransactionID,
          });
        }
        return Promise.reject(new Error("unexpected fetch " + normalizedURL));
      };

      outcomes.nullCallback = billing.normalizeCallback("not-a-function");
      window.BILLING_PROVIDER_SDK_URLS = { paddle: "https://sdk.local/success.js" };
      outcomes.customSDK = billing.resolveProviderSDKURL("paddle");
      outcomes.unknownSDK = billing.resolveProviderSDKURL("unknown");
      try {
        await billing.ensureScriptLoaded("");
      } catch (error) {
        outcomes.emptyScriptError = error.message;
      }

      window.BILLING_PROVIDER_SDK_URLS = { paddle: "https://sdk.local/invalid.js" };
      window.Paddle = { Checkout: { open: function () {} } };
      try {
        await billing.resolvePaddleClient();
      } catch (error) {
        outcomes.missingInitializeError = error.message;
      }

      window.Paddle = { Initialize: function () {} };
      try {
        await billing.resolvePaddleClient();
      } catch (error) {
        outcomes.missingCheckoutError = error.message;
      }

      delete window.Paddle;
      window.BILLING_PROVIDER_SDK_URLS = { paddle: "https://sdk.local/success.js" };
      await billing.ensureScriptLoaded("https://sdk.local/success.js");
      await billing.ensureScriptLoaded("https://sdk.local/success.js");

      delete window.Paddle;
      window.BILLING_PROVIDER_SDK_URLS = { paddle: "https://sdk.local/invalid.js" };
      try {
        await billing.resolvePaddleClient();
      } catch (error) {
        outcomes.invalidLoadedClientError = error.message;
      }

      delete window.Paddle;
      window.BILLING_PROVIDER_SDK_URLS = { paddle: "https://sdk.local/fail.js" };
      try {
        await billing.resolvePaddleClient();
      } catch (error) {
        outcomes.failedScriptError = error.message;
      }

      try {
        await billing.initializePaddleClient({});
      } catch (error) {
        outcomes.missingTokenError = error.message;
      }

      window.Paddle = {
        Initialized: true,
        Initialize: function (options) {
          outcomes.rotatedInitializeCount = (outcomes.rotatedInitializeCount || 0) + 1;
          outcomes.rotatedInitializeToken = options && options.token;
        },
        Checkout: {
          open: function () {},
        },
      };
      await billing.initializePaddleClient({
        client_token: "rotated_token",
        environment: "production",
      });

      window.Paddle = {
        Environment: {
          set: function (value) {
            outcomes.stateOnlyEnvironmentCalls = outcomes.stateOnlyEnvironmentCalls || [];
            outcomes.stateOnlyEnvironmentCalls.push(value);
          },
        },
        Initialize: function () {
          outcomes.stateOnlyInitializeCount = (outcomes.stateOnlyInitializeCount || 0) + 1;
        },
        Checkout: {
          open: function () {},
        },
      };
      await billing.initializePaddleClient({
        client_token: "state_only_token",
        environment: "",
      });
      await billing.initializePaddleClient({
        client_token: "state_only_token",
        environment: "",
      });
      await billing.initializePaddleClient({
        client_token: "state_only_rotated_token",
        environment: "production",
      });

      window.Paddle = {
        Initialize: function (options) {
          outcomes.noEnvironmentInitToken = options.token;
        },
        Checkout: {
          open: function () {},
        },
      };
      await billing.initializePaddleClient({
        client_token: "plain_token",
        environment: "",
      });

      window.Paddle = {
        Environment: {
          set: function () {},
        },
        Initialize: function () {},
        Checkout: {
          open: function () {},
        },
      };
      await billing.openPaddleCheckout({
        client_token: "open_token",
        environment: "sandbox",
      }, {
        checkout_mode: "overlay",
        transaction_id: "txn_top_level",
      }, {
        onClosed: "not-a-function",
        onCompleted: function (transactionID) {
          outcomes.topLevelTransactionID = transactionID;
        },
      });
      billing.handlePaddleCheckoutEvent({ name: "checkout.loaded" });
      billing.handlePaddleCheckoutEvent({
        name: "checkout.completed",
        transaction_id: "txn_top_level",
      });
      billing.handlePaddleCheckoutEvent({
        name: "checkout.closed",
        transactionId: "txn_top_level",
      });

      window.Paddle = {
        Environment: {
          set: function () {},
        },
        Initialize: function () {},
        Checkout: {
          open: function () {},
        },
      };
      await billing.openPaddleCheckout({
        client_token: "open_token",
        environment: "sandbox",
      }, {
        checkout_mode: "overlay",
        transaction_id: "txn_callback_fallback",
      }, {
        onClosed: function (transactionID) {
          outcomes.fallbackClosedTransactionID = transactionID;
        },
        onCompleted: "not-a-function",
      });
      billing.handlePaddleCheckoutEvent({
        name: "checkout.completed",
        data: {},
      });
      billing.handlePaddleCheckoutEvent({
        name: "checkout.closed",
        data: {},
      });

      window.Paddle = {
        Environment: {
          set: function () {},
        },
        Initialize: function () {},
        Checkout: {
          open: function () {
            throw new Error("open failed");
          },
        },
      };
      try {
        await billing.openPaddleCheckout({
          client_token: "open_token",
          environment: "sandbox",
        }, {
          checkout_mode: "hosted",
          transaction_id: "txn_invalid_mode",
        }, {
          onClosed: "not-a-function",
          onCompleted: "not-a-function",
        });
      } catch (error) {
        outcomes.invalidModeError = error.message;
      }
      try {
        await billing.openPaddleCheckout({
          client_token: "open_token",
          environment: "sandbox",
        }, {
          checkout_mode: "overlay",
        }, {
          onClosed: "not-a-function",
          onCompleted: "not-a-function",
        });
      } catch (error) {
        outcomes.missingTransactionError = error.message;
      }
      try {
        await billing.openPaddleCheckout({
          client_token: "open_token",
          environment: "sandbox",
        }, {
          checkout_mode: "overlay",
          transaction_id: "txn_throw",
        }, {
          onClosed: "not-a-function",
          onCompleted: "not-a-function",
        });
      } catch (error) {
        outcomes.openThrowError = error.message;
      }

      delete window.Paddle;
      delete window.BILLING_PROVIDER_SDK_URLS;
      await window.CrosswordBilling.setLoggedIn(true);
      outcomes.returnTransactionActive = window.CrosswordBilling.getState().activeTransactionId;
      billing.clearPollTimer();
      billing.setState({
        activeTransactionId: "",
        pollDeadlineTimestamp: 0,
        pollTimerId: null,
      });

      billing.setState({ loggedIn: false });
      await billing.syncClosedCheckout("");
      outcomes.blankClosedStatus = window.CrosswordBilling.getState().lastStatus;
      billing.setState({ loggedIn: true });

      window.history.replaceState({}, "", "/blank.html?billing_transaction_id=txn_clear");
      billing.clearReturnTransactionID();
      outcomes.clearedSearch = window.location.search;

      mode = "invalid-summary";
      try {
        await billing.requestCheckout("starter");
      } catch (error) {
        outcomes.invalidSummaryError = error.message;
      }

      mode = "closed-empty";
      checkoutTransactionID = "txn_closed";
      await billing.requestCheckout("starter");
      window.__emitPaddleEvent("checkout.closed", {
        data: {},
      });
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 0);
      });
      outcomes.closedStatus = window.CrosswordBilling.getState().lastStatus;

      mode = "overlay-complete";
      checkoutTransactionID = "txn_completed";
      await billing.requestCheckout("starter");
      window.__emitPaddleEvent("checkout.completed", {
        data: {},
      });
      window.__emitPaddleEvent("checkout.closed", {
        data: { transaction_id: "txn_completed" },
      });
      await new Promise(function (resolve) {
        window.setTimeout(resolve, 0);
      });
      outcomes.completedStatus = window.CrosswordBilling.getState().lastStatus;

      mode = "sync-complete";
      await billing.syncClosedCheckout("txn_synced");
      outcomes.syncedStatus = window.CrosswordBilling.getState().lastStatus;

      mode = "sync-succeeded-no-activity";
      await billing.syncClosedCheckout("txn_synced_no_activity");
      outcomes.syncSucceededNoActivityStatus = window.CrosswordBilling.getState().lastStatus;

      mode = "sync-succeeded-summary-error";
      await billing.syncClosedCheckout("txn_synced_summary_error");
      outcomes.syncSucceededSummaryErrorStatus = window.CrosswordBilling.getState().lastStatus;

      mode = "sync-error";
      await billing.syncClosedCheckout("txn_error");
      outcomes.syncErrorStatus = window.CrosswordBilling.getState().lastStatus;

      return outcomes;
    });

    expect(result.nullCallback).toBeNull();
    expect(result.customSDK).toBe("https://sdk.local/success.js");
    expect(result.unknownSDK).toBe("");
    expect(result.emptyScriptError).toBe("We couldn't start checkout.");
    expect(result.missingInitializeError).toBe("We couldn't start checkout.");
    expect(result.missingCheckoutError).toBe("We couldn't start checkout.");
    expect(result.invalidLoadedClientError).toBe("We couldn't start checkout.");
    expect(result.failedScriptError).toBe("We couldn't start checkout.");
    expect(result.missingTokenError).toBe("We couldn't start checkout.");
    expect(result.rotatedInitializeCount).toBe(1);
    expect(result.rotatedInitializeToken).toBe("rotated_token");
    expect(result.stateOnlyInitializeCount).toBe(2);
    expect(result.stateOnlyEnvironmentCalls).toEqual(["production"]);
    expect(result.noEnvironmentInitToken).toBe("plain_token");
    expect(result.topLevelTransactionID).toBe("txn_top_level");
    expect(result.fallbackClosedTransactionID).toBe("txn_callback_fallback");
    expect(result.invalidModeError).toBe("We couldn't start checkout.");
    expect(result.missingTransactionError).toBe("Checkout did not return a transaction.");
    expect(result.openThrowError).toBe("open failed");
    expect(result.returnTransactionActive).toBe("txn_returned");
    expect(result.blankClosedStatus).toEqual({
      isBusy: false,
      message: "Checkout closed before payment completed.",
      tone: "",
    });
    expect(result.clearedSearch).toBe("");
    expect(result.invalidSummaryError).toBe("We couldn't start checkout.");
    expect(result.closedStatus).toEqual({
      isBusy: false,
      message: "Checkout closed before payment completed.",
      tone: "",
    });
    expect(result.completedStatus).toEqual({
      isBusy: false,
      message: "Payment confirmed. Your credits are ready to use.",
      tone: "success",
    });
    expect(result.syncedStatus).toEqual({
      isBusy: false,
      message: "Payment confirmed. Your credits are ready to use.",
      tone: "success",
    });
    expect(result.syncSucceededNoActivityStatus).toEqual({
      isBusy: false,
      message: "Payment confirmed. Your credits are ready to use.",
      tone: "success",
    });
    expect(result.syncSucceededSummaryErrorStatus).toEqual({
      isBusy: false,
      message: "Payment confirmed. Your credits are ready to use.",
      tone: "success",
    });
    expect(result.syncErrorStatus).toEqual({
      isBusy: false,
      message: "Checkout closed before payment completed.",
      tone: "",
    });
    expect(successScriptLoads).toBe(1);
    expect(invalidScriptLoads).toBe(1);
    expect(failedScriptLoads).toBe(1);
  });

  test("covers app billing hooks and summary fallbacks", async ({ page }) => {
    await setupLoggedOutRoutes(page);
    await mountAppShell(page);
    await loadScript(page, "app.js");

    const result = await page.evaluate(async () => {
      var app = window.__LLM_CROSSWORD_TEST__.app;

      window.__billingOpenCalls = [];
      document.getElementById("shareBtn").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.getElementById("headerCreditBadge").dispatchEvent(new MouseEvent("click", { bubbles: true }));
      app.setLoggedIn(true);
      window.CrosswordBilling = {
        openAccountBilling: function (options) {
          window.__billingOpenCalls.push(options);
        },
      };
      app.openBillingDrawer();
      document.getElementById("headerCreditBadge").dispatchEvent(new MouseEvent("click", { bubbles: true }));

      delete window.CrosswordBilling;
      document.getElementById("headerCreditBadge").dispatchEvent(new MouseEvent("click", { bubbles: true }));

      app.showGenerateForm();
      document.getElementById("generateStatus").textContent = "Not enough credits right now";
      app.updateBalance({ coins: 5 });
      window.dispatchEvent(new CustomEvent("llm-crossword:billing-summary"));
      var generateStatus = document.getElementById("generateStatus").textContent;

      window.CrosswordBilling = {
        openAccountBilling: function (options) {
          window.__billingOpenCalls.push(options);
        },
        setLoggedIn: function () {
          return Promise.reject(new Error("sync failed"));
        },
      };
      app.setLoggedIn(false);
      document.dispatchEvent(new CustomEvent("mpr-ui:auth:authenticated"));
      await Promise.resolve();
      await Promise.resolve();

      return {
        billingOpenCalls: window.__billingOpenCalls.slice(),
        generateStatus: generateStatus,
        loggedIn: app.getState().loggedIn,
      };
    });

    expect(result.billingOpenCalls).toEqual([
      {
        force: true,
        message: "",
        source: "app",
      },
      {
        force: true,
        message: "",
        source: "header_credit_badge",
      },
    ]);
    expect(result.generateStatus).toBe("Credits updated. You can generate a new puzzle.");
    expect(result.loggedIn).toBe(true);
  });
});
