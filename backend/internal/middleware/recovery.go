package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"shetrust/backend/internal/response"
)

// Recovery stops one broken handler from killing the whole server.
//
// In Go a panic unwinds its goroutine, and an unrecovered panic in an HTTP
// handler would take the entire process down with it. recover() catches it,
// we log the stack trace, and the client gets a clean 500 instead of a
// dropped connection.
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if problem := recover(); problem != nil {
				log.Printf("PANIC on %s %s: %v\n%s",
					r.Method, r.URL.Path, problem, debug.Stack())

				response.Error(w, http.StatusInternalServerError, "Internal server error")
			}
		}()

		next.ServeHTTP(w, r)
	})
}
