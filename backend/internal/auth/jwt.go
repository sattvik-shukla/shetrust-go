// Package auth works out who is making a request, and issues the tokens
// that identify them.
package auth

// A hand-written JSON Web Token implementation.
//
// Node used the "jsonwebtoken" package. Writing it ourselves is about 80
// lines and makes the whole idea obvious — a JWT is just three chunks of
// base64 glued together with dots:
//
//	eyJhbGciOiJIUzI1NiJ9 . eyJ1c2VySWQiOiIxMjMifQ . 4Jx8kQ...
//	\_____ header _____/   \______ payload ______/   \_ signature _/
//
// The header and payload are only base64 — ANYONE can read them. They are
// not secret. What makes a token trustworthy is the signature: an HMAC of
// "header.payload" using our secret key. Change one character of the
// payload and the signature stops matching, so forgery is caught.
//
// Because this is the standard HS256 algorithm, tokens issued by the old
// Node server still verify here, as long as JWT_SECRET is unchanged.

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Token lifetimes.
const (
	// AnonTokenLifetime is long, because losing an anonymous token means
	// losing your whole rating history.
	AnonTokenLifetime = 90 * 24 * time.Hour

	// UserTokenLifetime is how long a login lasts.
	UserTokenLifetime = 30 * 24 * time.Hour
)

// Claims are the facts a token carries. Exactly one of UserID / AnonID is
// set: UserID for people with an account, AnonID for anonymous contributors.
type Claims struct {
	UserID string `json:"userId,omitempty"`
	AnonID string `json:"anonId,omitempty"`

	IssuedAt  int64 `json:"iat,omitempty"` // unix seconds
	ExpiresAt int64 `json:"exp,omitempty"` // unix seconds
}

// jwtHeader is always the same for us: HMAC-SHA256, type JWT.
var jwtHeader = []byte(`{"alg":"HS256","typ":"JWT"}`)

// Errors returned by VerifyJWT.
var (
	ErrMalformedToken = errors.New("token is not in header.payload.signature form")
	ErrBadSignature   = errors.New("token signature does not match")
	ErrTokenExpired   = errors.New("token has expired")
)

// base64urlEncode is base64 using - and _ instead of + and /, with the
// trailing "=" padding removed. That is what the JWT spec requires.
func base64urlEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

// sign produces the signature for "header.payload".
func sign(signingInput, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	return base64urlEncode(mac.Sum(nil))
}

// SignJWT builds a complete token that expires after the given duration.
func SignJWT(claims Claims, secret string, validFor time.Duration) (string, error) {
	now := time.Now()
	claims.IssuedAt = now.Unix()
	claims.ExpiresAt = now.Add(validFor).Unix()

	payloadJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	signingInput := base64urlEncode(jwtHeader) + "." + base64urlEncode(payloadJSON)
	return signingInput + "." + sign(signingInput, secret), nil
}

// VerifyJWT checks the signature and the expiry, then returns the claims
// inside. Never trust a token's contents without calling this first.
func VerifyJWT(token, secret string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, ErrMalformedToken
	}

	signingInput := parts[0] + "." + parts[1]
	expected := sign(signingInput, secret)

	// hmac.Equal compares in constant time. A normal == would leak, through
	// how long it takes to fail, how much of the signature was correct —
	// enough for an attacker to guess it one byte at a time.
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil, ErrBadSignature
	}

	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, ErrMalformedToken
	}

	var claims Claims
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return nil, ErrMalformedToken
	}

	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return nil, ErrTokenExpired
	}

	return &claims, nil
}
