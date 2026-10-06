package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
)

// HashToken turns a token into a SHA-256 hex string.
//
// We store this hash on every rating instead of the token itself. If the
// database ever leaked, the hashes would not let anyone impersonate a
// contributor. This matches what the Node backend did, so ratings made
// before the rewrite still line up with their authors.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// RandomID returns a random hex string, used as the anonId inside anonymous
// tokens.
//
// crypto/rand is the cryptographically secure generator. Never use
// math/rand for anything a user could try to guess.
func RandomID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing means the OS is broken. There is no sane
		// fallback, and guessable tokens would be worse than crashing.
		panic("crypto/rand unavailable: " + err.Error())
	}
	return hex.EncodeToString(buf)
}

// BearerToken pulls the token out of an "Authorization: Bearer xyz" header.
// It returns "" when the header is missing or malformed.
func BearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}
