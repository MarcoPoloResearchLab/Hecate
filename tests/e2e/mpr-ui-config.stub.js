// @ts-check

(function () {
  "use strict";

  function applyStyles(element, cssText) {
    element.style.cssText = cssText;
  }

  function parseJSONAttribute(host, attributeName) {
    var rawValue = host.getAttribute(attributeName);
    if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return null;
    }
  }

  function readFooterLabel(host) {
    var parsed = parseJSONAttribute(host, "links-collection");
    if (parsed && typeof parsed.text === "string" && parsed.text.trim().length > 0) {
      return parsed.text.trim();
    }
    return "Built by Marco Polo Research Lab LLC";
  }

  if (!customElements.get("mpr-header")) {
    customElements.define("mpr-header", class extends HTMLElement {
      connectedCallback() {
        this.style.display = "block";
        this.style.width = "100%";

        if (this.querySelector("header.mpr-header")) {
          return;
        }

        var preservedChildren = Array.from(this.children);
        var header = document.createElement("header");
        var brandLink = document.createElement("a");
        var actions = document.createElement("div");
        var signInArea = document.createElement("div");

        header.className = "mpr-header";
        applyStyles(
          header,
          "display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:0 16px;background:rgb(15,23,42);color:rgb(248,250,252);box-sizing:border-box;"
        );

        brandLink.href = this.getAttribute("brand-href") || "/";
        brandLink.textContent = this.getAttribute("brand-label") || "LLM Crossword";
        applyStyles(
          brandLink,
          "color:inherit;text-decoration:none;font-size:1rem;font-weight:700;line-height:1.2;"
        );

        actions.className = "mpr-header__actions";
        applyStyles(actions, "display:flex;align-items:center;gap:12px;position:relative;");

        signInArea.setAttribute("data-mpr-header", "google-signin");
        signInArea.setAttribute("aria-label", "Google sign in");
        applyStyles(
          signInArea,
          "display:flex;align-items:center;justify-content:center;min-width:120px;min-height:40px;padding:0 12px;border-radius:999px;background:rgb(255,255,255);color:rgb(15,23,42);font-size:0.875rem;font-weight:600;"
        );
        signInArea.innerHTML = '<div role="button" tabindex="0" aria-label="Google sign in">Google sign in</div>';

        actions.appendChild(signInArea);
        preservedChildren.forEach(function appendPreservedChild(child) {
          actions.appendChild(child);
        });

        header.appendChild(brandLink);
        header.appendChild(actions);
        this.appendChild(header);
      }
    });
  }

  if (!customElements.get("mpr-footer")) {
    customElements.define("mpr-footer", class extends HTMLElement {
      connectedCallback() {
        this.style.display = "block";
        this.style.width = "100%";

        if (this.querySelector("footer.mpr-footer")) {
          return;
        }

        var footer = document.createElement("footer");
        var legalLinks = document.createElement("div");
        var themeToggle = document.createElement("button");
        var builtByButton = document.createElement("button");
        var horizontalLinksConfig = parseJSONAttribute(this, "horizontal-links");

        footer.className = "mpr-footer";
        applyStyles(
          footer,
          "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;min-height:40px;padding:8px 16px;background:rgb(15,23,42);color:rgb(226,232,240);box-sizing:border-box;"
        );
        legalLinks.setAttribute("data-mpr-footer", "horizontal-links");
        applyStyles(legalLinks, "display:flex;align-items:center;flex-wrap:wrap;gap:12px;");

        if (horizontalLinksConfig && Array.isArray(horizontalLinksConfig.links) && horizontalLinksConfig.links.length > 0) {
          horizontalLinksConfig.links.forEach(function appendHorizontalLink(linkConfig) {
            if (!linkConfig || typeof linkConfig.label !== "string" || typeof linkConfig.href !== "string") {
              return;
            }

            var link = document.createElement("a");
            link.href = linkConfig.href;
            link.textContent = linkConfig.label;
            if (typeof linkConfig.target === "string" && linkConfig.target.length > 0) {
              link.target = linkConfig.target;
            }
            applyStyles(link, "color:inherit;text-decoration:none;");
            legalLinks.appendChild(link);
          });
        } else {
          var privacyLink = document.createElement("a");
          privacyLink.href = this.getAttribute("privacy-link-href") || "#privacy";
          privacyLink.textContent = this.getAttribute("privacy-link-label") || "Privacy";
          applyStyles(privacyLink, "color:inherit;text-decoration:none;");
          legalLinks.appendChild(privacyLink);
        }

        themeToggle.type = "button";
        themeToggle.setAttribute("data-mpr-footer", "theme-toggle");
        themeToggle.textContent = "Theme";
        applyStyles(
          themeToggle,
          "padding:6px 12px;border:1px solid rgba(255,255,255,0.35);border-radius:999px;background:transparent;color:inherit;"
        );

        builtByButton.type = "button";
        builtByButton.textContent = readFooterLabel(this);
        applyStyles(
          builtByButton,
          "padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;"
        );

        footer.appendChild(legalLinks);
        footer.appendChild(themeToggle);
        footer.appendChild(builtByButton);
        this.appendChild(footer);
      }
    });
  }

  if (!customElements.get("mpr-user")) {
    customElements.define("mpr-user", class extends HTMLElement {
      static get observedAttributes() {
        return ["menu-items", "logout-url", "logout-label"];
      }

      connectedCallback() {
        this._render();
      }

      attributeChangedCallback() {
        this._render();
      }

      _render() {
        var logoutLabel = this.getAttribute("logout-label") || "Log out";
        var logoutUrl = this.getAttribute("logout-url") || "/";
        var items = [];

        try {
          items = JSON.parse(this.getAttribute("menu-items") || "[]");
        } catch (error) {}

        applyStyles(this, "display:block;position:relative;z-index:2000;");

        this.innerHTML = '<div class="mpr-user__layout" style="position:relative;display:flex;align-items:center">' +
          '<button type="button" class="mpr-user__trigger" data-mpr-user="trigger" aria-haspopup="true" aria-expanded="false">U</button>' +
          '<div class="mpr-user__menu" data-mpr-user="menu" role="menu" style="display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:160px;padding:8px;background:#1e293b;border:1px solid rgba(148,163,184,0.25);border-radius:12px;box-shadow:0 20px 40px rgba(15,23,42,0.35);z-index:2001">' +
          items.map(function renderItem(item, index) {
            return '<button type="button" class="mpr-user__menu-item" role="menuitem" data-mpr-user="menu-item" data-mpr-user-action="' + (item.action || "") + '" data-mpr-user-index="' + index + '">' + (item.label || "") + "</button>";
          }).join("") +
          '<a class="mpr-user__menu-item" role="menuitem" href="' + logoutUrl + '" data-mpr-user="logout">' + logoutLabel + "</a>" +
          "</div></div>";

        var trigger = this.querySelector('[data-mpr-user="trigger"]');
        var menu = this.querySelector('[data-mpr-user="menu"]');

        if (trigger && menu) {
          trigger.addEventListener("click", function toggleMenu() {
            var isOpen = menu.style.display !== "none";
            menu.style.display = isOpen ? "none" : "block";
            trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
          });
        }

        var self = this;
        this.querySelectorAll('[data-mpr-user="menu-item"]').forEach(function bindMenuItem(button) {
          button.addEventListener("click", function handleMenuItemClick() {
            var action = button.getAttribute("data-mpr-user-action");
            var index = parseInt(button.getAttribute("data-mpr-user-index"), 10);

            self.dispatchEvent(new CustomEvent("mpr-user:menu-item", {
              bubbles: true,
              detail: { action: action, index: index, label: button.textContent },
            }));

            if (menu && trigger) {
              menu.style.display = "none";
              trigger.setAttribute("aria-expanded", "false");
            }
          });
        });
      }
    });
  }

  if (!customElements.get("mpr-detail-drawer")) {
    customElements.define("mpr-detail-drawer", class extends HTMLElement {
      static get observedAttributes() {
        return ["open", "heading", "subheading"];
      }

      connectedCallback() {
        this._init();
        this._sync();
      }

      attributeChangedCallback() {
        if (this._panel) {
          this._sync();
        }
      }

      _init() {
        if (this._panel) {
          return;
        }

        var heading = this.getAttribute("heading") || "Details";
        var slottedBody = this.querySelector('[slot="body"]');
        var backdrop = document.createElement("div");
        var panel = document.createElement("aside");
        var body;
        var self = this;

        backdrop.className = "mpr-detail-drawer__backdrop";
        panel.className = "mpr-detail-drawer__panel";
        panel.innerHTML = '<div class="mpr-detail-drawer__header" style="display:flex;justify-content:space-between;align-items:center">' +
          '<h2 class="mpr-detail-drawer__heading">' + heading + "</h2>" +
          '<button class="mpr-detail-drawer__close" data-mpr-detail-drawer="close">Close</button></div>' +
          '<div class="mpr-detail-drawer__body"></div>';

        body = panel.querySelector(".mpr-detail-drawer__body");

        if (slottedBody) {
          while (slottedBody.firstChild) {
            body.appendChild(slottedBody.firstChild);
          }
          slottedBody.remove();
        }

        this.appendChild(backdrop);
        this.appendChild(panel);
        this._backdrop = backdrop;
        this._panel = panel;

        panel.querySelector('[data-mpr-detail-drawer="close"]').addEventListener("click", function handleCloseClick() {
          self.removeAttribute("open");
          self.dispatchEvent(new CustomEvent("mpr-ui:detail-drawer:close", { bubbles: true }));
        });

        backdrop.addEventListener("click", function handleBackdropClick() {
          self.removeAttribute("open");
          self.dispatchEvent(new CustomEvent("mpr-ui:detail-drawer:close", { bubbles: true }));
        });
      }

      _sync() {
        var isOpen = this.hasAttribute("open");

        applyStyles(
          this,
          "position:fixed;inset:0;z-index:80;display:block;" + (isOpen ? "" : "pointer-events:none;")
        );
        applyStyles(
          this._backdrop,
          "position:absolute;inset:0;background:rgba(15,23,42,0.65);opacity:" + (isOpen ? "1" : "0") + ";pointer-events:" + (isOpen ? "auto" : "none") + ";"
        );
        applyStyles(
          this._panel,
          "position:absolute;top:0;bottom:0;right:0;width:min(38rem,100vw);padding:1.25rem;background:rgba(15,23,42,0.98);border-left:1px solid rgba(148,163,184,0.25);display:flex;flex-direction:column;gap:1rem;overflow:auto;pointer-events:auto;transform:translateX(" + (isOpen ? "0" : "100%") + ");"
        );
      }
    });
  }
})();

(function () {
  "use strict";

  var EVENT_AUTHENTICATED = "mpr-ui:auth:authenticated";
  var EVENT_ORCHESTRATION_READY = "mpr-ui:orchestration:ready";
  var EVENT_UNAUTHENTICATED = "mpr-ui:auth:unauthenticated";
  var autoOrchestrationPromise = null;
  var authConfigPromise = null;
  var resolvedAuthConfig = null;
  var resolvedConfigUrl = "/configs/frontend-config.yml";

  function ensureNamespace(target) {
    if (!target.MPRUI) {
      target.MPRUI = {};
    }
    return target.MPRUI;
  }

  function dispatchDocumentEvent(eventName, detail) {
    if (typeof document === "undefined" || typeof document.dispatchEvent !== "function") {
      return;
    }
    document.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  }

  function trimValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function parseFrontendAuthConfig(yamlText, origin) {
    var current = null;
    var environments = [];
    var lines = String(yamlText || "").split("\n");

    lines.forEach(function parseLine(line) {
      var originMatch;
      var valueMatch;

      if (/^\s+-\s+description:/.test(line)) {
        if (current) {
          environments.push(current);
        }
        current = {
          auth: {
            googleClientId: "",
            loginPath: "",
            logoutPath: "",
            noncePath: "",
            tauthUrl: "",
            tenantId: "",
          },
          origins: [],
        };
        return;
      }

      if (!current) {
        return;
      }

      originMatch = line.match(/^\s+-\s+"([^"]+)"/);
      if (originMatch && line.indexOf("description") < 0) {
        current.origins.push(originMatch[1]);
        return;
      }

      valueMatch = line.match(/^\s+tauthUrl:\s+"([^"]*)"/);
      if (valueMatch) {
        current.auth.tauthUrl = valueMatch[1];
        return;
      }

      valueMatch = line.match(/^\s+googleClientId:\s+"([^"]+)"/);
      if (valueMatch) {
        current.auth.googleClientId = valueMatch[1];
        return;
      }

      valueMatch = line.match(/^\s+tenantId:\s+"([^"]+)"/);
      if (valueMatch) {
        current.auth.tenantId = valueMatch[1];
        return;
      }

      valueMatch = line.match(/^\s+loginPath:\s+"([^"]+)"/);
      if (valueMatch) {
        current.auth.loginPath = valueMatch[1];
        return;
      }

      valueMatch = line.match(/^\s+logoutPath:\s+"([^"]+)"/);
      if (valueMatch) {
        current.auth.logoutPath = valueMatch[1];
        return;
      }

      valueMatch = line.match(/^\s+noncePath:\s+"([^"]+)"/);
      if (valueMatch) {
        current.auth.noncePath = valueMatch[1];
      }
    });

    if (current) {
      environments.push(current);
    }

    current = environments.find(function findMatch(environment) {
      return environment.origins.indexOf(origin) >= 0;
    }) || null;

    return current ? current.auth : null;
  }

  function getDefaultAuthConfig() {
    return {
      googleClientId: "",
      loginPath: "/auth/google",
      logoutPath: "/auth/logout",
      noncePath: "/auth/nonce",
      tauthUrl: window.location.origin,
      tenantId: "",
    };
  }

  function setAttributeValue(target, attributeName, attributeValue) {
    if (!target || typeof target.setAttribute !== "function") {
      return;
    }
    target.setAttribute(attributeName, String(attributeValue));
  }

  function removeAttributeValue(target, attributeName) {
    if (!target || typeof target.removeAttribute !== "function") {
      return;
    }
    target.removeAttribute(attributeName);
  }

  function applyAuthConfig(authConfig) {
    Array.from(document.querySelectorAll("mpr-header")).forEach(function updateHeader(header) {
      setAttributeValue(header, "google-site-id", authConfig.googleClientId);
      setAttributeValue(header, "tauth-tenant-id", authConfig.tenantId);
      setAttributeValue(header, "tauth-login-path", authConfig.loginPath);
      setAttributeValue(header, "tauth-logout-path", authConfig.logoutPath);
      setAttributeValue(header, "tauth-nonce-path", authConfig.noncePath);
      if (trimValue(authConfig.tauthUrl)) {
        setAttributeValue(header, "tauth-url", authConfig.tauthUrl);
      } else {
        removeAttributeValue(header, "tauth-url");
      }
    });

    Array.from(document.querySelectorAll("mpr-user, mpr-login-button")).forEach(function updateAuthElement(element) {
      setAttributeValue(element, "tauth-tenant-id", authConfig.tenantId);
    });
  }

  function readSessionProfile(response) {
    if (!response || typeof response.json !== "function") {
      return Promise.resolve({});
    }
    return response.json().catch(function () {
      return {};
    });
  }

  function setAuthenticatedState(profile) {
    var normalizedProfile = profile && typeof profile === "object" ? profile : {};

    Array.from(document.querySelectorAll("mpr-header")).forEach(function updateHeader(header) {
      setAttributeValue(header, "data-user-id", trimValue(normalizedProfile.user_id) || "stub-user");
      setAttributeValue(header, "data-user-email", trimValue(normalizedProfile.user_email || normalizedProfile.email) || "stub@example.com");
      setAttributeValue(header, "data-user-display", trimValue(normalizedProfile.display) || "Stub User");
      setAttributeValue(header, "data-user-avatar-url", trimValue(normalizedProfile.avatar_url));
    });
  }

  function clearAuthenticatedState() {
    Array.from(document.querySelectorAll("mpr-header")).forEach(function clearHeader(header) {
      removeAttributeValue(header, "data-user-id");
      removeAttributeValue(header, "data-user-email");
      removeAttributeValue(header, "data-user-display");
      removeAttributeValue(header, "data-user-avatar-url");
    });
  }

  function isUnauthorizedResponse(response) {
    return !!response && (response.status === 401 || response.status === 403);
  }

  function fetchSession() {
    return window.fetch("/me", {
      cache: "no-store",
      credentials: "include",
    });
  }

  function refreshSession() {
    return window.fetch("/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(function (response) {
        return !!response && response.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function dispatchAuthenticated(response) {
    return readSessionProfile(response).then(function (profile) {
      setAuthenticatedState(profile);
      dispatchDocumentEvent(EVENT_AUTHENTICATED, { profile: profile });
    });
  }

  function dispatchUnauthenticated() {
    clearAuthenticatedState();
    dispatchDocumentEvent(EVENT_UNAUTHENTICATED, {});
  }

  function resolveConfigUrl(options) {
    var explicitConfigUrl = trimValue(options && options.configUrl);
    var header = document.querySelector("mpr-header[data-config-url]");

    if (explicitConfigUrl) {
      return explicitConfigUrl;
    }

    if (header) {
      return trimValue(header.getAttribute("data-config-url")) || resolvedConfigUrl;
    }

    return resolvedConfigUrl;
  }

  function loadAuthConfig(configUrl) {
    resolvedConfigUrl = configUrl || resolvedConfigUrl;
    if (authConfigPromise) {
      return authConfigPromise;
    }

    authConfigPromise = window.fetch(resolvedConfigUrl, { cache: "no-store" })
      .then(function (response) {
        if (!response || !response.ok) {
          return "";
        }
        return response.text();
      })
      .catch(function () {
        return "";
      })
      .then(function (configText) {
        var authConfig = parseFrontendAuthConfig(configText, window.location.origin);
        var defaultAuthConfig = getDefaultAuthConfig();

        if (!authConfig) {
          authConfig = defaultAuthConfig;
        } else {
          authConfig = Object.assign({}, defaultAuthConfig, authConfig);
          if (!trimValue(authConfig.tauthUrl)) {
            authConfig.tauthUrl = window.location.origin;
          }
        }
        resolvedAuthConfig = authConfig;
        applyAuthConfig(authConfig);
        return authConfig;
      });

    return authConfigPromise;
  }

  function bootstrapAuth() {
    return fetchSession()
      .then(function handleSessionResponse(response) {
        if (response && response.ok) {
          return dispatchAuthenticated(response);
        }

        if (isUnauthorizedResponse(response)) {
          return refreshSession().then(function handleRefreshResult(refreshed) {
            if (!refreshed) {
              dispatchUnauthenticated();
              return;
            }
            return fetchSession().then(function handleRefreshedSession(retryResponse) {
              if (retryResponse && retryResponse.ok) {
                return dispatchAuthenticated(retryResponse);
              }
              dispatchUnauthenticated();
            }, function () {
              dispatchUnauthenticated();
            });
          });
        }

        dispatchUnauthenticated();
      })
      .catch(function () {
        dispatchUnauthenticated();
      });
  }

  function orchestrate(options) {
    if (autoOrchestrationPromise) {
      return autoOrchestrationPromise;
    }

    autoOrchestrationPromise = loadAuthConfig(resolveConfigUrl(options))
      .then(function () {
        if (resolvedAuthConfig) {
          applyAuthConfig(resolvedAuthConfig);
        }
        return bootstrapAuth();
      })
      .then(function () {
        dispatchDocumentEvent(EVENT_ORCHESTRATION_READY, { configUrl: resolvedConfigUrl });
      });

    return autoOrchestrationPromise;
  }

  function startAutoOrchestration() {
    return orchestrate();
  }

  ensureNamespace(window).applyYamlConfig = function applyYamlConfig(options) {
    return loadAuthConfig(resolveConfigUrl(options));
  };
  ensureNamespace(window).applyConfig = function applyConfig(options) {
    return ensureNamespace(window).applyYamlConfig(options);
  };
  ensureNamespace(window).whenAutoOrchestrationReady = function whenAutoOrchestrationReady() {
    return autoOrchestrationPromise || Promise.resolve();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAutoOrchestration, { once: true });
  } else {
    startAutoOrchestration();
  }
})();
