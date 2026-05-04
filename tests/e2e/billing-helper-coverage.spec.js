// @ts-check

const { test, expect } = require("./coverage-fixture");

async function loadBillingScript(page) {
  await page.addScriptTag({ url: "/js/billing.js" });
}

test.describe("Billing helper coverage", () => {
  test("covers billing helper fallback branches through the test hook", async ({ page }) => {
    await page.goto("/blank.html");
    await loadBillingScript(page);

    const result = await page.evaluate(async () => {
      var billing = window.__HECATE_TEST__.billing;
      var completionMessages = [];
      var statusMessages = [];
      var closedCount = 0;
      var noStream = null;
      var describeFromError = billing.describeBillingError({ data: { error: "error-value" } }, "fallback");
      var describeFromMessage = billing.describeBillingError({ data: { message: "message-value" } }, "fallback");
      var describeFallback = billing.describeBillingError({}, "fallback");
      var extractNull = await billing.extractErrorMessage(null, "fallback");
      var extractMissingText = await billing.extractErrorMessage({}, "fallback");
      var extractJsonMessage = await billing.extractErrorMessage(
        new Response(JSON.stringify({ message: "json-message" }), {
          headers: { "Content-Type": "application/json" },
          status: 500,
        }),
        "fallback"
      );
      var extractJsonTextFallback = await billing.extractErrorMessage(
        new Response("text-fallback", {
          headers: { "Content-Type": "application/json" },
          status: 500,
        }),
        "fallback"
      );
      var extractTextFallback = await billing.extractErrorMessage(
        new Response("plain-text-error", {
          headers: { "Content-Type": "text/plain" },
          status: 500,
        }),
        "fallback"
      );
      var loadSummaryMessage = "";
      var syncTextMessage = "";
      var syncJsonFallbackMessage = "";
      var emptyPackMessage = "";
      var missingTransactionMessage = "";
      var unsupportedProviderMessage = "";
      var portalTextMessage = "";
      var portalMissingURLMessage = "";
      var portalAssignedHash = "";
      var loggedInSummaryProvider = "";
      var streamClosedOnError = 0;

      window.addEventListener("hecate:billing-status", function (event) {
        statusMessages.push((event && event.detail && event.detail.message) || "");
      });
      window.addEventListener("hecate:billing-transaction-complete", function (event) {
        completionMessages.push((event && event.detail && event.detail.status) || "");
      });

      billing.setState({
        eventSource: {
          close: function () {
            closedCount += 1;
          },
        },
        loggedIn: false,
      });
      billing.closeBillingEventStream();
      billing.setState();
      await billing.requestBillingSync();

      window.EventSource = function () {
        throw new Error("event-source-unavailable");
      };
      billing.setState({
        eventSource: null,
        loggedIn: true,
      });
      noStream = billing.connectBillingEventStream();

      window.EventSource = function () {
        return {
          addEventListener: function () {},
          close: function () {
            streamClosedOnError += 1;
          },
        };
      };
      billing.setState({
        eventSource: null,
        loggedIn: true,
      });
      window.__billingStream = billing.connectBillingEventStream();
      billing.setState({
        eventSource: window.__billingStream,
        loggedIn: false,
      });
      window.__billingStream.onerror();

      window.authFetch = function () {
        return Promise.resolve(new Response(JSON.stringify({
          client_token: "token",
          environment: "sandbox",
          provider_code: "paddle",
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      billing.setState({
        eventSource: null,
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      await billing.handleBillingEventMessage({ data: "" });
      await billing.handleBillingEventMessage({ data: "{" });
      await billing.handleBillingEventMessage({
        data: JSON.stringify({
          event_type: "transaction.completed",
          status: "completed",
        }),
      });

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({ message: "Billing summary unavailable." }), {
            headers: { "Content-Type": "application/json" },
            status: 503,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      try {
        await billing.loadSummary({ force: true });
      } catch (error) {
        loadSummaryMessage = error && error.message ? error.message : "";
      }

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/sync") >= 0) {
          return Promise.resolve(new Response("sync text failure", {
            headers: { "Content-Type": "text/plain" },
            status: 502,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      try {
        await billing.requestBillingSync();
      } catch (error) {
        syncTextMessage = error && error.message ? error.message : "";
      }

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/sync") >= 0) {
          return Promise.resolve(new Response("sync json fallback", {
            headers: { "Content-Type": "application/json" },
            status: 502,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      try {
        await billing.requestBillingSync();
      } catch (error) {
        syncJsonFallbackMessage = error && error.message ? error.message : "";
      }

      try {
        await billing.requestCheckout(" ");
      } catch (error) {
        emptyPackMessage = error && error.message ? error.message : "";
      }

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({
            client_token: "token",
            environment: "sandbox",
            provider_code: "paddle",
          }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }));
        }
        if (String(url).indexOf("/api/billing/checkout") >= 0) {
          return Promise.resolve(new Response("{}", {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      billing.setState({ loggedIn: true, pendingSummaryRequest: null });
      try {
        await billing.requestCheckout("starter");
      } catch (error) {
        missingTransactionMessage = error && error.message ? error.message : "";
      }

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({
            client_token: "",
            environment: "sandbox",
            provider_code: "stripe",
          }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      billing.setState({ loggedIn: true, pendingSummaryRequest: null });
      try {
        await billing.requestCheckout("starter");
      } catch (error) {
        unsupportedProviderMessage = error && error.message ? error.message : "";
      }

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/portal") >= 0) {
          return Promise.resolve(new Response("portal text failure", {
            headers: { "Content-Type": "text/plain" },
            status: 502,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      try {
        await billing.requestPortalSession();
      } catch (error) {
        portalTextMessage = error && error.message ? error.message : "";
      }

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/portal") >= 0) {
          return Promise.resolve(new Response("{}", {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      try {
        await billing.requestPortalSession();
      } catch (error) {
        portalMissingURLMessage = error && error.message ? error.message : "";
      }

      window.open = function () {
        return null;
      };
      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/portal") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({
            url: "#billing-portal",
          }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      await billing.requestPortalSession();
      portalAssignedHash = window.location.hash;

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/sync") >= 0) {
          return Promise.reject(new Error("sync rejected"));
        }
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve(new Response(JSON.stringify({
            client_token: "token",
            environment: "sandbox",
            provider_code: "paddle",
          }), {
            headers: { "Content-Type": "application/json" },
            status: 200,
          }));
        }
        return Promise.resolve(new Response("{}", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }));
      };
      billing.setState({
        eventSource: null,
        loggedIn: false,
        pendingSummaryRequest: null,
      });
      loggedInSummaryProvider = (await billing.setLoggedIn(true)).provider_code;

      window.authFetch = function () {
        return Promise.resolve(new Response(JSON.stringify({ error: "summary failed" }), {
          headers: { "Content-Type": "application/json" },
          status: 503,
        }));
      };
      await billing.handleBillingEventMessage({
        data: JSON.stringify({
          event_type: "transaction.completed",
          status: "completed",
        }),
      });

      return {
        closedCount: closedCount,
        completionMessages: completionMessages,
        describeFallback: describeFallback,
        describeFromError: describeFromError,
        describeFromMessage: describeFromMessage,
        emptyPackMessage: emptyPackMessage,
        extractJsonMessage: extractJsonMessage,
        extractJsonTextFallback: extractJsonTextFallback,
        extractMissingText: extractMissingText,
        extractNull: extractNull,
        extractTextFallback: extractTextFallback,
        loadSummaryMessage: loadSummaryMessage,
        loggedInSummaryProvider: loggedInSummaryProvider,
        missingTransactionMessage: missingTransactionMessage,
        noStream: noStream,
        portalAssignedHash: portalAssignedHash,
        portalMissingURLMessage: portalMissingURLMessage,
        portalTextMessage: portalTextMessage,
        statusMessages: statusMessages,
        streamClosedOnError: streamClosedOnError,
        syncJsonFallbackMessage: syncJsonFallbackMessage,
        syncTextMessage: syncTextMessage,
        unsupportedProviderMessage: unsupportedProviderMessage,
      };
    });

    expect(result.describeFromError).toBe("error-value");
    expect(result.describeFromMessage).toBe("message-value");
    expect(result.describeFallback).toBe("fallback");
    expect(result.extractNull).toBe("fallback");
    expect(result.extractMissingText).toBe("fallback");
    expect(result.extractJsonMessage).toBe("json-message");
    expect(result.extractJsonTextFallback).toBe("text-fallback");
    expect(result.extractTextFallback).toBe("plain-text-error");
    expect(result.closedCount).toBe(1);
    expect(result.noStream).toBeNull();
    expect(result.loadSummaryMessage).toBe("Billing summary unavailable.");
    expect(result.syncTextMessage).toBe("sync text failure");
    expect(result.syncJsonFallbackMessage).toBe("sync json fallback");
    expect(result.emptyPackMessage).toBe("Choose a credit pack first.");
    expect(result.missingTransactionMessage).toBe("We couldn't start checkout.");
    expect(result.unsupportedProviderMessage).toBe("We couldn't start checkout.");
    expect(result.portalTextMessage).toBe("portal text failure");
    expect(result.portalMissingURLMessage).toBe("Billing portal did not return a URL.");
    expect(result.portalAssignedHash).toBe("#billing-portal");
    expect(result.loggedInSummaryProvider).toBe("paddle");
    expect(result.streamClosedOnError).toBe(1);
    expect(result.completionMessages).toEqual(["completed"]);
    expect(result.statusMessages).toContain("Billing summary unavailable.");
    expect(result.statusMessages).toContain("Payment confirmed. Your credits are ready to use.");
    expect(result.statusMessages).toContain("Payment confirmed. Refresh billing in a moment if credits do not appear.");
  });

  test("covers direct billing helper branches through the test hook", async ({ page }) => {
    await page.goto("/blank.html");
    await loadBillingScript(page);

    const result = await page.evaluate(async () => {
      var billing = window.__HECATE_TEST__.billing;
      var appendedScripts = [];
      var initCalls = 0;
      var envSetCalls = [];
      var openCalls = [];
      var completedCalls = 0;
      var closedCalls = 0;
      var customEventDetail = null;
      var envSetCountAfterInitialize = 0;
      var initCountAfterInitialize = 0;
      var statusMessages = [];
      var successScriptURL = "https://sdk.example/success.js";
      var secondSuccessScriptURL = "https://sdk.example/success-2.js";
      var failScriptURL = "https://sdk.example/fail.js";
      var normalizeCallbackFunction = false;
      var normalizeCallbackNull = false;

      function createValidPaddle(throwOnOpen) {
        return {
          Environment: {
            set: function (environment) {
              envSetCalls.push(environment);
            },
          },
          Initialize: function () {
            initCalls += 1;
          },
          Checkout: {
            open: function (options) {
              if (throwOnOpen) {
                throw new Error("open failed");
              }
              openCalls.push(options);
            },
          },
        };
      }

      document.head.appendChild = function (node) {
        appendedScripts.push(node.src);
        Promise.resolve().then(function () {
          if (node.src === failScriptURL) {
            node.onerror();
            return;
          }
          if (node.src === secondSuccessScriptURL) {
            window.Paddle = {};
            node.onload();
            return;
          }
          if (node.src === successScriptURL && typeof window.__nextPaddleFactory === "function") {
            window.Paddle = window.__nextPaddleFactory();
          }
          node.onload();
        });
        return node;
      };

      window.addEventListener("hecate:custom-event", function (event) {
        customEventDetail = event.detail;
      });
      window.addEventListener("hecate:billing-status", function (event) {
        statusMessages.push((event && event.detail && event.detail.message) || "");
      });

      billing.dispatchBillingEvent("custom-event");
      billing.updateBillingStatus();

      window.BILLING_PROVIDER_SDK_URLS = {
        other: "https://sdk.example/other.js",
        paddle: successScriptURL,
      };
      normalizeCallbackFunction = typeof billing.normalizeCallback(function namedCallback() {}) === "function";
      normalizeCallbackNull = billing.normalizeCallback("not-a-function") === null;

      var blankScriptError = "";
      var failScriptError = "";
      var invalidPaddleError = "";
      var missingTokenError = "";
      var unsupportedModeError = "";
      var missingTransactionError = "";
      var thrownOpenError = "";
      var extractJsonNoText = "";
      var extractJsonRejectedText = "";
      var extractTextRejected = "";

      try {
        await billing.ensureScriptLoaded(" ");
      } catch (error) {
        blankScriptError = error.message;
      }

      var cachedPromiseA = billing.ensureScriptLoaded(successScriptURL);
      var cachedPromiseB = billing.ensureScriptLoaded(successScriptURL);
      await cachedPromiseA;
      await cachedPromiseB;

      try {
        await billing.ensureScriptLoaded(failScriptURL);
      } catch (error) {
        failScriptError = error.message;
      }

      window.Paddle = createValidPaddle(false);
      var resolvedExistingPaddle = (await billing.resolvePaddleClient()) === window.Paddle;

      window.BILLING_PROVIDER_SDK_URLS.paddle = secondSuccessScriptURL;
      window.Paddle = null;
      try {
        await billing.resolvePaddleClient();
      } catch (error) {
        invalidPaddleError = error.message;
      }

      try {
        await billing.initializePaddleClient({});
      } catch (error) {
        missingTokenError = error.message;
      }

      window.BILLING_PROVIDER_SDK_URLS.paddle = successScriptURL;
      window.Paddle = createValidPaddle(false);
      initCalls = 0;
      envSetCalls = [];
      await billing.initializePaddleClient({
        client_token: "token",
        environment: "",
      });
      await billing.initializePaddleClient({
        client_token: "token",
        environment: "sandbox",
      });
      await billing.initializePaddleClient({
        client_token: "token",
        environment: "sandbox",
      });
      await billing.initializePaddleClient({
        client_token: "token-2",
        environment: "sandbox",
      });
      envSetCountAfterInitialize = envSetCalls.length;
      initCountAfterInitialize = initCalls;

      try {
        await billing.openPaddleCheckout(
          { client_token: "token-3", environment: "sandbox" },
          { checkout_mode: "redirect", transaction_id: "tx-mode" }
        );
      } catch (error) {
        unsupportedModeError = error.message;
      }

      try {
        await billing.openPaddleCheckout(
          { client_token: "token-3", environment: "sandbox" },
          { checkout_mode: "overlay", transaction_id: "" }
        );
      } catch (error) {
        missingTransactionError = error.message;
      }

      window.Paddle = createValidPaddle(true);
      try {
        await billing.openPaddleCheckout(
          { client_token: "token-throw", environment: "sandbox" },
          { checkout_mode: "overlay", transaction_id: "tx-throw" }
        );
      } catch (error) {
        thrownOpenError = error.message;
      }

      window.Paddle = createValidPaddle(false);
      openCalls = [];
      completedCalls = 0;
      closedCalls = 0;
      await billing.openPaddleCheckout(
        { client_token: "token-complete", environment: "sandbox" },
        { checkout_mode: "overlay", transaction_id: "tx-complete" },
        {
          onCompleted: function () {
            completedCalls += 1;
          },
        }
      );
      billing.handlePaddleCheckoutEvent({ name: "ignored.event" });
      billing.handlePaddleCheckoutEvent({ name: "checkout.completed", data: { transaction_id: "wrong" } });
      billing.handlePaddleCheckoutEvent({ name: "checkout.completed", data: { transaction_id: "tx-complete" } });

      await billing.openPaddleCheckout(
        { client_token: "token-close", environment: "sandbox" },
        { checkout_mode: "overlay", transaction_id: "tx-close" },
        {
          onClosed: function () {
            closedCalls += 1;
          },
        }
      );
      billing.handlePaddleCheckoutEvent({ name: "checkout.closed", transactionId: "tx-close" });

      var eventMessageEmpty = billing.normalizeBillingEventMessage({ data: "" });
      var eventMessageInvalid = billing.normalizeBillingEventMessage({ data: "{" });
      var eventMessageValid = billing.normalizeBillingEventMessage({
        data: JSON.stringify({
          event_type: "transaction.completed",
          status: "completed",
        }),
      });

      extractJsonNoText = await billing.extractErrorMessage({
        headers: {
          get: function () {
            return "application/json";
          },
        },
        clone: function () {
          return {
            json: function () {
              return Promise.reject(new Error("invalid-json"));
            },
          };
        },
      }, "fallback");

      extractJsonRejectedText = await billing.extractErrorMessage({
        headers: {
          get: function () {
            return "application/json";
          },
        },
        clone: function () {
          return {
            json: function () {
              return Promise.reject(new Error("invalid-json"));
            },
            text: function () {
              return Promise.reject(new Error("text-failed"));
            },
          };
        },
      }, "fallback");

      extractTextRejected = await billing.extractErrorMessage({
        text: function () {
          return Promise.reject(new Error("text-failed"));
        },
      }, "fallback");

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve({
            ok: true,
            json: function () {
              return Promise.reject(new Error("invalid-json"));
            },
          });
        }
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({});
          },
        });
      };
      billing.setState({
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      var okSummary = await billing.loadSummary({ force: true, suppressErrors: true });

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/summary") >= 0) {
          return Promise.resolve({
            headers: {
              get: function () {
                return "application/json";
              },
            },
            ok: false,
            status: 401,
            json: function () {
              return Promise.resolve({ ignored: true });
            },
          });
        }
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({});
          },
        });
      };
      billing.setState({
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      var unauthorizedSummary = await billing.loadSummary({ force: true, suppressErrors: true });

      window.authFetch = function (url) {
        if (String(url).indexOf("/api/billing/sync") >= 0) {
          return Promise.resolve({
            headers: {
              get: function () {
                return "application/json";
              },
            },
            ok: false,
            status: 401,
            json: function () {
              return Promise.resolve({ ok: false, retried: true });
            },
          });
        }
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({});
          },
        });
      };
      billing.setState({ loggedIn: true });
      var unauthorizedSync = await billing.requestBillingSync();

      window.EventSource = function () {
        return {
          addEventListener: function () {},
          close: function () {},
        };
      };
      window.authFetch = function () {
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({
              balance: {
                available_cents: 400,
                currency: "USD",
              },
              client_token: "token-open",
              environment: "sandbox",
              provider_code: "paddle",
            });
          },
        });
      };
      billing.setState({
        eventSource: null,
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      var openedSummary = await billing.openAccountBilling({
        force: true,
        isBusy: true,
        message: "Open billing",
        tone: "info",
      });

      return {
        blankScriptError: blankScriptError,
        cachedPromiseSame: cachedPromiseA === cachedPromiseB,
        closedCalls: closedCalls,
        completedCalls: completedCalls,
        customEventDetail: customEventDetail,
        envSetCountAfterInitialize: envSetCountAfterInitialize,
        envSetCalls: envSetCalls.slice(),
        eventMessageEmpty: eventMessageEmpty,
        eventMessageInvalid: eventMessageInvalid,
        eventMessageValid: eventMessageValid,
        extractJsonNoText: extractJsonNoText,
        extractJsonRejectedText: extractJsonRejectedText,
        extractTextRejected: extractTextRejected,
        failScriptError: failScriptError,
        initCountAfterInitialize: initCountAfterInitialize,
        initCalls: initCalls,
        invalidPaddleError: invalidPaddleError,
        missingTokenError: missingTokenError,
        missingTransactionError: missingTransactionError,
        normalizeCallbackFunction: normalizeCallbackFunction,
        normalizeCallbackNull: normalizeCallbackNull,
        normalizedSummaryProvider: billing.normalizeSummary({ provider_code: 123 }).provider_code,
        okSummaryPacksLength: okSummary.packs.length,
        openCalls: openCalls.slice(),
        openedSummaryProvider: openedSummary.provider_code,
        resolvedExistingPaddle: resolvedExistingPaddle,
        sdkOther: billing.resolveProviderSDKURL("other"),
        sdkUnknown: billing.resolveProviderSDKURL("unknown"),
        statusMessages: statusMessages,
        thrownOpenError: thrownOpenError,
        unauthorizedSummaryBalance: unauthorizedSummary.balance,
        unauthorizedSync: unauthorizedSync,
        unsupportedModeError: unsupportedModeError,
      };
    });

    expect(result.customEventDetail).toEqual({});
    expect(result.statusMessages).toContain("");
    expect(result.blankScriptError).toBe("We couldn't start checkout.");
    expect(result.cachedPromiseSame).toBe(true);
    expect(result.failScriptError).toBe("We couldn't start checkout.");
    expect(result.normalizeCallbackFunction).toBe(true);
    expect(result.normalizeCallbackNull).toBe(true);
    expect(result.sdkOther).toBe("https://sdk.example/other.js");
    expect(result.sdkUnknown).toBe("");
    expect(result.resolvedExistingPaddle).toBe(true);
    expect(result.invalidPaddleError).toBe("We couldn't start checkout.");
    expect(result.missingTokenError).toBe("We couldn't start checkout.");
    expect(result.envSetCountAfterInitialize).toBe(3);
    expect(result.initCountAfterInitialize).toBe(3);
    expect(result.unsupportedModeError).toBe("We couldn't start checkout.");
    expect(result.missingTransactionError).toBe("Checkout did not return a transaction.");
    expect(result.thrownOpenError).toBe("open failed");
    expect(result.openCalls).toEqual([
      { transactionId: "tx-complete" },
      { transactionId: "tx-close" },
    ]);
    expect(result.completedCalls).toBe(1);
    expect(result.closedCalls).toBe(1);
    expect(result.eventMessageEmpty).toEqual({ event_type: "", status: "" });
    expect(result.eventMessageInvalid).toEqual({ event_type: "", status: "" });
    expect(result.eventMessageValid).toEqual({ event_type: "transaction.completed", status: "completed" });
    expect(result.extractJsonNoText).toBe("fallback");
    expect(result.extractJsonRejectedText).toBe("fallback");
    expect(result.extractTextRejected).toBe("fallback");
    expect(result.okSummaryPacksLength).toBe(0);
    expect(result.unauthorizedSummaryBalance).toBeNull();
    expect(result.unauthorizedSync).toEqual({ ok: false, retried: true });
    expect(result.openedSummaryProvider).toBe("paddle");
    expect(result.statusMessages).toContain("Open billing");
    expect(result.normalizedSummaryProvider).toBe("");
  });

  test("covers remaining billing branch variants through the test hook", async ({ page }) => {
    await page.goto("/blank.html");
    await loadBillingScript(page);

    const result = await page.evaluate(async () => {
      var billing = window.__HECATE_TEST__.billing;
      var statusMessages = [];
      var completedTransactionID = "";
      var activeFallbackTransactionID = "";
      var completionCount = 0;
      var openCalls = [];

      function createValidPaddle() {
        return {
          Environment: {
            set: function () {},
          },
          Initialize: function () {},
          Checkout: {
            open: function (options) {
              openCalls.push(options);
            },
          },
        };
      }

      window.addEventListener("hecate:billing-status", function (event) {
        statusMessages.push((event && event.detail && event.detail.message) || "");
      });

      document.head.appendChild = function (node) {
        Promise.resolve().then(function () {
          window.Paddle = {
            Initialize: function () {},
          };
          node.onload();
        });
        return node;
      };
      window.BILLING_PROVIDER_SDK_URLS = {
        paddle: "https://sdk.example/missing-checkout.js",
      };
      window.Paddle = null;
      var missingCheckoutError = "";
      try {
        await billing.resolvePaddleClient();
      } catch (error) {
        missingCheckoutError = error.message;
      }

      window.Paddle = createValidPaddle();
      await billing.openPaddleCheckout(
        { client_token: "token-data-id", environment: "sandbox" },
        { checkout_mode: "overlay", transaction_id: "tx-data-id" },
        {
          onCompleted: function (transactionID) {
            completedTransactionID = transactionID;
            completionCount += 1;
          },
        }
      );
      billing.handlePaddleCheckoutEvent({
        name: "checkout.completed",
        data: { transactionId: "tx-data-id" },
      });

      await billing.openPaddleCheckout(
        { client_token: "token-active-id", environment: "sandbox" },
        { checkout_mode: "overlay", transaction_id: "tx-active-id" },
        {
          onCompleted: function (transactionID) {
            activeFallbackTransactionID = transactionID;
            completionCount += 1;
          },
        }
      );
      billing.handlePaddleCheckoutEvent({ name: "checkout.completed" });
      billing.handlePaddleCheckoutEvent({ name: "checkout.completed" });

      await billing.openPaddleCheckout(
        { client_token: "token-close-id", environment: "sandbox" },
        { checkout_mode: "overlay", transaction_id: "tx-close-id" }
      );
      billing.handlePaddleCheckoutEvent({
        name: "checkout.closed",
        transactionId: "tx-close-id",
      });

      var normalizeSummaryFromNull = billing.normalizeSummary(null);
      var normalizeBillingEventFromNull = billing.normalizeBillingEventMessage(null);
      var extractJsonEmptyText = await billing.extractErrorMessage({
        headers: {
          get: function () {
            return "application/json";
          },
        },
        clone: function () {
          return {
            json: function () {
              return Promise.reject(new Error("invalid-json"));
            },
            text: function () {
              return Promise.resolve("");
            },
          };
        },
      }, "fallback");
      var extractTextEmpty = await billing.extractErrorMessage({
        text: function () {
          return Promise.resolve("");
        },
      }, "fallback");

      billing.setState({
        loggedIn: false,
        pendingSummaryRequest: null,
      });
      var defaultOpenSummary = await billing.openAccountBilling();
      var defaultLoadSummary = await billing.loadSummary();

      window.authFetch = function () {
        return Promise.reject({});
      };
      billing.setState({
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      try {
        await billing.loadSummary({ force: true });
      } catch (error) {}

      window.authFetch = function () {
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve(null);
          },
        });
      };
      billing.setState({ loggedIn: true });
      var syncOkNull = await billing.requestBillingSync();

      window.authFetch = function () {
        return Promise.resolve({
          headers: {
            get: function () {
              return "application/json";
            },
          },
          ok: false,
          status: 401,
          json: function () {
            return Promise.resolve(null);
          },
        });
      };
      var syncUnauthorizedNull = await billing.requestBillingSync();

      window.authFetch = function () {
        return Promise.reject(new Error("no-summary"));
      };
      billing.setState({
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      await billing.handleBillingEventMessage({
        data: JSON.stringify({
          event_type: "checkout.started",
          status: "pending",
        }),
      });

      window.EventSource = function () {
        return {
          close: function () {},
          onerror: null,
          onmessage: null,
        };
      };
      billing.setState({
        eventSource: null,
        loggedIn: true,
      });
      var stream = billing.connectBillingEventStream();

      window.authFetch = function () {
        return Promise.reject({});
      };
      billing.setState({
        loggedIn: true,
        pendingSummaryRequest: null,
      });
      try {
        await billing.requestCheckout("starter");
      } catch (error) {}
      try {
        await billing.requestPortalSession();
      } catch (error) {}

      return {
        activeFallbackTransactionID: activeFallbackTransactionID,
        completedTransactionID: completedTransactionID,
        completionCount: completionCount,
        defaultLoadSummaryProvider: defaultLoadSummary.provider_code,
        defaultOpenSummaryProvider: defaultOpenSummary.provider_code,
        extractJsonEmptyText: extractJsonEmptyText,
        extractTextEmpty: extractTextEmpty,
        missingCheckoutError: missingCheckoutError,
        normalizeBillingEventFromNull: normalizeBillingEventFromNull,
        normalizeSummaryFromNullProvider: normalizeSummaryFromNull.provider_code,
        openCalls: openCalls.slice(),
        statusMessages: statusMessages,
        streamHasOnMessage: typeof stream.onmessage === "function",
        syncOkNull: syncOkNull,
        syncUnauthorizedNull: syncUnauthorizedNull,
      };
    });

    expect(result.missingCheckoutError).toBe("We couldn't start checkout.");
    expect(result.completedTransactionID).toBe("tx-data-id");
    expect(result.activeFallbackTransactionID).toBe("tx-active-id");
    expect(result.completionCount).toBe(2);
    expect(result.normalizeSummaryFromNullProvider).toBe("");
    expect(result.normalizeBillingEventFromNull).toEqual({ event_type: "", status: "" });
    expect(result.extractJsonEmptyText).toBe("fallback");
    expect(result.extractTextEmpty).toBe("fallback");
    expect(result.defaultOpenSummaryProvider).toBe("");
    expect(result.defaultLoadSummaryProvider).toBe("");
    expect(result.syncOkNull).toEqual({});
    expect(result.syncUnauthorizedNull).toEqual({});
    expect(result.streamHasOnMessage).toBe(true);
    expect(result.openCalls).toEqual([
      { transactionId: "tx-data-id" },
      { transactionId: "tx-active-id" },
      { transactionId: "tx-close-id" },
    ]);
    expect(result.statusMessages).toContain("We couldn't load billing right now.");
    expect(result.statusMessages).toContain("We couldn't start checkout.");
    expect(result.statusMessages).toContain("We couldn't open billing right now.");
  });
});
