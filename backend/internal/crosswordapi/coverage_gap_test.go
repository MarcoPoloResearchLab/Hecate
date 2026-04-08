package crosswordapi

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	creditv1 "github.com/MarkoPoloResearchLab/ledger/api/credit/v1"
	sharedbilling "github.com/tyemirov/utils/billing"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

type minimalBillingProvider struct {
	code string
}

func (provider minimalBillingProvider) Code() string {
	if provider.code != "" {
		return provider.code
	}
	return billingProviderPaddle
}

func (minimalBillingProvider) PublicConfig() billingPublicConfig {
	return billingPublicConfig{}
}

func (minimalBillingProvider) SignatureHeaderName() string {
	return paddleSignatureHeaderName
}

func (minimalBillingProvider) VerifyWebhookSignature(string, []byte) error {
	return nil
}

func (minimalBillingProvider) ParseWebhookEvent([]byte) (billingProviderEvent, error) {
	return billingProviderEvent{}, nil
}

func (minimalBillingProvider) CreateCheckout(context.Context, string, string, BillingPack) (billingCheckoutSession, error) {
	return billingCheckoutSession{}, nil
}

func (minimalBillingProvider) CreatePortalSession(context.Context, BillingCustomerLink) (billingPortalSession, error) {
	return billingPortalSession{}, nil
}

func TestCoverageGapApplyToRuntimeConfigNilInputs(t *testing.T) {
	cfg := validConfig()

	var nilConfigFile *AppConfigFile
	nilConfigFile.ApplyToRuntimeConfig(&cfg)
	(&AppConfigFile{}).ApplyToRuntimeConfig(nil)
}

func TestCoverageGapPaddleProviderDelegatesSharedHelpers(t *testing.T) {
	provider := &paddleBillingProvider{}

	if _, err := provider.BuildUserSyncEvents(context.Background(), "user@example.com"); !errors.Is(err, sharedbilling.ErrPaddleProviderClientUnavailable) {
		t.Fatalf("expected nil shared provider sync error, got %v", err)
	}
	if _, _, err := provider.BuildCheckoutReconcileEvent(context.Background(), "txn_1"); !errors.Is(err, sharedbilling.ErrPaddleProviderClientUnavailable) {
		t.Fatalf("expected nil shared provider reconcile error, got %v", err)
	}
	if got := provider.ResolveCheckoutEventStatus(paddleEventTypeTransactionCompleted); got != sharedbilling.CheckoutEventStatusUnknown {
		t.Fatalf("expected unknown checkout status without shared provider, got %q", got)
	}

	provider.sharedProvider = &sharedbilling.PaddleProvider{}
	if _, err := provider.BuildUserSyncEvents(context.Background(), "user@example.com"); !errors.Is(err, sharedbilling.ErrPaddleProviderClientUnavailable) {
		t.Fatalf("expected delegated sync error, got %v", err)
	}
	if _, _, err := provider.BuildCheckoutReconcileEvent(context.Background(), "txn_1"); !errors.Is(err, sharedbilling.ErrPaddleProviderClientUnavailable) {
		t.Fatalf("expected delegated reconcile error, got %v", err)
	}
	if got := provider.ResolveCheckoutEventStatus(paddleEventTypeTransactionCompleted); got != sharedbilling.CheckoutEventStatusSucceeded {
		t.Fatalf("expected delegated checkout status to resolve completed, got %q", got)
	}
}

func TestCoverageGapBillingServiceSyncBranches(t *testing.T) {
	service := &billingService{
		cfg:          validBillingConfig(),
		ledgerClient: &mockLedgerClient{},
		logger:       zap.NewNop(),
		provider:     minimalBillingProvider{},
		store:        &mockStore{},
	}

	if err := service.SyncUserBillingEvents(context.Background(), "user-1", "user@example.com"); !errors.Is(err, sharedbilling.ErrBillingUserSyncFailed) {
		t.Fatalf("expected unsupported sync provider error, got %v", err)
	}

	service.provider = &mockBillingProvider{
		code: billingProviderPaddle,
		syncEvents: []sharedbilling.WebhookEvent{
			{
				ProviderCode: billingProviderPaddle,
				EventID:      "sync:txn_parse_fail",
				EventType:    paddleEventTypeTransactionCompleted,
				OccurredAt:   time.Date(2026, time.April, 1, 9, 0, 0, 0, time.UTC),
				Payload:      []byte(`{"data":{}}`),
			},
		},
		parseErr: errors.New("parse failed"),
	}

	if err := service.SyncUserBillingEvents(context.Background(), "user-1", "user@example.com"); err == nil || !errors.Is(err, sharedbilling.ErrBillingUserSyncFailed) {
		t.Fatalf("expected wrapped sync parse failure, got %v", err)
	}
}

func TestCoverageGapBillingServiceReconcileBranches(t *testing.T) {
	service := &billingService{
		cfg:          validBillingConfig(),
		ledgerClient: &mockLedgerClient{},
		logger:       zap.NewNop(),
		provider:     minimalBillingProvider{},
		store:        &mockStore{},
	}

	if _, err := service.ReconcileCheckout(context.Background(), "user-1", "user@example.com", "txn_1"); !errors.Is(err, sharedbilling.ErrBillingCheckoutReconciliationUnsupported) {
		t.Fatalf("expected unsupported reconcile error, got %v", err)
	}

	service.provider = &mockBillingProvider{code: billingProviderPaddle}
	if _, err := service.ReconcileCheckout(context.Background(), "user-1", " ", "txn_1"); !errors.Is(err, sharedbilling.ErrBillingUserEmailInvalid) {
		t.Fatalf("expected invalid reconcile email error, got %v", err)
	}
	if _, err := service.ReconcileCheckout(context.Background(), "user-1", "user@example.com", " "); !errors.Is(err, sharedbilling.ErrPaddleAPITransactionNotFound) {
		t.Fatalf("expected blank transaction error, got %v", err)
	}

	service.provider = &mockBillingProvider{
		code: billingProviderPaddle,
		reconcileEvent: sharedbilling.WebhookEvent{
			ProviderCode: billingProviderPaddle,
			EventID:      "reconcile:txn_parse_fail",
			EventType:    paddleEventTypeTransactionCompleted,
			OccurredAt:   time.Date(2026, time.April, 1, 9, 5, 0, 0, time.UTC),
			Payload:      []byte(`{"data":{}}`),
		},
		reconcileEmail: "user@example.com",
		resolveStatus:  sharedbilling.CheckoutEventStatusSucceeded,
		parseErr:       errors.New("parse failed"),
	}
	if _, err := service.ReconcileCheckout(context.Background(), "user-1", "user@example.com", "txn_parse_fail"); err == nil || err.Error() != "parse failed" {
		t.Fatalf("expected reconcile parse failure, got %v", err)
	}
}

func TestCoverageGapProcessSharedProviderEventBranches(t *testing.T) {
	if err := (*billingService)(nil).processSharedProviderEvent(context.Background(), sharedbilling.WebhookEvent{}, "user-1"); !errors.Is(err, errBillingServiceUnavailable) {
		t.Fatalf("expected unavailable shared provider event error, got %v", err)
	}

	service := &billingService{
		cfg:          validBillingConfig(),
		ledgerClient: &mockLedgerClient{},
		logger:       zap.NewNop(),
		provider:     &mockBillingProvider{code: billingProviderPaddle},
		store:        &mockStore{},
	}
	if err := service.processSharedProviderEvent(context.Background(), sharedbilling.WebhookEvent{Payload: []byte("not-json")}, "user-1"); err == nil {
		t.Fatal("expected wrapped payload parse error")
	}

	service.provider = &mockBillingProvider{
		code:     billingProviderPaddle,
		parseErr: errors.New("parse failed"),
	}
	if err := service.processSharedProviderEvent(context.Background(), sharedbilling.WebhookEvent{Payload: []byte(`{"data":{}}`)}, "user-1"); err == nil || err.Error() != "parse failed" {
		t.Fatalf("expected provider parse error, got %v", err)
	}
}

func TestCoverageGapProcessSharedProviderEventBackfillsFallbackUserAndProvider(t *testing.T) {
	var grantRequest *creditv1.GrantRequest
	var createdRecord *BillingEventRecord
	var upsertedLink *BillingCustomerLink

	service := &billingService{
		cfg: validBillingConfig(),
		ledgerClient: &mockLedgerClient{
			grantFunc: func(ctx context.Context, in *creditv1.GrantRequest, opts ...grpc.CallOption) (*creditv1.Empty, error) {
				grantRequest = in
				return &creditv1.Empty{}, nil
			},
		},
		logger: zap.NewNop(),
		provider: &mockBillingProvider{
			code: billingProviderPaddle,
			eventRecord: BillingEventRecord{
				EventID:       "evt_fallback",
				EventType:     paddleEventTypeTransactionCompleted,
				TransactionID: "txn_fallback",
				CreditsDelta:  20,
				OccurredAt:    time.Date(2026, time.April, 1, 9, 10, 0, 0, time.UTC),
			},
			customerLink: &BillingCustomerLink{
				PaddleCustomerID: "ctm_fallback",
				Email:            "user@example.com",
			},
			grantEvent: &BillingGrantEvent{
				Credits: 20,
				EventID: "evt_fallback",
			},
		},
		store: &mockStore{
			upsertBillingCustomerLinkFunc: func(link *BillingCustomerLink) error {
				copyLink := *link
				upsertedLink = &copyLink
				return nil
			},
			createBillingEventRecordFunc: func(record *BillingEventRecord) error {
				copyRecord := *record
				createdRecord = &copyRecord
				return nil
			},
		},
	}

	err := service.processSharedProviderEvent(context.Background(), sharedbilling.WebhookEvent{
		ProviderCode: billingProviderPaddle,
		EventID:      "sync:txn_fallback",
		EventType:    paddleEventTypeTransactionCompleted,
		OccurredAt:   time.Date(2026, time.April, 1, 9, 10, 0, 0, time.UTC),
		Payload:      []byte(`{"data":{}}`),
	}, "fallback-user")
	if err != nil {
		t.Fatalf("processSharedProviderEvent() error = %v", err)
	}
	if grantRequest == nil || grantRequest.GetUserId() != "fallback-user" || grantRequest.GetIdempotencyKey() != "billing:paddle:evt_fallback" {
		t.Fatalf("unexpected fallback grant request %#v", grantRequest)
	}
	if upsertedLink == nil || upsertedLink.UserID != "fallback-user" || upsertedLink.Provider != billingProviderPaddle {
		t.Fatalf("unexpected fallback customer link %#v", upsertedLink)
	}
	if createdRecord == nil || createdRecord.UserID != "fallback-user" || createdRecord.Provider != billingProviderPaddle {
		t.Fatalf("unexpected fallback billing event record %#v", createdRecord)
	}
}

func TestCoverageGapProcessProviderEventGuardsAndErrors(t *testing.T) {
	if err := (*billingService)(nil).processProviderEvent(context.Background(), billingProviderEvent{}); !errors.Is(err, errBillingServiceUnavailable) {
		t.Fatalf("expected unavailable provider event error, got %v", err)
	}

	service := &billingService{
		cfg:          validBillingConfig(),
		ledgerClient: &mockLedgerClient{},
		logger:       zap.NewNop(),
		provider:     &mockBillingProvider{code: billingProviderPaddle},
	}
	if err := service.processProviderEvent(context.Background(), billingProviderEvent{}); err == nil || err.Error() != "billing store is required" {
		t.Fatalf("expected missing store error, got %v", err)
	}

	service.store = &mockStore{
		hasBillingCreditedTransactionFunc: func(provider string, transactionID string) (bool, error) {
			return false, errors.New("credited lookup failed")
		},
	}
	err := service.processProviderEvent(context.Background(), billingProviderEvent{
		EventRecord: BillingEventRecord{
			EventID:       "evt_lookup_fail",
			EventType:     paddleEventTypeTransactionCompleted,
			TransactionID: "txn_lookup_fail",
			CreditsDelta:  20,
			OccurredAt:    time.Date(2026, time.April, 1, 9, 15, 0, 0, time.UTC),
		},
		GrantEvent: &BillingGrantEvent{
			User:     "user-1",
			Credits:  20,
			EventID:  "evt_lookup_fail",
			Provider: billingProviderPaddle,
		},
	})
	if err == nil || err.Error() != "credited lookup failed" {
		t.Fatalf("expected credited transaction lookup error, got %v", err)
	}
}

func TestCoverageGapHasCreditedTransactionBranches(t *testing.T) {
	exists, err := (*billingService)(nil).hasCreditedTransaction(BillingEventRecord{
		CreditsDelta:  20,
		TransactionID: "txn_nil_service",
	})
	if err != nil || exists {
		t.Fatalf("expected nil service duplicate check to return false,nil, got exists=%v err=%v", exists, err)
	}

	service := &billingService{
		store: &mockStore{},
	}
	exists, err = service.hasCreditedTransaction(BillingEventRecord{
		CreditsDelta:  20,
		TransactionID: " ",
	})
	if err != nil || exists {
		t.Fatalf("expected blank transaction duplicate check to return false,nil, got exists=%v err=%v", exists, err)
	}

	service.store = &mockStore{
		hasBillingCreditedTransactionFunc: func(provider string, transactionID string) (bool, error) {
			return false, errors.New("store lookup failed")
		},
	}
	_, err = service.hasCreditedTransaction(BillingEventRecord{
		CreditsDelta:  20,
		TransactionID: "txn_store_fail",
	})
	if err == nil || err.Error() != "store lookup failed" {
		t.Fatalf("expected store duplicate check error, got %v", err)
	}
}

func TestCoverageGapBillingWebhookPayloadHelpers(t *testing.T) {
	if got := resolveBillingCheckoutEventStatus(minimalBillingProvider{}, paddleEventTypeTransactionCompleted); got != sharedbilling.CheckoutEventStatusUnknown {
		t.Fatalf("expected unknown checkout status without status provider, got %q", got)
	}

	if _, err := wrapBillingWebhookPayload(sharedbilling.WebhookEvent{Payload: []byte("not-json")}); err == nil {
		t.Fatal("expected invalid webhook envelope error")
	}
	if _, err := wrapBillingWebhookPayload(sharedbilling.WebhookEvent{Payload: []byte(`{}`)}); err == nil || err.Error() != "billing webhook payload missing data" {
		t.Fatalf("expected missing data error, got %v", err)
	}
}

func TestCoverageGapServerBillingHandlers(t *testing.T) {
	t.Run("billing sync returns internal error when provider is missing", func(t *testing.T) {
		handler := testHandlerWithConfig(&mockLedgerClient{}, nil, &mockStore{}, validBillingConfig())
		handler.billingService = &billingService{
			cfg:          validBillingConfig(),
			ledgerClient: &mockLedgerClient{},
			logger:       zap.NewNop(),
			store:        &mockStore{},
		}
		router := testRouterWithClaims(handler, testClaims())

		response := doRequest(router, http.MethodPost, "/api/billing/sync", `{}`)
		if response.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500 from billing sync with missing provider, got %d", response.Code)
		}
	})

	t.Run("billing sync returns gateway error for sync failures", func(t *testing.T) {
		handler := testHandlerWithConfig(&mockLedgerClient{}, nil, &mockStore{}, validBillingConfig())
		handler.billingService = &billingService{
			cfg:          validBillingConfig(),
			ledgerClient: &mockLedgerClient{},
			logger:       zap.NewNop(),
			provider:     minimalBillingProvider{},
			store:        &mockStore{},
		}
		router := testRouterWithClaims(handler, testClaims())

		response := doRequest(router, http.MethodPost, "/api/billing/sync", `{}`)
		if response.Code != http.StatusBadGateway {
			t.Fatalf("expected 502 from billing sync failure, got %d", response.Code)
		}
	})

	t.Run("billing reconcile returns internal error when provider is missing", func(t *testing.T) {
		handler := testHandlerWithConfig(&mockLedgerClient{}, nil, &mockStore{}, validBillingConfig())
		handler.billingService = &billingService{
			cfg:          validBillingConfig(),
			ledgerClient: &mockLedgerClient{},
			logger:       zap.NewNop(),
			store:        &mockStore{},
		}
		router := testRouterWithClaims(handler, testClaims())

		response := doRequest(router, http.MethodPost, "/api/billing/checkout/reconcile", `{"transaction_id":"txn_1"}`)
		if response.Code != http.StatusInternalServerError {
			t.Fatalf("expected 500 from billing reconcile with missing provider, got %d", response.Code)
		}
	})

	t.Run("billing reconcile requires an account email", func(t *testing.T) {
		handler := testHandlerWithConfig(&mockLedgerClient{}, nil, &mockStore{}, validBillingConfig())
		handler.billingService = &billingService{
			cfg:          validBillingConfig(),
			ledgerClient: &mockLedgerClient{},
			logger:       zap.NewNop(),
			provider:     &mockBillingProvider{code: billingProviderPaddle},
			store:        &mockStore{},
		}
		claims := testClaims()
		claims.UserEmail = " "
		router := testRouterWithClaims(handler, claims)

		response := doRequest(router, http.MethodPost, "/api/billing/checkout/reconcile", `{"transaction_id":"txn_1"}`)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 from billing reconcile without email, got %d", response.Code)
		}
	})

	t.Run("billing reconcile reports unsupported provider capability", func(t *testing.T) {
		handler := testHandlerWithConfig(&mockLedgerClient{}, nil, &mockStore{}, validBillingConfig())
		handler.billingService = &billingService{
			cfg:          validBillingConfig(),
			ledgerClient: &mockLedgerClient{},
			logger:       zap.NewNop(),
			provider:     minimalBillingProvider{},
			store:        &mockStore{},
		}
		router := testRouterWithClaims(handler, testClaims())

		response := doRequest(router, http.MethodPost, "/api/billing/checkout/reconcile", `{"transaction_id":"txn_1"}`)
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected 503 from unsupported billing reconcile provider, got %d", response.Code)
		}
	})

	t.Run("billing reconcile returns gateway error for unexpected failures", func(t *testing.T) {
		handler := testHandlerWithConfig(&mockLedgerClient{}, nil, &mockStore{}, validBillingConfig())
		handler.billingService = &billingService{
			cfg:          validBillingConfig(),
			ledgerClient: &mockLedgerClient{},
			logger:       zap.NewNop(),
			provider: &mockBillingProvider{
				code:         billingProviderPaddle,
				reconcileErr: errors.New("reconcile exploded"),
			},
			store: &mockStore{},
		}
		router := testRouterWithClaims(handler, testClaims())

		response := doRequest(router, http.MethodPost, "/api/billing/checkout/reconcile", `{"transaction_id":"txn_1"}`)
		if response.Code != http.StatusBadGateway {
			t.Fatalf("expected 502 from unexpected billing reconcile failure, got %d", response.Code)
		}
	})
}

func TestCoverageGapGormStoreHasBillingCreditedTransactionError(t *testing.T) {
	store, ok := testStore(t).(*gormStore)
	if !ok {
		t.Fatal("expected test store to be a *gormStore")
	}

	sqlDB, err := store.db.DB()
	if err != nil {
		t.Fatalf("store.db.DB() error = %v", err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatalf("sqlDB.Close() error = %v", err)
	}

	if _, err := store.HasBillingCreditedTransaction(billingProviderPaddle, "txn_closed_db"); err == nil {
		t.Fatal("expected HasBillingCreditedTransaction() to fail after database close")
	}
}
