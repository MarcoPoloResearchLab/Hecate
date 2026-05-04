package crosswordapi

import (
	"strings"
	"sync"
)

type billingUpdateEvent struct {
	EventType string `json:"event_type"`
	Status    string `json:"status"`
}

type billingEventNotifier interface {
	Publish(userID string, event billingUpdateEvent)
}

type billingEventHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan billingUpdateEvent]struct{}
}

func newBillingEventHub() *billingEventHub {
	return &billingEventHub{
		subscribers: make(map[string]map[chan billingUpdateEvent]struct{}),
	}
}

func (hub *billingEventHub) Publish(userID string, event billingUpdateEvent) {
	normalizedUserID := strings.TrimSpace(userID)
	if hub == nil || normalizedUserID == "" {
		return
	}

	hub.mu.Lock()
	defer hub.mu.Unlock()
	for subscriber := range hub.subscribers[normalizedUserID] {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func (hub *billingEventHub) Subscribe(userID string) (<-chan billingUpdateEvent, func()) {
	normalizedUserID := strings.TrimSpace(userID)
	events := make(chan billingUpdateEvent, 4)
	if hub == nil || normalizedUserID == "" {
		close(events)
		return events, func() {}
	}

	hub.mu.Lock()
	if hub.subscribers[normalizedUserID] == nil {
		hub.subscribers[normalizedUserID] = make(map[chan billingUpdateEvent]struct{})
	}
	hub.subscribers[normalizedUserID][events] = struct{}{}
	hub.mu.Unlock()

	return events, func() {
		hub.mu.Lock()
		userSubscribers := hub.subscribers[normalizedUserID]
		_, subscribed := userSubscribers[events]
		if userSubscribers != nil {
			delete(userSubscribers, events)
			if len(userSubscribers) == 0 {
				delete(hub.subscribers, normalizedUserID)
			}
		}
		hub.mu.Unlock()
		if subscribed {
			close(events)
		}
	}
}
