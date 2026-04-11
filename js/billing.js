// @ts-check
/* billing.js — credit-pack checkout coordinator */
(function () {
  "use strict";

  var services = window.LLMCrosswordServices || null;
  var billingProviderPaddle = "paddle";
  var billingCheckoutModeOverlay = "overlay";
  var completedTransactionEventType = "transaction.completed";
  var defaultPaddleSDKUrl = "https://cdn.paddle.com/paddle/v2/paddle.js";
  var completedTransactionStatus = "completed";
  var paddleEventCheckoutClosed = "checkout.closed";
  var paddleEventCheckoutCompleted = "checkout.completed";
  var loadedScriptPromises = {};
  var paddleInitializationState = {
    token: "",
    environment: "",
  };
  var paddleCheckoutEventState = {
    closureNotified: false,
    completionNotified: false,
    onClosed: null,
    onCompleted: null,
    transactionID: "",
  };

  function buildApiUrl(path) {
    if (services && typeof services.buildApiUrl === "function") {
      return services.buildApiUrl(path);
    }
    return path;
  }

  var billingSummaryPath = buildApiUrl("/api/billing/summary");
  var billingEventsPath = buildApiUrl("/api/billing/events");
  var billingSyncPath = buildApiUrl("/api/billing/sync");
  var billingCheckoutPath = buildApiUrl("/api/billing/checkout");
  var billingPortalPath = buildApiUrl("/api/billing/portal");

  var state = {
    eventSource: null,
    lastStatus: null,
    loggedIn: false,
    pendingSummaryRequest: null,
    summary: createEmptySummary(),
  };

  function createEmptySummary() {
    return {
      client_token: "",
      environment: "",
      provider_code: "",
      balance: null,
      packs: [],
      activity: [],
      portal_available: false,
    };
  }

  function getFetcher() {
    return window.authFetch || window.fetch.bind(window);
  }

  function dispatchBillingEvent(name, detail) {
    window.dispatchEvent(new CustomEvent("llm-crossword:" + name, {
      detail: detail || {},
    }));
  }

  function updateBillingStatus(message, tone, isBusy) {
    state.lastStatus = {
      isBusy: isBusy === true,
      message: message || "",
      tone: tone || "",
    };
    dispatchBillingEvent("billing-status", state.lastStatus);
  }

  function parseJSONResponse(response) {
    return response.json().catch(function () {
      return {};
    });
  }

  function normalizeString(candidate) {
    if (typeof candidate !== "string") {
      return "";
    }
    return candidate.trim();
  }

  function normalizeCallback(callback) {
    if (typeof callback !== "function") {
      return null;
    }
    return callback;
  }

  function resolveProviderCode(summary) {
    return normalizeString(summary && summary.provider_code).toLowerCase();
  }

  function resolveProviderSDKURL(providerCode) {
    var configuredSDKURLs;
    var configuredURL;

    configuredSDKURLs = window.BILLING_PROVIDER_SDK_URLS;
    if (configuredSDKURLs && typeof configuredSDKURLs === "object") {
      configuredURL = normalizeString(configuredSDKURLs[providerCode]);
      if (configuredURL) {
        return configuredURL;
      }
    }
    if (providerCode === billingProviderPaddle) {
      return defaultPaddleSDKUrl;
    }
    return "";
  }

  function ensureScriptLoaded(scriptURL) {
    var normalizedURL = normalizeString(scriptURL);

    if (!normalizedURL) {
      return Promise.reject(new Error("We couldn't start checkout."));
    }
    if (loadedScriptPromises[normalizedURL]) {
      return loadedScriptPromises[normalizedURL];
    }

    loadedScriptPromises[normalizedURL] = new Promise(function (resolve, reject) {
      var script = document.createElement("script");

      script.async = true;
      script.src = normalizedURL;
      script.onload = function () {
        resolve();
      };
      script.onerror = function () {
        delete loadedScriptPromises[normalizedURL];
        reject(new Error("We couldn't start checkout."));
      };
      document.head.appendChild(script);
    });

    return loadedScriptPromises[normalizedURL];
  }

  function hasValidPaddleClient(paddle) {
    if (!paddle || typeof paddle !== "object") {
      return false;
    }
    if (typeof paddle.Initialize !== "function") {
      return false;
    }
    if (!paddle.Checkout || typeof paddle.Checkout.open !== "function") {
      return false;
    }
    return true;
  }

  function resolvePaddleClient() {
    if (hasValidPaddleClient(window.Paddle)) {
      return Promise.resolve(window.Paddle);
    }

    return ensureScriptLoaded(resolveProviderSDKURL(billingProviderPaddle))
      .then(function () {
        if (!hasValidPaddleClient(window.Paddle)) {
          throw new Error("We couldn't start checkout.");
        }
        return window.Paddle;
      });
  }

  function clearPaddleCheckoutEventState() {
    paddleCheckoutEventState.transactionID = "";
    paddleCheckoutEventState.onCompleted = null;
    paddleCheckoutEventState.onClosed = null;
    paddleCheckoutEventState.completionNotified = false;
    paddleCheckoutEventState.closureNotified = false;
  }

  function setPaddleCheckoutEventState(transactionID, onCompleted, onClosed) {
    paddleCheckoutEventState.transactionID = normalizeString(transactionID);
    paddleCheckoutEventState.onCompleted = normalizeCallback(onCompleted);
    paddleCheckoutEventState.onClosed = normalizeCallback(onClosed);
    paddleCheckoutEventState.completionNotified = false;
    paddleCheckoutEventState.closureNotified = false;
  }

  function resolvePaddleCheckoutEventTransactionID(eventData) {
    var fromData = normalizeString(
      eventData && eventData.data && (eventData.data.transaction_id || eventData.data.transactionId)
    );

    if (fromData) {
      return fromData;
    }
    return normalizeString(eventData && (eventData.transaction_id || eventData.transactionId));
  }

  function handlePaddleCheckoutEvent(eventData) {
    var activeTransactionID;
    var eventName;
    var eventTransactionID;
    var resolvedTransactionID;

    eventName = normalizeString(eventData && eventData.name).toLowerCase();
    if (eventName !== paddleEventCheckoutCompleted && eventName !== paddleEventCheckoutClosed) {
      return;
    }

    activeTransactionID = paddleCheckoutEventState.transactionID;
    eventTransactionID = resolvePaddleCheckoutEventTransactionID(eventData);
    if (activeTransactionID && eventTransactionID && eventTransactionID !== activeTransactionID) {
      return;
    }
    resolvedTransactionID = eventTransactionID || activeTransactionID;

    if (eventName === paddleEventCheckoutCompleted) {
      if (!paddleCheckoutEventState.completionNotified && paddleCheckoutEventState.onCompleted) {
        paddleCheckoutEventState.onCompleted(resolvedTransactionID);
      }
      paddleCheckoutEventState.completionNotified = true;
      return;
    }

    if (!paddleCheckoutEventState.closureNotified && paddleCheckoutEventState.onClosed) {
      paddleCheckoutEventState.onClosed(resolvedTransactionID);
    }
    paddleCheckoutEventState.closureNotified = true;
    clearPaddleCheckoutEventState();
  }

  function initializePaddleClient(summary) {
    var clientToken = normalizeString(summary && summary.client_token);
    var environment = normalizeString(summary && summary.environment).toLowerCase();

    if (!clientToken) {
      return Promise.reject(new Error("We couldn't start checkout."));
    }

    return resolvePaddleClient()
      .then(function (paddle) {
        if (paddle.Environment && typeof paddle.Environment.set === "function" && environment) {
          paddle.Environment.set(environment);
        }
        if (
          paddleInitializationState.token !== clientToken ||
          paddleInitializationState.environment !== environment
        ) {
          paddle.Initialize({
            eventCallback: handlePaddleCheckoutEvent,
            token: clientToken,
          });
          paddleInitializationState.token = clientToken;
          paddleInitializationState.environment = environment;
        }
        return paddle;
      });
  }

  function openPaddleCheckout(summary, checkoutSession, options) {
    var checkoutMode = normalizeString(checkoutSession && checkoutSession.checkout_mode).toLowerCase();
    var transactionID = normalizeString(checkoutSession && checkoutSession.transaction_id);
    var onClosed = normalizeCallback(options && options.onClosed);
    var onCompleted = normalizeCallback(options && options.onCompleted);

    if (checkoutMode && checkoutMode !== billingCheckoutModeOverlay) {
      return Promise.reject(new Error("We couldn't start checkout."));
    }
    if (!transactionID) {
      return Promise.reject(new Error("Checkout did not return a transaction."));
    }

    return initializePaddleClient(summary)
      .then(function (paddle) {
        setPaddleCheckoutEventState(transactionID, onCompleted, onClosed);
        try {
          paddle.Checkout.open({
            transactionId: transactionID,
          });
        } catch (error) {
          clearPaddleCheckoutEventState();
          throw error;
        }
      });
  }

  function normalizeSummary(rawSummary) {
    var summary = rawSummary && typeof rawSummary === "object" ? rawSummary : {};

    return {
      client_token: normalizeString(summary.client_token),
      environment: normalizeString(summary.environment).toLowerCase(),
      provider_code: typeof summary.provider_code === "string" ? summary.provider_code : "",
      balance: summary.balance || null,
      packs: Array.isArray(summary.packs) ? summary.packs : [],
      activity: Array.isArray(summary.activity) ? summary.activity : [],
      portal_available: summary.portal_available === true,
    };
  }

  function applySummary(rawSummary) {
    state.summary = normalizeSummary(rawSummary);
    dispatchBillingEvent("billing-summary", state.summary);
    return state.summary;
  }

  function describeBillingError(result, fallbackMessage) {
    if (result && result.data && typeof result.data.error === "string" && result.data.error.trim() !== "") {
      return result.data.error.trim();
    }
    if (result && result.data && typeof result.data.message === "string" && result.data.message.trim() !== "") {
      return result.data.message.trim();
    }
    return fallbackMessage;
  }

  function extractErrorMessage(response, fallbackMessage) {
    var contentType = "";
    var jsonClone = null;
    var textClone = null;

    if (!response) {
      return Promise.resolve(fallbackMessage);
    }

    if (response.headers && typeof response.headers.get === "function") {
      contentType = normalizeString(response.headers.get("Content-Type")).toLowerCase();
    }
    if (typeof response.clone === "function") {
      jsonClone = response.clone();
      textClone = response.clone();
    } else {
      textClone = response;
    }

    if (contentType.indexOf("application/json") !== -1 && jsonClone) {
      return jsonClone.json()
        .then(function (data) {
          return describeBillingError({ data: data }, fallbackMessage);
        })
        .catch(function () {
          if (!textClone || typeof textClone.text !== "function") {
            return fallbackMessage;
          }
          return textClone.text()
            .then(function (text) {
              var normalizedText = normalizeString(text);
              return normalizedText || fallbackMessage;
            })
            .catch(function () {
              return fallbackMessage;
            });
        });
    }

    if (!textClone || typeof textClone.text !== "function") {
      return Promise.resolve(fallbackMessage);
    }

    return textClone.text()
      .then(function (text) {
        var normalizedText = normalizeString(text);
        return normalizedText || fallbackMessage;
      })
      .catch(function () {
        return fallbackMessage;
      });
  }

  function loadSummary(options) {
    var loadOptions = options || {};
    var fetcher = getFetcher();

    if (!state.loggedIn) {
      return Promise.resolve(applySummary(createEmptySummary()));
    }
    if (state.pendingSummaryRequest && loadOptions.force !== true) {
      return state.pendingSummaryRequest;
    }

    state.pendingSummaryRequest = fetcher(billingSummaryPath, {
      cache: "no-store",
      credentials: "include",
    })
      .then(function (response) {
        if (response.ok) {
          return parseJSONResponse(response).then(function (data) {
            return applySummary(data);
          });
        }
        if (response.status === 401 || response.status === 403) {
          return applySummary(createEmptySummary());
        }
        return extractErrorMessage(response, "We couldn't load billing right now.")
          .then(function (message) {
            throw new Error(message);
          });
      })
      .catch(function (error) {
        if (loadOptions.suppressErrors !== true) {
          updateBillingStatus(error.message || "We couldn't load billing right now.", "error", false);
        }
        throw error;
      })
      .finally(function () {
        state.pendingSummaryRequest = null;
      });

    return state.pendingSummaryRequest;
  }

  function requestBillingSync() {
    var fetcher = getFetcher();

    if (!state.loggedIn) {
      return Promise.resolve({ ok: true });
    }

    return fetcher(billingSyncPath, {
      credentials: "include",
      method: "POST",
    })
      .then(function (response) {
        if (response.ok) {
          return parseJSONResponse(response).then(function (data) {
            return data || {};
          });
        }
        if (response.status === 401 || response.status === 403) {
          return parseJSONResponse(response).then(function (data) {
            return data || {};
          });
        }
        return extractErrorMessage(response, "We couldn't refresh billing right now.")
          .then(function (message) {
            throw new Error(message);
          });
      });
  }

  function normalizeBillingEventMessage(rawMessage) {
    var message = rawMessage && typeof rawMessage === "object" ? rawMessage : {};
    var parsedMessage;

    if (typeof message.data !== "string" || message.data.trim() === "") {
      return {
        event_type: "",
        status: "",
      };
    }

    try {
      parsedMessage = JSON.parse(message.data);
    } catch {
      return {
        event_type: "",
        status: "",
      };
    }

    return {
      event_type: normalizeString(parsedMessage && parsedMessage.event_type).toLowerCase(),
      status: normalizeString(parsedMessage && parsedMessage.status).toLowerCase(),
    };
  }

  function closeBillingEventStream() {
    var eventSource = state.eventSource;

    if (eventSource && typeof eventSource.close === "function") {
      eventSource.close();
    }
    state.eventSource = null;
  }

  function handleBillingEventMessage(rawMessage) {
    var billingEvent = normalizeBillingEventMessage(rawMessage);
    var isCompletedEvent = billingEvent.event_type === completedTransactionEventType ||
      billingEvent.status === completedTransactionStatus;

    return loadSummary({ force: true, suppressErrors: true })
      .then(function (summary) {
        if (!isCompletedEvent) {
          return summary;
        }
        updateBillingStatus("Payment confirmed. Your credits are ready to use.", "success", false);
        dispatchBillingEvent("billing-transaction-complete", {
          event_type: billingEvent.event_type,
          status: billingEvent.status,
          summary: summary,
        });
        return summary;
      })
      .catch(function () {
        if (isCompletedEvent) {
          updateBillingStatus("Payment confirmed. Refresh billing in a moment if credits do not appear.", "", false);
        }
      });
  }

  function connectBillingEventStream() {
    var eventSource;

    if (!state.loggedIn || state.eventSource || typeof window.EventSource !== "function") {
      return null;
    }

    try {
      eventSource = new window.EventSource(billingEventsPath, { withCredentials: true });
    } catch {
      return null;
    }

    state.eventSource = eventSource;
    if (typeof eventSource.addEventListener === "function") {
      eventSource.addEventListener("billing", handleBillingEventMessage);
    }
    eventSource.onmessage = handleBillingEventMessage;
    eventSource.onerror = function () {
      if (!state.loggedIn) {
        closeBillingEventStream();
      }
    };

    return eventSource;
  }

  function requestCheckout(packID) {
    var normalizedPackID = normalizeString(packID).toLowerCase();
    var fetcher = getFetcher();

    if (!normalizedPackID) {
      updateBillingStatus("Choose a credit pack first.", "error", false);
      return Promise.reject(new Error("Choose a credit pack first."));
    }

    updateBillingStatus("Opening secure Paddle checkout...", "", true);

    return loadSummary({ force: true, suppressErrors: true })
      .then(function (summary) {
        var checkoutSummary = normalizeSummary(summary);

        if (resolveProviderCode(checkoutSummary) !== billingProviderPaddle || !checkoutSummary.client_token) {
          throw new Error("We couldn't start checkout.");
        }

        return fetcher(billingCheckoutPath, {
          body: JSON.stringify({ pack_code: normalizedPackID }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
          .then(function (response) {
            if (!response.ok) {
              return extractErrorMessage(response, "We couldn't start checkout.")
                .then(function (message) {
                  throw new Error(message);
                });
            }
            return parseJSONResponse(response).then(function (data) {
              var transactionID = normalizeString(data && data.transaction_id);

              if (!transactionID) {
                throw new Error("We couldn't start checkout.");
              }

              dispatchBillingEvent("billing-checkout-opening", {
                provider_code: checkoutSummary.provider_code,
                transaction_id: transactionID,
              });

              return openPaddleCheckout(checkoutSummary, data).then(function () {
                return data;
              });
            });
          })
          .then(function (result) {
            updateBillingStatus(
              "Checkout opened. Complete payment in Paddle to continue.",
              "",
              false
            );
            return result;
          });
      })
      .then(function (response) {
        return response;
      })
      .catch(function (error) {
        updateBillingStatus(error.message || "We couldn't start checkout.", "error", false);
        throw error;
      });
  }

  function requestPortalSession() {
    var fetcher = getFetcher();

    updateBillingStatus("Opening billing portal...", "", true);

    return fetcher(billingPortalPath, {
      credentials: "include",
      method: "POST",
    })
      .then(function (response) {
        if (!response.ok) {
          return extractErrorMessage(response, "We couldn't open billing right now.")
            .then(function (message) {
              throw new Error(message);
            });
        }
        return parseJSONResponse(response).then(function (data) {
          var portalURL;
          var popup;

          if (!data || typeof data.url !== "string" || data.url.trim() === "") {
            throw new Error("Billing portal did not return a URL.");
          }

          portalURL = data.url.trim();
          popup = window.open(portalURL, "_blank", "noopener,noreferrer");
          if (!popup) {
            window.location.assign(portalURL);
          }
          return data;
        });
      })
      .catch(function (error) {
        updateBillingStatus(error.message || "We couldn't open billing right now.", "error", false);
        throw error;
      });
  }

  function openAccountBilling(options) {
    var detail = options || {};

    dispatchBillingEvent("billing-open-request", detail);
    if (detail.message) {
      updateBillingStatus(detail.message, detail.tone || "", detail.isBusy === true);
    }
    if (state.loggedIn) {
      connectBillingEventStream();
    }
    return loadSummary({
      force: detail.force === true,
      suppressErrors: detail.suppressErrors === true,
    }).catch(function () {
      return state.summary;
    });
  }

  function setLoggedIn(loggedIn) {
    state.loggedIn = loggedIn === true;

    if (!state.loggedIn) {
      closeBillingEventStream();
      applySummary(createEmptySummary());
      return Promise.resolve(state.summary);
    }

    return requestBillingSync()
      .catch(function () {
        return {};
      })
      .then(function () {
        return loadSummary({ force: true, suppressErrors: true });
      })
      .catch(function () {
        return state.summary;
      })
      .then(function (summary) {
        connectBillingEventStream();
        return summary;
      });
  }

  window.CrosswordBilling = Object.freeze({
    getState: function () {
      return {
        eventSource: state.eventSource,
        lastStatus: state.lastStatus,
        loggedIn: state.loggedIn,
        summary: state.summary,
      };
    },
    loadSummary: loadSummary,
    openAccountBilling: openAccountBilling,
    requestCheckout: requestCheckout,
    requestPortalSession: requestPortalSession,
    setLoggedIn: setLoggedIn,
  });

  (window.__LLM_CROSSWORD_TEST__ || (window.__LLM_CROSSWORD_TEST__ = {})).billing = {
    applySummary: applySummary,
    closeBillingEventStream: closeBillingEventStream,
    connectBillingEventStream: connectBillingEventStream,
    createEmptySummary: createEmptySummary,
    describeBillingError: describeBillingError,
    dispatchBillingEvent: dispatchBillingEvent,
    extractErrorMessage: extractErrorMessage,
    ensureScriptLoaded: ensureScriptLoaded,
    handleBillingEventMessage: handleBillingEventMessage,
    normalizeCallback: normalizeCallback,
    loadSummary: loadSummary,
    normalizeBillingEventMessage: normalizeBillingEventMessage,
    normalizeSummary: normalizeSummary,
    openPaddleCheckout: openPaddleCheckout,
    openAccountBilling: openAccountBilling,
    requestBillingSync: requestBillingSync,
    requestCheckout: requestCheckout,
    requestPortalSession: requestPortalSession,
    resolveProviderSDKURL: resolveProviderSDKURL,
    resolvePaddleClient: resolvePaddleClient,
    setState: function (nextState) {
      Object.assign(state, nextState || {});
    },
    setLoggedIn: setLoggedIn,
    updateBillingStatus: updateBillingStatus,
    handlePaddleCheckoutEvent: handlePaddleCheckoutEvent,
    initializePaddleClient: initializePaddleClient,
  };
})();
