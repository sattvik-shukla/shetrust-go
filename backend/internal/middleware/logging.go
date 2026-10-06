package middleware

import (
	"log"
	"net/http"
	"time"
)

// statusRecorder remembers the status code a handler wrote, because
// http.ResponseWriter does not expose it afterwards.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

// Flush forwards to the underlying writer so Server-Sent Events still work
// through this wrapper. Without it, events would sit in a buffer forever
// and the live-update stream would appear dead.
func (sr *statusRecorder) Flush() {
	if flusher, ok := sr.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// Logging prints one line per request: method, path, status, duration.
func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(recorder, r)

		log.Printf("%s %s -> %d (%s)",
			r.Method, r.URL.Path, recorder.status,
			time.Since(started).Round(time.Millisecond))
	})
}
