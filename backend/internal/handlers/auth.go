package handlers

// Accounts: sign up, log in, who am I, log out.
//
// Remember that an account is optional in SheTrust. These endpoints exist
// so a rating history can follow you between devices, not to gate the app.

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"golang.org/x/crypto/bcrypt"

	"shetrust/backend/internal/auth"
	"shetrust/backend/internal/database"
	"shetrust/backend/internal/mathx"
	"shetrust/backend/internal/models"
	"shetrust/backend/internal/response"
)

// Good enough to catch typos. Real validation is a confirmation email.
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// bcryptCost controls how slow hashing is. Higher is more secure but
// slower; 12 takes roughly a quarter of a second, which is the point — it
// makes brute-forcing a stolen database painfully expensive.
const bcryptCost = 12

// Signup creates an account.
//
// POST /api/auth/signup
func (h *Handlers) Signup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name      string `json:"name"`
		Email     string `json:"email"`
		Password  string `json:"password"`
		AnonToken string `json:"anonToken"` // links ratings made before signing up
	}
	if !response.Decode(w, r, &body) {
		return
	}

	name := strings.TrimSpace(body.Name)
	email := strings.ToLower(strings.TrimSpace(body.Email))

	// Validate before touching the database.
	switch {
	case name == "" || email == "" || body.Password == "":
		response.Error(w, http.StatusBadRequest, "Name, email and password are required.")
		return
	case len(name) < 2 || len(name) > 50:
		response.Error(w, http.StatusBadRequest, "Name must be between 2 and 50 characters.")
		return
	case !emailPattern.MatchString(email):
		response.Error(w, http.StatusBadRequest, "That email address does not look valid.")
		return
	case len(body.Password) < 6:
		response.Error(w, http.StatusBadRequest, "Password must be at least 6 characters.")
		return
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	// Is this email already taken?
	existing := h.DB.Users.FindOne(ctx, bson.M{"email": email})
	if existing.Err() == nil {
		response.Error(w, http.StatusConflict, "An account with this email already exists.")
		return
	} else if existing.Err() != mongo.ErrNoDocuments {
		response.Error(w, http.StatusInternalServerError, "Server error during signup.")
		return
	}

	// Never store the password itself — only a bcrypt hash of it.
	hashed, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcryptCost)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Server error during signup.")
		return
	}

	now := time.Now()
	user := models.User{
		ID:               bson.NewObjectID(),
		Name:             name,
		Email:            email,
		Password:         string(hashed),
		Role:             "user",
		RatedLocationIDs: []bson.ObjectID{},
		CreatedAt:        now,
		UpdatedAt:        now,
	}

	// If they rated anonymously before signing up, remember the hash of
	// that token so those ratings can be credited to this account.
	if body.AnonToken != "" {
		user.AnonTokenHash = mathx.Ptr(auth.HashToken(body.AnonToken))
	}

	if _, err := h.DB.Users.InsertOne(ctx, user); err != nil {
		response.Error(w, http.StatusInternalServerError, "Server error during signup.")
		return
	}

	h.respondWithToken(w, user, http.StatusCreated)
}

// Login exchanges an email and password for a token.
//
// POST /api/auth/login
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !response.Decode(w, r, &body) {
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || body.Password == "" {
		response.Error(w, http.StatusBadRequest, "Email and password are required.")
		return
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	var user models.User
	if err := h.DB.Users.FindOne(ctx, bson.M{"email": email}).Decode(&user); err != nil {
		// Deliberately vague: saying "no such email" would let someone
		// probe which addresses have accounts.
		response.Error(w, http.StatusUnauthorized, "Invalid email or password.")
		return
	}

	// CompareHashAndPassword re-hashes the attempt with the same salt and
	// compares in constant time.
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(body.Password)) != nil {
		response.Error(w, http.StatusUnauthorized, "Invalid email or password.")
		return
	}

	now := time.Now()
	user.LastLogin = &now
	h.DB.Users.UpdateOne(ctx,
		bson.M{"_id": user.ID},
		bson.M{"$set": bson.M{"lastLogin": now}},
	)

	h.respondWithToken(w, user, http.StatusOK)
}

// Me returns the account belonging to the supplied token.
//
// GET /api/auth/me
func (h *Handlers) Me(w http.ResponseWriter, r *http.Request) {
	token := auth.BearerToken(r)
	if token == "" {
		response.Error(w, http.StatusUnauthorized, "Not authenticated.")
		return
	}

	claims, err := auth.VerifyJWT(token, h.Auth.Secret())
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "Invalid or expired token.")
		return
	}
	if claims.UserID == "" {
		response.Error(w, http.StatusUnauthorized, "Not a user token.")
		return
	}

	objectID, err := bson.ObjectIDFromHex(claims.UserID)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, "Invalid token.")
		return
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	var user models.User
	if err := h.DB.Users.FindOne(ctx, bson.M{"_id": objectID}).Decode(&user); err != nil {
		response.Error(w, http.StatusNotFound, "User not found.")
		return
	}

	response.JSON(w, http.StatusOK, M{"success": true, "user": user})
}

// Logout is entirely client-side: JWTs are stateless, so there is no
// server session to destroy — the browser just throws its token away.
// This endpoint exists only so the frontend has something tidy to call.
//
// POST /api/auth/logout
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, M{
		"success": true,
		"message": "Logged out successfully.",
	})
}

// respondWithToken issues a fresh login token and returns it with the user.
// The User struct's json:"-" tags keep the password hash out of the reply.
func (h *Handlers) respondWithToken(w http.ResponseWriter, user models.User, status int) {
	token, err := auth.SignJWT(
		auth.Claims{UserID: user.ID.Hex()},
		h.Auth.Secret(),
		auth.UserTokenLifetime,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Could not create a login token.")
		return
	}

	response.JSON(w, status, M{
		"success": true,
		"token":   token,
		"user":    user,
	})
}
