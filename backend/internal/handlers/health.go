package handlers

import (
	"context"
	"net/http"
	"time"

	"shetrust/backend/internal/response"
)

// Health is what uptime monitors and deploy platforms poll.
//
// GET /api/health
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	databaseStatus := "connected"
	if err := h.DB.Client.Ping(ctx, nil); err != nil {
		databaseStatus = "disconnected"
	}

	// Deliberately not wrapped in { success, data } — the frontend's health
	// check reads these fields directly.
	response.JSON(w, http.StatusOK, M{
		"status":    "ok",
		"service":   "SheTrust API",
		"version":   "3.0.0-go",
		"db":        databaseStatus,
		"timestamp": time.Now(),
		"features":  []string{"locations", "ratings", "survey", "sti-engine", "live-updates"},
	})
}
