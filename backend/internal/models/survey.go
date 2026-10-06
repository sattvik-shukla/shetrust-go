package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

// Survey is the research questionnaire.
//
// It is separate from Rating because it also asks for an overall gut-feel
// score. That extra answer is what lets the regression in package sti work
// out how much each factor really drives the feeling of safety.
type Survey struct {
	ID         bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	LocationID bson.ObjectID `bson:"locationId"    json:"locationId"`
	UserToken  string        `bson:"userToken"     json:"-"`
	TimeSlot   string        `bson:"timeSlot"      json:"timeSlot"`

	Lighting          int `bson:"lighting"          json:"lighting"`
	CrowdDensity      int `bson:"crowdDensity"      json:"crowdDensity"`
	PublicTransport   int `bson:"publicTransport"   json:"publicTransport"`
	IncidentFrequency int `bson:"incidentFrequency" json:"incidentFrequency"`

	// The question the other four are used to predict.
	OverallRating int `bson:"overallRating" json:"overallRating"`

	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}
