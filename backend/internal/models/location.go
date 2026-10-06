// Package models holds the shapes of our data.
//
// In Mongoose these were "schemas" validated at runtime. Here they are plain
// structs, and the compiler checks them for us.
//
// Each field carries two tags:
//
//	bson:"..."  the field name inside MongoDB  (must match existing data!)
//	json:"..."  the field name sent to the browser (must match the frontend!)
//
// A pointer type like *float64 is how we say "this can be null". A plain
// float64 can only ever be 0, which is a real score, not "not rated yet".
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"shetrust/backend/internal/mathx"
)

// TimeSlots are the four daily windows every score is bucketed into.
// A market that is fine at noon is a different place at midnight.
var TimeSlots = []string{"morning", "afternoon", "evening", "night"}

// IsValidTimeSlot reports whether a string is one of the four slots.
func IsValidTimeSlot(slot string) bool {
	for _, s := range TimeSlots {
		if s == slot {
			return true
		}
	}
	return false
}

// Categorize turns a numeric score into the colour band the map uses.
func Categorize(sti float64) string {
	switch {
	case sti >= 8:
		return "safe" // green
	case sti >= 5:
		return "moderate" // amber
	default:
		return "risky" // red
	}
}

// LocationTypes are the kinds of place that can be rated.
var LocationTypes = map[string]bool{
	"metro_station": true, "bus_stop": true, "market": true, "park": true,
	"road": true, "residential": true, "commercial": true, "other": true,
}

// GeoPoint is MongoDB's GeoJSON format. Note the order is
// [longitude, latitude] — the opposite of how people usually say "lat, lng".
type GeoPoint struct {
	Type        string    `bson:"type"        json:"type"`
	Coordinates []float64 `bson:"coordinates" json:"coordinates"`
}

// TimeSlotSTI is one location's safety score for one time slot.
type TimeSlotSTI struct {
	Slot        string     `bson:"slot"        json:"slot"`
	STI         *float64   `bson:"sti"         json:"sti"`
	Category    string     `bson:"category"    json:"category"`
	RatingCount int        `bson:"ratingCount" json:"ratingCount"`
	AvgLighting *float64   `bson:"avgLighting" json:"avgLighting"`
	AvgCrowd    *float64   `bson:"avgCrowd"    json:"avgCrowd"`
	AvgPolice   *float64   `bson:"avgPolice"   json:"avgPolice"`
	AvgIncident *float64   `bson:"avgIncident" json:"avgIncident"`
	LastUpdated *time.Time `bson:"lastUpdated" json:"lastUpdated"`
}

// Location is a place people rate: a metro station, a market, a road.
type Location struct {
	ID           bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	Name         string        `bson:"name"          json:"name"`
	Area         string        `bson:"area"          json:"area"`
	City         string        `bson:"city"          json:"city"`
	Type         string        `bson:"type"          json:"type"`
	Location     GeoPoint      `bson:"location"      json:"location"`
	TimeSlots    []TimeSlotSTI `bson:"timeSlots"     json:"timeSlots"`
	TotalRatings int           `bson:"totalRatings"  json:"totalRatings"`
	OverallSTI   *float64      `bson:"overallSTI"    json:"overallSTI"`
	IsVerified   bool          `bson:"isVerified"    json:"isVerified"`
	Tags         []string      `bson:"tags"          json:"tags"`
	CreatedAt    time.Time     `bson:"createdAt"     json:"createdAt"`
	UpdatedAt    time.Time     `bson:"updatedAt"     json:"updatedAt"`
}

// NewTimeSlots builds the four empty slots a brand new location starts with.
func NewTimeSlots() []TimeSlotSTI {
	slots := make([]TimeSlotSTI, 0, len(TimeSlots))
	for _, name := range TimeSlots {
		slots = append(slots, TimeSlotSTI{Slot: name, Category: "unrated"})
	}
	return slots
}

// SlotIndex finds the position of a named slot, or -1 if it is missing.
func (l *Location) SlotIndex(slot string) int {
	for i, s := range l.TimeSlots {
		if s.Slot == slot {
			return i
		}
	}
	return -1
}

// RecomputeOverall averages the slots that actually have a score.
// A location rated only at night should not look unrated overall.
func (l *Location) RecomputeOverall() {
	sum, count := 0.0, 0
	for _, slot := range l.TimeSlots {
		if slot.STI != nil {
			sum += *slot.STI
			count++
		}
	}

	if count == 0 {
		l.OverallSTI = nil
		return
	}
	l.OverallSTI = mathx.Ptr(mathx.Round1(sum / float64(count)))
}

// STIHistory is a snapshot written every time a score is recalculated, so
// the frontend can draw a trend line.
type STIHistory struct {
	ID          bson.ObjectID `bson:"_id,omitempty" json:"_id"`
	LocationID  bson.ObjectID `bson:"locationId"    json:"locationId"`
	TimeSlot    string        `bson:"timeSlot"      json:"timeSlot"`
	STI         *float64      `bson:"sti"           json:"sti"`
	Category    string        `bson:"category"      json:"category"`
	RatingCount int           `bson:"ratingCount"   json:"ratingCount"`
	RecordedAt  time.Time     `bson:"recordedAt"    json:"recordedAt"`
}
