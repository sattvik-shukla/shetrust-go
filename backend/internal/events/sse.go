// Package events pushes live updates to connected browsers using
// Server-Sent Events.
//
// The Node version used Socket.io. Go has no good Socket.io server, and for
// what this app actually needs — the server telling browsers "this
// location's score just changed" — Socket.io was overkill anyway. Messages
// only ever travel one way: server to browser.
//
// SSE is exactly that, and every browser has it built in as EventSource.
// The entire protocol is a long-lived HTTP response we never close, with
// plain text written into it as things happen:
//
//	event: heatmap-update
//	data: {"locationId":"abc","sti":6.2}
//	                                      <- blank line ends the message
//
// That is the whole specification. No handshake, no framing, no library.
package events

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"shetrust/backend/internal/response"
)

// keepAliveInterval is how often we poke an idle connection. Proxies tend
// to drop a stream that has been silent for too long.
const keepAliveInterval = 25 * time.Second

// message is one event waiting to be written to one browser.
type message struct {
	event string
	data  string
}

// Hub keeps the set of currently connected browsers.
//
// Each one gets its own buffered channel. Broadcasting means pushing the
// message onto every channel; each connection's own goroutine then writes
// it out.
type Hub struct {
	mu      sync.Mutex
	clients map[chan message]bool
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{clients: make(map[chan message]bool)}
}

// Broadcast sends an event to every connected browser.
func (h *Hub) Broadcast(event string, payload any) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		log.Printf("could not encode %q event: %v", event, err)
		return
	}

	msg := message{event: event, data: string(encoded)}

	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		// select with a default makes this a non-blocking send: if one
		// browser is too slow to keep up we skip it rather than freezing
		// everyone else. Losing a heatmap tick is harmless — the frontend
		// also refetches every 60 seconds.
		select {
		case client <- msg:
		default:
			log.Printf("dropping %q event for a slow client", event)
		}
	}
}

// Handle is the GET /api/events endpoint the browser connects to.
func (h *Hub) Handle(w http.ResponseWriter, r *http.Request) {
	// http.Flusher lets us push bytes out immediately instead of waiting
	// for Go to fill a buffer. Without it the browser receives nothing.
	flusher, ok := w.(http.Flusher)
	if !ok {
		response.Error(w, http.StatusInternalServerError, "Streaming is not supported here.")
		return
	}

	// These headers are what make the browser treat the reply as a stream.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // stop nginx buffering the stream

	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, ": connected\n\n") // a comment line, proves the stream is open
	flusher.Flush()

	client := h.subscribe()
	defer h.unsubscribe(client)

	keepAlive := time.NewTicker(keepAliveInterval)
	defer keepAlive.Stop()

	for {
		select {
		case msg := <-client:
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.event, msg.data)
			flusher.Flush()

		case <-keepAlive.C:
			fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()

		case <-r.Context().Done():
			// The browser closed the tab or navigated away.
			return
		}
	}
}

// subscribe registers a new browser and returns its channel.
func (h *Hub) subscribe() chan message {
	// Buffered: brief slowness on one connection should not block whoever
	// is broadcasting.
	client := make(chan message, 8)

	h.mu.Lock()
	h.clients[client] = true
	count := len(h.clients)
	h.mu.Unlock()

	log.Printf("SSE client connected (%d total)", count)
	return client
}

// unsubscribe removes a browser that has gone away.
func (h *Hub) unsubscribe(client chan message) {
	h.mu.Lock()
	if h.clients[client] {
		delete(h.clients, client)
		close(client)
	}
	count := len(h.clients)
	h.mu.Unlock()

	log.Printf("SSE client disconnected (%d total)", count)
}
