package v1

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/usememos/memos/store"
)

const (
	sseDataPrefix            = "data: "
	sseClientEventBufferSize = 32
	memoChangedSSEFrame      = "data: {\"type\":\"memo.changed\"}\n\n"
	spaceChangedSSEFrame     = "data: {\"type\":\"space.changed\"}\n\n"
)

// SSEEventType represents the type of change event.
type SSEEventType string

const (
	SSEEventMemoCreated        SSEEventType = "memo.created"
	SSEEventMemoUpdated        SSEEventType = "memo.updated"
	SSEEventMemoDeleted        SSEEventType = "memo.deleted"
	SSEEventMemoCommentCreated SSEEventType = "memo.comment.created"
	SSEEventReactionUpserted   SSEEventType = "reaction.upserted"
	SSEEventReactionDeleted    SSEEventType = "reaction.deleted"
)

// SSEEvent represents a subject-specific change event sent to authorized clients.
type SSEEvent struct {
	Type       SSEEventType     `json:"type"`
	Name       string           `json:"name"`
	Parent     string           `json:"parent,omitempty"`
	Visibility store.Visibility `json:"-"`
	CreatorID  int32            `json:"-"`
}

// Frame returns the event encoded as a complete SSE data frame.
func (e *SSEEvent) Frame() []byte {
	data, err := json.Marshal(e)
	if err != nil {
		slog.Error("failed to marshal SSE event", "err", err, "event", e)
		return nil
	}
	frame := make([]byte, 0, len(sseDataPrefix)+len(data)+2)
	frame = append(frame, sseDataPrefix...)
	frame = append(frame, data...)
	frame = append(frame, '\n', '\n')
	return frame
}

// SSEClient represents a single SSE connection.
type SSEClient struct {
	events chan []byte
	done   chan struct{}
	userID int32
	role   store.Role
}

// SSEHub manages SSE client connections and broadcasts events.
// It is safe for concurrent use.
type SSEHub struct {
	mu      sync.RWMutex
	clients map[*SSEClient]struct{}
	closed  bool
}

// NewSSEHub creates a new SSE hub.
func NewSSEHub() *SSEHub {
	return &SSEHub{
		clients: make(map[*SSEClient]struct{}),
	}
}

// Subscribe registers a new client and returns it.
// The caller must call Unsubscribe when done.
func (h *SSEHub) Subscribe() *SSEClient {
	return h.subscribe(0, store.RoleUser)
}

// SubscribeForUser registers a client with identity-aware event filtering.
func (h *SSEHub) SubscribeForUser(userID int32, role store.Role) *SSEClient {
	return h.subscribe(userID, role)
}

func (h *SSEHub) subscribe(userID int32, role store.Role) *SSEClient {
	c := &SSEClient{
		// Buffer a few events so a slow client doesn't block broadcasting.
		events: make(chan []byte, sseClientEventBufferSize),
		done:   make(chan struct{}),
		userID: userID,
		role:   role,
	}
	h.mu.Lock()
	if h.closed {
		close(c.done)
		close(c.events)
	} else {
		h.clients[c] = struct{}{}
	}
	h.mu.Unlock()
	return c
}

// Broadcast sends a subject-specific event only to clients allowed to see it.
func (h *SSEHub) Broadcast(event *SSEEvent) {
	if event == nil {
		return
	}
	if event.Visibility == store.SpaceAudience {
		// Space membership is not held by the hub. Send the subject-free refresh
		// signal to authenticated clients instead of leaking the memo name.
		h.publishFrame([]byte(memoChangedSSEFrame), func(client *SSEClient) bool { return client.userID != 0 })
		return
	}
	if !event.hasKnownVisibility() {
		return
	}
	frame := event.Frame()
	if len(frame) == 0 {
		return
	}
	h.publishFrame(frame, func(client *SSEClient) bool { return client.userID != 0 && client.canReceive(event) })
}

// Unsubscribe removes a client and closes its channels.
func (h *SSEHub) Unsubscribe(c *SSEClient) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.done)
		close(c.events)
	}
	h.mu.Unlock()
}

// Close disconnects all subscribed SSE clients.
func (h *SSEHub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.closed = true
	for c := range h.clients {
		delete(h.clients, c)
		close(c.done)
		close(c.events)
	}
}

// publishMemoChanged tells connected clients to refresh memo-backed caches.
// The event deliberately carries no subject or authorization-sensitive data.
// Slow clients with a full buffer are disconnected so they can reconnect and
// resynchronize instead of silently missing an event.
func (h *SSEHub) publishMemoChanged() {
	// Identity-free subscribers use the official subject-free refresh protocol.
	// Authenticated subscribers receive one precise event from Broadcast instead.
	h.publishFrame([]byte(memoChangedSSEFrame), func(client *SSEClient) bool { return client.userID == 0 })
}

// publishSpaceChanged tells connected clients to refresh Space-backed caches
// and caches whose visibility or presentation depends on Space state.
// Like memo.changed, the event carries no authorization-sensitive data.
func (h *SSEHub) publishSpaceChanged() {
	h.publishFrame([]byte(spaceChangedSSEFrame), nil)
}

func (h *SSEHub) publishFrame(frame []byte, allow func(*SSEClient) bool) {
	var slowClients []*SSEClient
	h.mu.RLock()
	for c := range h.clients {
		if allow != nil && !allow(c) {
			continue
		}
		select {
		case c.events <- frame:
		default:
			slowClients = append(slowClients, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range slowClients {
		h.Unsubscribe(c)
	}
}

func (e *SSEEvent) hasKnownVisibility() bool {
	switch e.Visibility {
	case store.Private, store.Public, store.Protected, "":
		return true
	default:
		slog.Warn("SSE event has unsupported visibility; denying broadcast", "visibility", string(e.Visibility))
		return false
	}
}

func (c *SSEClient) canReceive(event *SSEEvent) bool {
	switch event.Visibility {
	case store.Private:
		return c.userID == event.CreatorID || c.role == store.RoleAdmin
	case store.Public, store.Protected, "":
		return true
	default:
		return false
	}
}
