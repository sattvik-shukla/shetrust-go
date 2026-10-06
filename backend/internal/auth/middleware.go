package auth

// Who is making this request?
//
// SheTrust has a slightly unusual rule: you do NOT need an account to rate
// a location. So every visitor gets an "anonymous token" the first time
// they touch the API, and that token is what ties their ratings together.
//
// There are therefore three kinds of caller:
//
//  1. Brand new visitor -> we mint an anon token and hand it back in the
//     X-Auth-Token response header. The frontend saves it to localStorage
//     and sends it from then on.
//  2. Returning anon    -> the token carries an anonId. We know it is the
//     same person as last time, but not who they are.
//  3. Logged-in user    -> the token carries a userId, and we load their role.
//
// In every case the handler ends up with a token it can store on a rating,
// so the rest of the code never has to care which kind it got.

import (
	"context"
	"net/http"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"

	"shetrust/backend/internal/database"
	"shetrust/backend/internal/response"
)

// ─── Request context ─────────────────────────────────────────────────────

// Go passes per-request values through context.Context. We use our own
// unexported key type so our keys can never collide with another package's.
type ctxKey string

const (
	ctxUserID     ctxKey = "userID"
	ctxUserToken  ctxKey = "userToken"
	ctxUserRole   ctxKey = "userRole"
	ctxIsNewToken ctxKey = "isNewToken"
)

// UserToken returns the hashed token identifying this caller.
func UserToken(r *http.Request) string {
	value, _ := r.Context().Value(ctxUserToken).(string)
	return value
}

// UserID returns the logged-in user's id, or "" for anonymous callers.
func UserID(r *http.Request) string {
	value, _ := r.Context().Value(ctxUserID).(string)
	return value
}

// Role returns "user", "moderator" or "admin".
func Role(r *http.Request) string {
	value, _ := r.Context().Value(ctxUserRole).(string)
	return value
}

// IsNewToken reports whether we just minted a token for this request.
func IsNewToken(r *http.Request) bool {
	value, _ := r.Context().Value(ctxIsNewToken).(bool)
	return value
}

// ─── Authenticator ───────────────────────────────────────────────────────

// Authenticator holds what the middleware needs: the signing secret, and
// the users collection for looking up roles.
type Authenticator struct {
	secret string
	users  *mongo.Collection
}

// New builds an Authenticator.
func New(secret string, db *database.DB) *Authenticator {
	return &Authenticator{secret: secret, users: db.Users}
}

// Secret exposes the signing key, for handlers that issue tokens on login.
func (a *Authenticator) Secret() string {
	return a.secret
}

// Middleware identifies the caller and puts the answer in the request
// context before calling the real handler.
func (a *Authenticator) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if token := BearerToken(r); token != "" {
			if claims, err := VerifyJWT(token, a.secret); err == nil {
				// Case 3: a logged-in user.
				if claims.UserID != "" {
					ctx := r.Context()
					ctx = context.WithValue(ctx, ctxUserID, claims.UserID)
					ctx = context.WithValue(ctx, ctxUserToken, HashToken(token))
					ctx = context.WithValue(ctx, ctxUserRole, a.lookupRole(claims.UserID))
					ctx = context.WithValue(ctx, ctxIsNewToken, false)
					next(w, r.WithContext(ctx))
					return
				}

				// Case 2: a returning anonymous visitor.
				if claims.AnonID != "" {
					ctx := r.Context()
					ctx = context.WithValue(ctx, ctxUserToken, HashToken(token))
					ctx = context.WithValue(ctx, ctxUserRole, "user")
					ctx = context.WithValue(ctx, ctxIsNewToken, false)
					next(w, r.WithContext(ctx))
					return
				}
			}
			// An invalid or expired token is not an error here — we fall
			// through and issue a fresh anonymous one.
		}

		// Case 1: brand new visitor.
		newToken, err := SignJWT(Claims{AnonID: RandomID()}, a.secret, AnonTokenLifetime)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "Could not issue a session token.")
			return
		}

		// The frontend watches for this header and saves the value.
		w.Header().Set("X-Auth-Token", newToken)

		ctx := r.Context()
		ctx = context.WithValue(ctx, ctxUserToken, HashToken(newToken))
		ctx = context.WithValue(ctx, ctxUserRole, "user")
		ctx = context.WithValue(ctx, ctxIsNewToken, true)
		next(w, r.WithContext(ctx))
	}
}

// RequireUser guards routes that genuinely need an account.
// Use it after Middleware.
func RequireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if UserID(r) == "" {
			response.Error(w, http.StatusUnauthorized, "Login required for this action.")
			return
		}
		next(w, r)
	}
}

// lookupRole fetches a user's role. Anything we cannot look up is treated
// as a plain user — failing closed.
func (a *Authenticator) lookupRole(userID string) string {
	objectID, err := bson.ObjectIDFromHex(userID)
	if err != nil {
		return "user"
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	var user struct {
		Role string `bson:"role"`
	}
	if err := a.users.FindOne(ctx, bson.M{"_id": objectID}).Decode(&user); err != nil {
		return "user"
	}
	if user.Role == "" {
		return "user"
	}
	return user.Role
}
