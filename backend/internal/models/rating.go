package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"shetrust/backend/internal/mathx"
)

// RatingTags are the tags the UI offers alongside the sliders.
var RatingTags = map[string]bool{
	"well_lit": true, "poorly_lit": true, "crowded": true, "deserted": true,
	"police_present": true, "no_security": true, "harassment_witnessed": true,
	"felt_safe": true, "felt_unsafe": true, "good_infrastructure": true,
	"good_network": true, "poor_network": true, "no_network": true,
}

// NLPAnalysis was written by the old Gemini comment classifier. We still
// read it so older documents do not break, but nothing writes it now.
type NLPAnalysis struct {
	IncidentType *string    `bson:"incidentType" json:"incidentType"`
	Severity     *string    `bson:"severity"     json:"severity"`
	Sentiment    *string    `bson:"sentiment"    json:"sentiment"`
	Tags         []string   `bson:"tags"         json:"tags"`
	ProcessedAt  *time.Time `bson:"processedAt"  json:"processedAt"`
}

// Rating is one person's scoring of one location in one time slot.
type Rating struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	LocationID bson.ObjectID `bson:"locationId"    json:"locationId"`

	// UserToken is a SHA-256 hash, never the raw token, and it never reaches
	// the browser — json:"-" means "leave this out of the response".
	UserToken string `bson:"userToken" json:"-"`

	TimeSlot string `bson:"timeSlot" json:"timeSlot"`

	// The four factors people move sliders for. Each is 1–10, except
	// IncidentWeight which is 0–10 and where higher means MORE incidents.
	Lighting         int `bson:"lighting"         json:"lighting"`
	CrowdBehavior    int `bson:"crowdBehavior"    json:"crowdBehavior"`
	PoliceVisibility int `bson:"policeVisibility" json:"policeVisibility"`
	IncidentWeight   int `bson:"incidentWeight"   json:"incidentWeight"`

	// Optional: phone signal strength. No signal means you cannot call for
	// help, so it nudges the score down.
	NetworkAvailability *float64 `bson:"networkAvailability" json:"networkAvailability"`

	RawSTI  float64 `bson:"rawSTI"  json:"rawSTI"`
	Comment string  `bson:"comment" json:"comment"`

	NLPAnalysis *NLPAnalysis `bson:"nlpAnalysis,omitempty" json:"nlpAnalysis,omitempty"`

	Tags            []string  `bson:"tags"            json:"tags"`
	TRSAtSubmission float64   `bson:"trsAtSubmission" json:"trsAtSubmission"`
	IsIncluded      bool      `bson:"isIncluded"      json:"isIncluded"`
	CreatedAt       time.Time `bson:"createdAt"       json:"createdAt"`
}

// ComputeRawSTI scores a single submission using the fixed default weights.
//
// The published community score (see package sti) uses live, regression-
// derived weights instead. This one exists to give the person instant
// feedback on what they just submitted.
//
// Note the (10 - incident) flip: every other factor is "higher is safer",
// so incidents have to be inverted before they are weighted.
func ComputeRawSTI(lighting, crowd, police, incident int) float64 {
	score := 0.30*float64(lighting) +
		0.30*float64(crowd) +
		0.20*float64(police) +
		0.20*float64(10-incident)

	return mathx.Round1(score)
}

// FilterTags keeps only recognised tags, at most 7 of them.
//
// Unknown tags are dropped rather than rejected, so an older version of the
// app cannot be locked out by a tag list that has since changed.
func FilterTags(tags []string) []string {
	kept := []string{}
	for _, tag := range tags {
		if RatingTags[tag] {
			kept = append(kept, tag)
			if len(kept) == 7 {
				break
			}
		}
	}
	return kept
}
