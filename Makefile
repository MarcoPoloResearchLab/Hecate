GO ?= go
GOFMT ?= gofmt
STATICCHECK ?= staticcheck
INEFFASSIGN ?= ineffassign
NPM ?= npm
DOCKER ?= docker
DOCKER_COMPOSE ?= docker compose
DOCKER_BUILDX ?= $(DOCKER) buildx
DOCKER_BUILD_PLATFORMS ?= linux/amd64,linux/arm64
GHCR_REGISTRY ?= ghcr.io
GHCR_OWNER ?= marcopoloresearchlab
GHCR_VERSION_TAG ?= $(shell git describe --tags --exact-match HEAD 2>/dev/null || true)
GHCR_HECATE_API_REPO ?= $(GHCR_REGISTRY)/$(GHCR_OWNER)/llm-crossword-api
GHCR_HECATE_API_LATEST_IMAGE ?= $(GHCR_HECATE_API_REPO):latest
GHCR_HECATE_API_VERSION_IMAGE ?= $(if $(GHCR_VERSION_TAG),$(GHCR_HECATE_API_REPO):$(GHCR_VERSION_TAG))
COMPOSE_UP_ARGS ?=
COMPOSE_DOWN_ARGS ?=
LOCAL_HECATEAPI_ENV_FILE ?= configs/.env.hecateapi.local
LOCAL_TAUTH_ENV_FILE ?= configs/.env.tauth.local
LOCAL_TAUTH_CONFIG_TEMPLATE ?= tauth.config.local.yaml

GO_SOURCES := $(shell find backend -name '*.go' -not -path '*/vendor/*' 2>/dev/null)
GO_PACKAGES := $(shell cd backend && go list ./... 2>/dev/null)
NODE_MODULES := node_modules
BACKEND_DIR := backend
BIN_DIR := $(BACKEND_DIR)/bin
RUNTIME_DIR := .runtime

ifeq ($(CI),true)
PLAYWRIGHT_INSTALL_FLAGS := --with-deps
endif

.PHONY: format check-format lint test test-unit test-backend test-web test-web-coverage test-integration \
	playwright-install build clean ci \
	docker-buildx-bootstrap docker-build-ghcr-image docker-push-ghcr-image publish publish-ghcr \
	up down logs ps docker-up docker-down docker-logs docker-ps

# ---------- Formatting ----------

format:
	$(GOFMT) -w $(GO_SOURCES)

check-format:
	@formatted="$$($(GOFMT) -l $(GO_SOURCES))"; \
	if [ -n "$$formatted" ]; then \
		echo 'Go files require formatting:'; \
		echo "$$formatted"; \
		exit 1; \
	fi

# ---------- Linting ----------

lint:
	@command -v $(STATICCHECK) >/dev/null 2>&1 || { echo 'staticcheck is required (install via `go install honnef.co/go/tools/cmd/staticcheck@latest`)'; exit 1; }
	@command -v $(INEFFASSIGN) >/dev/null 2>&1 || { echo 'ineffassign is required (install via `go install github.com/gordonklaus/ineffassign@latest`)'; exit 1; }
	cd $(BACKEND_DIR) && $(GO) vet ./...
	cd $(BACKEND_DIR) && $(STATICCHECK) ./...
	cd $(BACKEND_DIR) && $(INEFFASSIGN) ./...

# ---------- Testing ----------

test-backend:
	cd $(BACKEND_DIR) && $(GO) test ./... -coverprofile=coverage.out
	@coverage="$$(cd $(BACKEND_DIR) && $(GO) tool cover -func=coverage.out | awk '/^total:/ { print $$3 }')"; \
	if [ "$$coverage" != "100.0%" ]; then \
		echo "Go coverage must be 100.0% (got $$coverage)"; \
		exit 1; \
	fi

$(NODE_MODULES): package-lock.json
	$(NPM) ci --foreground-scripts

playwright-install:
	npx playwright install $(PLAYWRIGHT_INSTALL_FLAGS) chromium

test-web: $(NODE_MODULES)
	$(MAKE) playwright-install
	$(NPM) test

test-web-coverage: $(NODE_MODULES)
	$(MAKE) playwright-install
	$(NPM) run test:coverage

test-integration: $(NODE_MODULES)
	$(MAKE) playwright-install
	$(NPM) run test:integration

test-unit: test-backend test-web

test: test-unit test-integration

# ---------- Build ----------

build:
	mkdir -p $(BIN_DIR)
	cd $(BACKEND_DIR) && $(GO) build -o bin/hecate-api ./cmd/hecate-api

docker-buildx-bootstrap:
	@$(DOCKER_BUILDX) inspect >/dev/null 2>&1 || { \
		$(DOCKER_BUILDX) inspect llm-crossword-multiarch >/dev/null 2>&1 && $(DOCKER_BUILDX) use llm-crossword-multiarch >/dev/null || \
		$(DOCKER_BUILDX) create --name llm-crossword-multiarch --use >/dev/null; \
	}
	@$(DOCKER_BUILDX) inspect --bootstrap >/dev/null

docker-build-ghcr-image:
	@echo "Building $(GHCR_HECATE_API_LATEST_IMAGE)"
	@if [ -n "$(GHCR_VERSION_TAG)" ]; then echo "Also tagging $(GHCR_HECATE_API_VERSION_IMAGE)"; else echo "No exact git tag on HEAD; building latest only."; fi
	$(DOCKER) build -t "$(GHCR_HECATE_API_LATEST_IMAGE)" $(if $(GHCR_VERSION_TAG),-t "$(GHCR_HECATE_API_VERSION_IMAGE)") -f backend/Dockerfile backend

docker-push-ghcr-image:
	$(DOCKER) push "$(GHCR_HECATE_API_LATEST_IMAGE)"
	$(if $(GHCR_VERSION_TAG),$(DOCKER) push "$(GHCR_HECATE_API_VERSION_IMAGE)")

publish publish-ghcr: docker-buildx-bootstrap
	@echo "Publishing $(GHCR_HECATE_API_LATEST_IMAGE) for platforms $(DOCKER_BUILD_PLATFORMS)"
	@if [ -n "$(GHCR_VERSION_TAG)" ]; then echo "Also publishing $(GHCR_HECATE_API_VERSION_IMAGE)"; else echo "No exact git tag on HEAD; publishing latest only."; fi
	$(DOCKER_BUILDX) build --platform "$(DOCKER_BUILD_PLATFORMS)" -t "$(GHCR_HECATE_API_LATEST_IMAGE)" $(if $(GHCR_VERSION_TAG),-t "$(GHCR_HECATE_API_VERSION_IMAGE)") -f backend/Dockerfile --push backend

clean:
	rm -rf $(BIN_DIR) .nyc_output coverage test-results playwright-report $(BACKEND_DIR)/coverage.out

# ---------- CI ----------

ci: check-format lint test-backend test-web-coverage

# ---------- Docker ----------

up:
	@set -eu; \
	for env_file in "$(LOCAL_HECATEAPI_ENV_FILE)" "$(LOCAL_TAUTH_ENV_FILE)"; do \
		if [ ! -f "$$env_file" ]; then \
			echo "Missing $$env_file."; \
			exit 1; \
		fi; \
	done; \
	if [ ! -f "$(LOCAL_TAUTH_CONFIG_TEMPLATE)" ]; then \
		echo "Missing $(LOCAL_TAUTH_CONFIG_TEMPLATE)."; \
		exit 1; \
	fi; \
	if [ -f config.yaml ]; then \
		echo "Legacy root config.yaml is not allowed. Move app config to configs/config.yml."; \
		exit 1; \
	fi; \
	if rg -n '^[[:space:]]*administrators:' configs/config.yml >/dev/null 2>&1; then \
		echo "configs/config.yml must not contain administrators. Move admin emails to HECATEAPI_ADMIN_EMAILS in $(LOCAL_HECATEAPI_ENV_FILE)."; \
		exit 1; \
	fi; \
	if find . -maxdepth 1 -type f -name 'client_secret_*.json' | grep -q .; then \
		echo "Refusing to start: repo-root client_secret_*.json would be served by ghttp. Move OAuth client secret files outside the repo root."; \
		exit 1; \
	fi; \
	port_in_use() { \
		lsof -nP -iTCP:"$$1" -sTCP:LISTEN >/dev/null 2>&1; \
	}; \
	port_owner() { \
		lsof -nP -iTCP:"$$1" -sTCP:LISTEN | tail -n +2 | head -n 1; \
	}; \
	port_reserved() { \
		target="$$1"; \
		shift; \
		for reserved in "$$@"; do \
			if [ "$$reserved" = "$$target" ]; then \
				return 0; \
			fi; \
		done; \
		return 1; \
	}; \
	next_free_port() { \
		port="$$1"; \
		shift; \
		while :; do \
			if port_reserved "$$port" "$$@"; then \
				port=$$((port + 1)); \
				continue; \
			fi; \
			if command -v lsof >/dev/null 2>&1 && port_in_use "$$port"; then \
				port=$$((port + 1)); \
				continue; \
			fi; \
			break; \
		done; \
		printf '%s\n' "$$port"; \
	}; \
	resolve_port() { \
		label="$$1"; \
		requested="$$2"; \
		explicit="$$3"; \
		shift 3; \
		if port_reserved "$$requested" "$$@"; then \
			if [ -n "$$explicit" ]; then \
				echo "$$label port $$requested conflicts with another Hecate host port." >&2; \
				exit 1; \
			fi; \
			resolved=$$(next_free_port "$$((requested + 1))" "$$@"); \
			echo "$$label port $$requested conflicts with another Hecate host port; using $$resolved instead." >&2; \
			printf '%s\n' "$$resolved"; \
			return 0; \
		fi; \
		if command -v lsof >/dev/null 2>&1 && port_in_use "$$requested"; then \
			owner=$$(port_owner "$$requested"); \
			if [ -n "$$explicit" ]; then \
				echo "$$label port $$requested is already in use." >&2; \
				if [ -n "$$owner" ]; then \
					echo "$$owner" >&2; \
				fi; \
				exit 1; \
			fi; \
			resolved=$$(next_free_port "$$((requested + 1))" "$$@"); \
			echo "$$label port $$requested is already in use; using $$resolved instead." >&2; \
			if [ -n "$$owner" ]; then \
				echo "Current listener on $$requested: $$owner" >&2; \
			fi; \
			printf '%s\n' "$$resolved"; \
			return 0; \
		fi; \
		printf '%s\n' "$$requested"; \
	}; \
	trim_quotes() { \
		value="$$1"; \
		value="$${value%\"}"; \
		value="$${value#\"}"; \
		value="$${value%\'}"; \
		value="$${value#\'}"; \
		printf '%s' "$$value"; \
	}; \
	read_env_value() { \
		awk -F '=' -v target_key="$$2" '$$1 == target_key { sub($$1 "=", ""); print; exit }' "$$1"; \
	}; \
	start_billing_ngrok_tunnel() { \
		local_target_url="$$1"; \
		ngrok_pid_file="$(RUNTIME_DIR)/billing-ngrok.pid"; \
		ngrok_log_file="$(RUNTIME_DIR)/billing-ngrok.log"; \
		ngrok_api_url="$${BILLING_NGROK_API_URL:-http://127.0.0.1:4040/api/tunnels}"; \
		tunnel_url=""; \
		attempts=0; \
		if ! command -v ngrok >/dev/null 2>&1; then \
			echo "Paddle sandbox localhost requires a public HTTPS billing callback. Install ngrok or set BILLING_CALLBACK_PUBLIC_URL." >&2; \
			exit 1; \
		fi; \
		if [ -f "$$ngrok_pid_file" ]; then \
			existing_pid="$$(cat "$$ngrok_pid_file" 2>/dev/null || true)"; \
			if [ -n "$$existing_pid" ] && kill -0 "$$existing_pid" >/dev/null 2>&1; then \
				kill "$$existing_pid" >/dev/null 2>&1 || true; \
			fi; \
			rm -f "$$ngrok_pid_file"; \
		fi; \
		rm -f "$$ngrok_log_file"; \
		if [ -n "$${NGROK_AUTHTOKEN:-}" ]; then \
			nohup ngrok http --authtoken "$${NGROK_AUTHTOKEN}" "$$local_target_url" >"$$ngrok_log_file" 2>&1 & \
		else \
			nohup ngrok http "$$local_target_url" >"$$ngrok_log_file" 2>&1 & \
		fi; \
		ngrok_pid="$$!"; \
		printf '%s\n' "$$ngrok_pid" > "$$ngrok_pid_file"; \
		while [ "$$attempts" -lt 60 ]; do \
			tunnel_url="$$(curl -sS "$$ngrok_api_url" 2>/dev/null | rg -o '"public_url":"https://[^"]+"' -m1 | cut -d '"' -f4 || true)"; \
			if [ -n "$$tunnel_url" ]; then \
				printf '%s\n' "$$tunnel_url"; \
				return 0; \
			fi; \
			attempts=$$((attempts + 1)); \
			sleep 0.25; \
		done; \
		kill "$$ngrok_pid" >/dev/null 2>&1 || true; \
		rm -f "$$ngrok_pid_file"; \
		echo "Failed to resolve ngrok public URL from $$ngrok_api_url; see $$ngrok_log_file." >&2; \
		exit 1; \
	}; \
	mkdir -p "$(RUNTIME_DIR)"; \
	ledger_requested_port="$${LEDGER_HOST_PORT:-50051}"; \
	ledger_explicit_port="$${LEDGER_HOST_PORT:-}"; \
	ledger_resolved_port=$$(resolve_port "Ledger host" "$$ledger_requested_port" "$$ledger_explicit_port"); \
	tauth_requested_port="$${TAUTH_HOST_PORT:-8081}"; \
	tauth_explicit_port="$${TAUTH_HOST_PORT:-}"; \
	tauth_resolved_port=$$(resolve_port "TAuth host" "$$tauth_requested_port" "$$tauth_explicit_port" "$$ledger_resolved_port"); \
	api_requested_port="$${HECATE_API_HOST_PORT:-9090}"; \
	api_explicit_port="$${HECATE_API_HOST_PORT:-}"; \
	api_resolved_port=$$(resolve_port "Hecate API host" "$$api_requested_port" "$$api_explicit_port" "$$ledger_resolved_port" "$$tauth_resolved_port"); \
	site_requested_port="$${HECATE_PORT:-8000}"; \
	site_explicit_port="$${HECATE_PORT:-}"; \
	site_resolved_port=$$(resolve_port "Hecate site" "$$site_requested_port" "$$site_explicit_port" "$$ledger_resolved_port" "$$tauth_resolved_port" "$$api_resolved_port"); \
	export LEDGER_HOST_PORT="$$ledger_resolved_port"; \
	export TAUTH_HOST_PORT="$$tauth_resolved_port"; \
	export HECATE_API_HOST_PORT="$$api_resolved_port"; \
	export HECATE_PORT="$$site_resolved_port"; \
	export SITE_ORIGIN="http://localhost:$$site_resolved_port"; \
	export HECATEAPI_ENV_FILE="./$(LOCAL_HECATEAPI_ENV_FILE)"; \
	export TAUTH_ENV_FILE="./$(LOCAL_TAUTH_ENV_FILE)"; \
	export TAUTH_CONFIG_TEMPLATE="./$(LOCAL_TAUTH_CONFIG_TEMPLATE)"; \
	billing_provider="$$(trim_quotes "$$(read_env_value "$$HECATEAPI_ENV_FILE" "HECATEAPI_BILLING_PROVIDER")")"; \
	paddle_environment="$$(trim_quotes "$$(read_env_value "$$HECATEAPI_ENV_FILE" "HECATEAPI_PADDLE_ENVIRONMENT")")"; \
	billing_callback_public_url="$${BILLING_CALLBACK_PUBLIC_URL:-$$SITE_ORIGIN}"; \
	billing_ngrok_target_url="$${BILLING_NGROK_TARGET_URL:-http://127.0.0.1:$$site_resolved_port}"; \
	if [ "$$billing_provider" = "paddle" ] && [ "$$paddle_environment" = "sandbox" ]; then \
		if [ "$$billing_callback_public_url" = "$$SITE_ORIGIN" ] && printf '%s' "$$SITE_ORIGIN" | rg -q '^http://localhost(:[0-9]+)?$$'; then \
			billing_callback_public_url="$$(start_billing_ngrok_tunnel "$$billing_ngrok_target_url")"; \
			echo "Started ngrok tunnel for local Paddle sandbox callbacks: $$billing_callback_public_url" >&2; \
		fi; \
		if ! printf '%s' "$$billing_callback_public_url" | rg -q '^https://'; then \
			echo "Paddle sandbox localhost requires a public HTTPS billing callback URL. Set BILLING_CALLBACK_PUBLIC_URL or install ngrok." >&2; \
			exit 1; \
		fi; \
	fi; \
	export BILLING_CALLBACK_PUBLIC_URL="$$billing_callback_public_url"; \
	export APP_CONFIG_SOURCE="./$(RUNTIME_DIR)/config.yml"; \
	export PUBLIC_CONFIGS_SOURCE="./$(RUNTIME_DIR)/public-configs"; \
	export TAUTH_CONFIG_SOURCE="./$(RUNTIME_DIR)/tauth.config.yaml"; \
	export LEDGER_CONFIG_SOURCE="./$(RUNTIME_DIR)/ledger.config.yml"; \
	bash ./scripts/render-runtime-auth-config.sh; \
	bash ./scripts/render-runtime-compose-configs.sh; \
	if ! $(DOCKER_COMPOSE) up -d --build --remove-orphans --wait --wait-timeout 60 $(COMPOSE_UP_ARGS); then \
		echo "Hecate failed to become healthy; stopping the partial stack." >&2; \
		$(DOCKER_COMPOSE) logs --tail=80 hecate-api >&2 || true; \
		$(DOCKER_COMPOSE) down --remove-orphans >/dev/null 2>&1 || true; \
		rm -rf "$(RUNTIME_DIR)"; \
		exit 1; \
	fi; \
	echo "Hecate is starting on $$SITE_ORIGIN"; \
	echo "Host sidecars: TAuth=http://localhost:$$TAUTH_HOST_PORT API=http://localhost:$$HECATE_API_HOST_PORT Ledger=localhost:$$LEDGER_HOST_PORT"; \
	if [ "$$billing_provider" = "paddle" ] && [ "$$paddle_environment" = "sandbox" ]; then \
		echo "Paddle sandbox callback origin: $$BILLING_CALLBACK_PUBLIC_URL"; \
		echo "Paddle sandbox webhook path: $$BILLING_CALLBACK_PUBLIC_URL/api/billing/paddle/webhook"; \
		echo "Paddle default payment link URL: $$BILLING_CALLBACK_PUBLIC_URL/"; \
	fi; \
	echo "Resolved ports written to $(RUNTIME_DIR)/ports.env"

down:
	@if [ -f "$(RUNTIME_DIR)/billing-ngrok.pid" ]; then \
		ngrok_pid="$$(cat "$(RUNTIME_DIR)/billing-ngrok.pid" 2>/dev/null || true)"; \
		if [ -n "$$ngrok_pid" ] && kill -0 "$$ngrok_pid" >/dev/null 2>&1; then \
			kill "$$ngrok_pid" >/dev/null 2>&1 || true; \
		fi; \
		rm -f "$(RUNTIME_DIR)/billing-ngrok.pid" "$(RUNTIME_DIR)/billing-ngrok.log"; \
	fi
	$(DOCKER_COMPOSE) down --remove-orphans $(COMPOSE_DOWN_ARGS)
	rm -rf $(RUNTIME_DIR)

logs:
	$(DOCKER_COMPOSE) logs -f

ps:
	$(DOCKER_COMPOSE) ps

docker-up: up

docker-down: down

docker-logs: logs

docker-ps: ps
