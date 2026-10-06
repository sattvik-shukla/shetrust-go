// Package middleware holds the wrappers that run around every request.
//
// A middleware in Go is just a function that takes a handler and returns a
// new one. The new one does something, then calls the old one:
//
//	func Logging(next http.Handler) http.Handler {
//	    return http.HandlerFunc(func(w, r) {
//	        log.Println(r.URL.Path)   // before
//	        next.ServeHTTP(w, r)      // the real work
//	    })
//	}
//
// Express had app.use() assemble this chain invisibly. Here you can see it
// being built by hand in handlers.Routes(), so nothing is hidden.
package middleware

import (
	"net"
	"net/http"
	"strings"
)

// ClientIP works out who is calling.
//
// Worth knowing: X-Forwarded-For is set by proxies like Railway or Render,
// and a caller can also just make it up. We trust it anyway, because
// without it every request behind a proxy looks like it came from the
// proxy — which would put the whole internet in one shared rate-limit
// bucket.
func ClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		// The header is "client, proxy1, proxy2" — the first is the client.
		first, _, _ := strings.Cut(forwarded, ",")
		if trimmed := strings.TrimSpace(first); trimmed != "" {
			return trimmed
		}
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
