package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"shetrust/backend/internal/mathx"
)

// User is an optional account.
//
// Rating works fine without one — an account just lets your history follow
// you between devices.
type User struct {
	ID    bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name  string        `bson:"name"          json:"name"`
	Email string        `bson:"email"         json:"email"`

	// The bcrypt hash. json:"-" keeps it out of every API response.
	Password string `bson:"password" json:"-"`

	Avatar        *string `bson:"avatar"        json:"avatar"`
	AnonTokenHash *string `bson:"anonTokenHash" json:"-"`
	IsVerified    bool    `bson:"isVerified"    json:"isVerified"`
	Role          string  `bson:"role"          json:"role"`

	LastLogin *time.Time `bson:"lastLogin" json:"lastLogin"`

	// Locations this user has rated, so we can show them a history.
	RatedLocationIDs []bson.ObjectID `bson:"ratedLocationIds" json:"ratedLocationIds"`

	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

// UserTrust is how we stop one person skewing a location's score.
//
// Everyone starts neutral at 0.5. Agree with the crowd and your weight goes
// up; submit wild outliers and it goes down. The STI engine multiplies each
// rating by its author's score before averaging.
type UserTrust struct {
	ID        bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	TokenHash string        `bson:"tokenHash"     json:"tokenHash"`

	TRS float64 `bson:"trs" json:"trs"` // Trust Reliability Score, 0.0–1.0

	TotalRatings     int `bson:"totalRatings"     json:"totalRatings"`
	ConsensusMatches int `bson:"consensusMatches" json:"consensusMatches"`
	FlaggedRatings   int `bson:"flaggedRatings"   json:"flaggedRatings"`

	IsFlagged  bool    `bson:"isFlagged"  json:"isFlagged"`
	FlagReason *string `bson:"flagReason" json:"flagReason"`

	LastActivity time.Time `bson:"lastActivity" json:"lastActivity"`
	CreatedAt    time.Time `bson:"createdAt"    json:"createdAt"`
}

// RecomputeTRS turns "how often did this person agree with everyone else"
// into a 0–1 weight.
func (t *UserTrust) RecomputeTRS() {
	// Fewer than 3 ratings is not enough evidence to judge anyone.
	if t.TotalRatings < 3 {
		t.TRS = 0.5
		return
	}

	ratio := float64(t.ConsensusMatches) / float64(t.TotalRatings)

	// Clamp into 0.1–0.98, so nobody is ever worth exactly zero or a
	// perfect 1. Even a reliable rater can be wrong.
	t.TRS = mathx.Clamp(ratio, 0.1, 0.98)

	// Someone consistently far from consensus gets flagged for review.
	t.IsFlagged = t.TRS < 0.3 && t.TotalRatings >= 5
}
