// Package response writes JSON replies.
//
// Express gave us res.json({...}). Go's standard library does not, so we
// write it once here and every handler reuses it.
package response

import (
	"encoding/json"
	"log"
	"net/http"
)

// maxRequestBody caps incoming JSON at 1 MB, so a huge upload cannot
// exhaust the server's memory.
const maxRequestBody = 1 << 20

// M is shorthand for "a JSON object".
// Writing map[string]any everywhere gets noisy; M{"success": true} reads
// much better.
type M map[string]any

// JSON sends any Go value as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// The status line has already gone out, so logging is all we can do.
		log.Printf("failed to write JSON response: %v", err)
	}
}

// OK is the common success case: { "success": true, "data": ... }
func OK(w http.ResponseWriter, payload M) {
	payload["success"] = true
	JSON(w, http.StatusOK, payload)
}

// Error sends the { "success": false, "error": "..." } shape the frontend
// already knows how to read.
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, M{"success": false, "error": message})
}

// Decode reads a JSON request body into dst.
//
// It returns false (having already replied with 400) when the body is not
// valid JSON, so callers can simply write:
//
//	if !response.Decode(w, r, &body) {
//	    return
//	}
func Decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBody)

	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		Error(w, http.StatusBadRequest, "Invalid JSON body.")
		return false
	}
	return true
}
