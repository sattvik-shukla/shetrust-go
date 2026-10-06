package middleware

import (
	"net/http"
	"sync"
	"time"

	"shetrust/backend/internal/response"
)

// RateLimiter allows at most `limit` requests per IP per `window`.
//
// This is a "fixed window" counter: the simplest approach that works. Each
// IP gets a count and a reset time; once the clock passes the reset time
// the count starts again from zero.
//
// It lives in memory, so restarting the server clears it and running two
// copies gives each its own counts. For a project this size that is fine.
type RateLimiter struct {
	mu      sync.Mutex
	hits    map[string]*hitWindow
	limit   int
	window  time.Duration
	message string
}

type hitWindow struct {
	count   int
	resetAt time.Time
}

// NewRateLimiter builds a limiter and starts its cleanup goroutine.
func NewRateLimiter(limit int, window time.Duration, message string) *RateLimiter {
	limiter := &RateLimiter{
		hits:    make(map[string]*hitWindow),
		limit:   limit,
		window:  window,
		message: message,
	}

	// Without this the map would grow forever as new IP addresses appear.
	go limiter.cleanupLoop()

	return limiter
}

// cleanupLoop deletes expired entries once per window, forever.
func (rl *RateLimiter) cleanupLoop() {
	for {
		time.Sleep(rl.window)

		rl.mu.Lock()
		now := time.Now()
		for ip, window := range rl.hits {
			if now.After(window.resetAt) {
				delete(rl.hits, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// Allow records a hit and reports whether the caller is still under the limit.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	window, seen := rl.hits[ip]

	// First request from this IP, or their previous window has expired.
	if !seen || now.After(window.resetAt) {
		rl.hits[ip] = &hitWindow{count: 1, resetAt: now.Add(rl.window)}
		return true
	}

	window.count++
	return window.count <= rl.limit
}

// Wrap turns the limiter into middleware around a single handler func.
func (rl *RateLimiter) Wrap(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !rl.Allow(ClientIP(r)) {
			response.Error(w, http.StatusTooManyRequests, rl.message)
			return
		}
		next(w, r)
	}
}

// WrapAll is the same thing for a whole http.Handler, used for the global
// limit that sits in front of every route.
func (rl *RateLimiter) WrapAll(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.Allow(ClientIP(r)) {
			response.Error(w, http.StatusTooManyRequests, rl.message)
			return
		}
		next.ServeHTTP(w, r)
	})
}
