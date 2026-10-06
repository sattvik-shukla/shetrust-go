package auth

import (
	"testing"
	"time"
)

func TestJWTRoundTrip(t *testing.T) {
	const secret = "test-secret-key"

	t.Run("a valid token decodes back to its claims", func(t *testing.T) {
		token, err := SignJWT(Claims{UserID: "abc123"}, secret, time.Hour)
		if err != nil {
			t.Fatalf("SignJWT failed: %v", err)
		}

		claims, err := VerifyJWT(token, secret)
		if err != nil {
			t.Fatalf("VerifyJWT failed: %v", err)
		}
		if claims.UserID != "abc123" {
			t.Errorf("UserID = %q, want %q", claims.UserID, "abc123")
		}
	})

	t.Run("an anonymous token round-trips too", func(t *testing.T) {
		token, _ := SignJWT(Claims{AnonID: "anon-99"}, secret, time.Hour)

		claims, err := VerifyJWT(token, secret)
		if err != nil {
			t.Fatalf("VerifyJWT failed: %v", err)
		}
		if claims.AnonID != "anon-99" {
			t.Errorf("AnonID = %q, want %q", claims.AnonID, "anon-99")
		}
		if claims.UserID != "" {
			t.Errorf("UserID = %q, want empty for an anonymous token", claims.UserID)
		}
	})

	t.Run("the wrong secret is rejected", func(t *testing.T) {
		token, _ := SignJWT(Claims{UserID: "abc123"}, secret, time.Hour)

		if _, err := VerifyJWT(token, "a-different-secret"); err != ErrBadSignature {
			t.Errorf("error = %v, want %v", err, ErrBadSignature)
		}
	})

	t.Run("a tampered signature is rejected", func(t *testing.T) {
		token, _ := SignJWT(Claims{UserID: "abc123"}, secret, time.Hour)

		// Flip the last character of the signature.
		tampered := token[:len(token)-1] + "X"
		if _, err := VerifyJWT(tampered, secret); err != ErrBadSignature {
			t.Errorf("error = %v, want %v", err, ErrBadSignature)
		}
	})

	t.Run("an expired token is rejected", func(t *testing.T) {
		// A negative lifetime means it expired before it was created.
		token, _ := SignJWT(Claims{UserID: "abc123"}, secret, -time.Hour)

		if _, err := VerifyJWT(token, secret); err != ErrTokenExpired {
			t.Errorf("error = %v, want %v", err, ErrTokenExpired)
		}
	})

	t.Run("nonsense is rejected rather than crashing", func(t *testing.T) {
		for _, bad := range []string{"", "not-a-token", "a.b", "a.b.c.d", "...."} {
			if _, err := VerifyJWT(bad, secret); err == nil {
				t.Errorf("VerifyJWT(%q) should have failed", bad)
			}
		}
	})
}

func TestHashToken(t *testing.T) {
	// The same token must always hash the same way, or everyone's rating
	// history would detach from them.
	first := HashToken("some-token")
	second := HashToken("some-token")

	if first != second {
		t.Error("hashing the same token twice gave different answers")
	}
	if first == HashToken("some-other-token") {
		t.Error("two different tokens hashed to the same value")
	}
	if len(first) != 64 {
		t.Errorf("hash length = %d, want 64 hex characters for SHA-256", len(first))
	}
}

func TestRandomID(t *testing.T) {
	// Anonymous ids must not collide, or two visitors would share a
	// rating history.
	seen := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := RandomID()
		if seen[id] {
			t.Fatalf("RandomID produced a duplicate: %s", id)
		}
		seen[id] = true
	}
}
