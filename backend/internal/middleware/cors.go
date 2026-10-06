package middleware

import "net/http"

// CORS tells the browser that our frontend, served from a different port,
// is allowed to call this API.
//
// Browsers block cross-origin requests by default. For anything other than
// a simple GET they first send an OPTIONS "preflight" request asking for
// permission — that is the early return at the bottom.
func CORS(allowedOrigins []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Only ever echo back an origin we actually trust. Reflecting
		// whatever arrived would defeat the entire point of the check.
		for _, allowed := range allowedOrigins {
			if origin == allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}

		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Without this, the frontend's JavaScript cannot read the new
		// anonymous token the auth middleware hands out.
		w.Header().Set("Access-Control-Expose-Headers", "X-Auth-Token")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
