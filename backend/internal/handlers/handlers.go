// Package handlers turns HTTP requests into database work and JSON replies.
package handlers

import (
	"net/http"
	"strconv"
	"time"

	"shetrust/backend/internal/auth"
	"shetrust/backend/internal/config"
	"shetrust/backend/internal/database"
	"shetrust/backend/internal/events"
	"shetrust/backend/internal/middleware"
	"shetrust/backend/internal/response"
	"shetrust/backend/internal/sti"
)

// M is a local alias so handlers can write M{...} instead of
// response.M{...} on every line.
type M = response.M

// Handlers carries everything the HTTP layer needs.
//
// Bundling the dependencies in one struct — rather than reaching for
// package-level globals — is what makes each handler's requirements
// visible, and makes the whole thing testable.
type Handlers struct {
	Config config.Config
	DB     *database.DB
	Hub    *events.Hub
	STI    *sti.Engine
	Auth   *auth.Authenticator
}

// New wires the handlers up.
func New(cfg config.Config, db *database.DB, hub *events.Hub, engine *sti.Engine, authn *auth.Authenticator) *Handlers {
	return &Handlers{
		Config: cfg,
		DB:     db,
		Hub:    hub,
		STI:    engine,
		Auth:   authn,
	}
}

// Routes lists every URL this API answers, and wraps the whole thing in
// the middleware that applies to all of them.
//
// http.ServeMux is the standard library's router. Since Go 1.22 its
// patterns understand methods ("GET /x") and wildcards ("/x/{id}"), which
// is why this project needs no routing library at all.
//
// More specific patterns win, so "/api/locations/heatmap" is matched before
// "/api/locations/{id}" regardless of the order they are registered in.
func (h *Handlers) Routes() http.Handler {
	mux := http.NewServeMux()

	// Rate limiters. Each tracks requests per IP in its own time window.
	authLimiter := middleware.NewRateLimiter(10, 15*time.Minute,
		"Too many auth attempts. Please try again in 15 minutes.")
	ratingsLimiter := middleware.NewRateLimiter(20, time.Hour,
		"Rating limit reached.")
	globalLimiter := middleware.NewRateLimiter(200, 15*time.Minute,
		"Too many requests.")

	// withAuth is used often enough to be worth a short name.
	withAuth := h.Auth.Middleware

	// ── Health ───────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/health", h.Health)

	// ── Live updates (Server-Sent Events) ────────────────────────────
	mux.HandleFunc("GET /api/events", h.Hub.Handle)

	// ── Auth ─────────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/auth/signup", authLimiter.Wrap(h.Signup))
	mux.HandleFunc("POST /api/auth/login", authLimiter.Wrap(h.Login))
	mux.HandleFunc("GET /api/auth/me", h.Me)
	mux.HandleFunc("POST /api/auth/logout", h.Logout)

	// ── Locations ────────────────────────────────────────────────────
	mux.HandleFunc("GET /api/locations", h.ListLocations)
	mux.HandleFunc("GET /api/locations/heatmap", h.Heatmap)
	mux.HandleFunc("GET /api/locations/search/{query}", h.SearchLocations)
	mux.HandleFunc("GET /api/locations/{id}", h.GetLocation)
	mux.HandleFunc("POST /api/locations", withAuth(h.CreateLocation))

	// ── Ratings ──────────────────────────────────────────────────────
	// withAuth runs first so every rating gets a token to belong to.
	mux.HandleFunc("POST /api/ratings", ratingsLimiter.Wrap(withAuth(h.SubmitRating)))
	mux.HandleFunc("GET /api/ratings/my", withAuth(h.MyRatings))
	mux.HandleFunc("GET /api/ratings/location/{locationId}", h.RatingsForLocation)
	mux.HandleFunc("GET /api/ratings/location/{locationId}/trend", h.RatingTrend)

	// ── Survey ───────────────────────────────────────────────────────
	mux.HandleFunc("POST /api/survey", withAuth(h.SubmitSurvey))
	mux.HandleFunc("GET /api/survey/stats", h.SurveyStats)
	mux.HandleFunc("GET /api/survey/weights", h.SurveyWeights)

	// ── Anything else ────────────────────────────────────────────────
	// "/" matches whatever no other pattern claimed.
	mux.HandleFunc("/", h.NotFound)

	// The outermost wrapper runs first, so reading top to bottom the order
	// is: recover -> log -> CORS -> global rate limit -> the route.
	var handler http.Handler = mux
	handler = globalLimiter.WrapAll(handler)
	handler = middleware.CORS(h.Config.AllowedOrigins(), handler)
	handler = middleware.Logging(handler)
	handler = middleware.Recovery(handler)

	return handler
}

// NotFound replies with JSON rather than Go's default HTML page, so the
// frontend's error handling works the same way for every failure.
func (h *Handlers) NotFound(w http.ResponseWriter, r *http.Request) {
	response.Error(w, http.StatusNotFound, r.Method+" "+r.URL.Path+" not found")
}

// ─── Query-parameter helpers ─────────────────────────────────────────────

// queryInt reads an integer query parameter, falling back when it is
// missing or not a number.
func queryInt(r *http.Request, name string, fallback int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil {
		return fallback
	}
	return value
}

// queryFloat is queryInt for decimals.
func queryFloat(r *http.Request, name string, fallback float64) float64 {
	value, err := strconv.ParseFloat(r.URL.Query().Get(name), 64)
	if err != nil {
		return fallback
	}
	return value
}

// queryString reads a string query parameter with a fallback.
func queryString(r *http.Request, name, fallback string) string {
	if value := r.URL.Query().Get(name); value != "" {
		return value
	}
	return fallback
}
