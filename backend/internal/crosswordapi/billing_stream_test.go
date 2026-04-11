package crosswordapi

import (
	"bufio"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBillingEventHubPublish_IgnoresNilHubOrEmptyUserID(t *testing.T) {
	var nilHub *billingEventHub
	nilHub.Publish("user-123", billingUpdateEvent{Status: "completed"})

	newBillingEventHub().Publish(" ", billingUpdateEvent{Status: "completed"})
}

func TestBillingEventHubSubscribe_EmptyUserID(t *testing.T) {
	events, unsubscribe := newBillingEventHub().Subscribe(" ")
	defer unsubscribe()

	if _, open := <-events; open {
		t.Fatal("expected closed event stream for empty user id")
	}
}

func TestBillingEventHubPublish_DropsWhenSubscriberBufferIsFull(t *testing.T) {
	hub := newBillingEventHub()
	events, unsubscribe := hub.Subscribe("user-123")
	defer unsubscribe()

	for i := 0; i < 5; i++ {
		hub.Publish("user-123", billingUpdateEvent{Status: "completed"})
	}

	for i := 0; i < 4; i++ {
		select {
		case <-events:
		case <-time.After(time.Second):
			t.Fatal("expected buffered billing event")
		}
	}

	select {
	case <-events:
		t.Fatal("expected overflow billing event to be dropped")
	default:
	}
}

func TestHandleBillingEvents_Unauthorized(t *testing.T) {
	handler := testHandler(&mockLedgerClient{}, nil)
	router := testRouterWithClaims(handler, nil)
	response := doRequest(router, http.MethodGet, "/api/billing/events", "")

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
}

func TestHandleBillingEvents_Unavailable(t *testing.T) {
	handler := testHandler(&mockLedgerClient{}, nil)
	router := testRouterWithClaims(handler, testClaims())
	response := doRequest(router, http.MethodGet, "/api/billing/events", "")

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", response.Code)
	}
}

func TestHandleBillingEvents_StreamsPublishedEvent(t *testing.T) {
	handler := testHandler(&mockLedgerClient{}, nil)
	handler.billingEvents = newBillingEventHub()
	router := testRouterWithClaims(handler, testClaims())
	server := httptest.NewServer(router)
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/api/billing/events", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()

	go func() {
		time.Sleep(10 * time.Millisecond)
		handler.billingEvents.Publish("user-123", billingUpdateEvent{
			EventType: paddleEventTypeTransactionCompleted,
			Status:    "completed",
		})
	}()

	reader := bufio.NewReader(response.Body)
	var dataLine string
	for {
		line, readErr := reader.ReadString('\n')
		if readErr != nil {
			t.Fatalf("ReadString() error = %v", readErr)
		}
		if strings.HasPrefix(line, "data: ") {
			dataLine = strings.TrimSpace(strings.TrimPrefix(line, "data: "))
			break
		}
	}

	expectedPayload := `{"event_type":"transaction.completed","status":"completed"}`
	if dataLine != expectedPayload {
		t.Fatalf("expected %s, got %s", expectedPayload, dataLine)
	}
}

func TestHandleBillingEvents_ReturnsWhenStreamCloses(t *testing.T) {
	handler := testHandler(&mockLedgerClient{}, nil)
	handler.billingEvents = newBillingEventHub()
	router := testRouterWithClaims(handler, testClaims())
	server := httptest.NewServer(router)
	defer server.Close()

	request, err := http.NewRequest(http.MethodGet, server.URL+"/api/billing/events", nil)
	if err != nil {
		t.Fatalf("NewRequest() error = %v", err)
	}

	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		t.Fatalf("Do() error = %v", err)
	}
	defer response.Body.Close()

	userID := testClaims().GetUserID()
	var stream chan billingUpdateEvent
	deadline := time.Now().Add(time.Second)
	for stream == nil && time.Now().Before(deadline) {
		handler.billingEvents.mu.Lock()
		for subscriber := range handler.billingEvents.subscribers[userID] {
			stream = subscriber
			delete(handler.billingEvents.subscribers[userID], subscriber)
			if len(handler.billingEvents.subscribers[userID]) == 0 {
				delete(handler.billingEvents.subscribers, userID)
			}
			break
		}
		handler.billingEvents.mu.Unlock()
		if stream == nil {
			time.Sleep(10 * time.Millisecond)
		}
	}

	if stream == nil {
		t.Fatal("expected billing event subscriber to be registered")
	}

	close(stream)

	done := make(chan error, 1)
	go func() {
		_, readErr := io.ReadAll(response.Body)
		done <- readErr
	}()

	select {
	case readErr := <-done:
		if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
			t.Fatalf("ReadAll() error = %v", readErr)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for billing event stream to close")
	}
}
