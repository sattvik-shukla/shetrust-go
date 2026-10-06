package sti

// A cache in front of the regression.
//
// ComputeOptimalWeights reads every survey and does matrix maths. We do not
// want that running on every single rating submission, and the answer
// barely moves from hour to hour — so we work it out at most once every six
// hours and reuse the result in between.

import (
	"log"
	"sync"
	"time"
)

const (
	// weightsCacheTTL is how long a computed set of weights stays fresh.
	weightsCacheTTL = 6 * time.Hour

	// minAcceptableR2 is how good the regression fit must be before we
	// trust it over the hand-picked defaults. Below this, the surveys are
	// not telling a clear enough story yet.
	minAcceptableR2 = 0.3
)

// weightsCache holds the shared copy.
//
// The mutex is needed because HTTP handlers run concurrently, and two
// goroutines touching the same fields without one is a data race.
type weightsCache struct {
	mu        sync.Mutex
	weights   *Weights
	fetchedAt time.Time
}

// Weights returns the STI weights to use right now, recomputing them only
// when the cached copy has gone stale.
func (e *Engine) Weights() Weights {
	e.cache.mu.Lock()
	defer e.cache.mu.Unlock()

	if e.cache.weights != nil && time.Since(e.cache.fetchedAt) < weightsCacheTTL {
		return *e.cache.weights
	}

	result := ComputeOptimalWeights(e.db)

	chosen := DefaultWeights
	chosen.Source = "default"

	// Only switch to regression weights when the fit is actually decent.
	if !result.Fallback && result.R2 != nil && *result.R2 >= minAcceptableR2 {
		chosen = result.Weights
		log.Printf("STI weights from regression (R²=%.3f, n=%d): L=%.2f C=%.2f P=%.2f I=%.2f",
			*result.R2, result.SampleSize,
			chosen.Lighting, chosen.Crowd, chosen.Police, chosen.Incident)
	}

	e.cache.weights = &chosen
	e.cache.fetchedAt = time.Now()

	return chosen
}

// InvalidateWeights forces the next Weights() call to recompute.
// Called after a new survey arrives, so fresh data shows up promptly.
func (e *Engine) InvalidateWeights() {
	e.cache.mu.Lock()
	defer e.cache.mu.Unlock()

	e.cache.weights = nil
	e.cache.fetchedAt = time.Time{}
}
