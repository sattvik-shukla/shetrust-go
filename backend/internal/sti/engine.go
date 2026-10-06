package sti

// The Safety Trust Index engine.
//
// This is the part that turns a pile of individual ratings into the single
// 0–10 number shown on the map. Two ideas drive it:
//
//  1. Not every rating counts equally. Each contributor carries a Trust
//     Reliability Score (TRS) between 0.1 and 0.98, earned by how often
//     they agree with everyone else. A weighted average means one person
//     spamming 1s cannot drag a location down on their own.
//
//  2. A score needs a quorum. Below three ratings we publish nothing and
//     show "unrated" instead, because two opinions are not a consensus.

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"shetrust/backend/internal/database"
	"shetrust/backend/internal/mathx"
	"shetrust/backend/internal/models"
)

// MinVotesToPublish is how many ratings a location+slot needs before we are
// willing to show a score for it.
const MinVotesToPublish = 3

// Engine computes and stores safety scores. Create one at startup with
// NewEngine and share it — it caches the regression weights internally.
type Engine struct {
	db    *database.DB
	cache weightsCache
}

// NewEngine builds an Engine backed by the given database.
func NewEngine(db *database.DB) *Engine {
	return &Engine{db: db}
}

// Result is everything Compute works out for one location+slot.
type Result struct {
	STI         *float64
	Category    string
	RatingCount int

	AvgLighting *float64
	AvgCrowd    *float64
	AvgPolice   *float64
	AvgIncident *float64
	AvgNetwork  *float64

	WeightsUsed    Weights
	NeedsMoreVotes bool
}

// Compute calculates the community score for one location in one slot.
func (e *Engine) Compute(locationID bson.ObjectID, timeSlot string) (Result, error) {
	ctx, cancel := database.Ctx()
	defer cancel()

	filter := bson.M{
		"locationId": locationID,
		"timeSlot":   timeSlot,
		"isIncluded": true, // ratings from blocked contributors are excluded
	}

	cursor, err := e.db.Ratings.Find(ctx, filter)
	if err != nil {
		return Result{}, err
	}
	defer cursor.Close(ctx)

	var ratings []models.Rating
	if err := cursor.All(ctx, &ratings); err != nil {
		return Result{}, err
	}

	// Not enough opinions yet.
	if len(ratings) < MinVotesToPublish {
		return Result{
			Category:       "unrated",
			RatingCount:    len(ratings),
			NeedsMoreVotes: true,
		}, nil
	}

	trustByToken, err := e.loadTrustScores(ctx, ratings)
	if err != nil {
		return Result{}, err
	}

	weights := e.Weights()

	// Weighted sums. Every rating contributes in proportion to its author's
	// trust score, so trustTotal is the divisor — not len(ratings).
	var trustTotal float64
	var lightingSum, crowdSum, policeSum, incidentSum float64

	// Network is optional, so it needs its own running total. Dividing a
	// partial sum by the full trustTotal would understate it badly.
	var networkSum, networkTrustTotal float64

	for _, rating := range ratings {
		trust, known := trustByToken[rating.UserToken]
		if !known {
			trust = 0.5 // nobody has a track record on their first rating
		}

		trustTotal += trust
		lightingSum += trust * float64(rating.Lighting)
		crowdSum += trust * float64(rating.CrowdBehavior)
		policeSum += trust * float64(rating.PoliceVisibility)
		incidentSum += trust * float64(rating.IncidentWeight)

		if rating.NetworkAvailability != nil {
			networkSum += trust * (*rating.NetworkAvailability)
			networkTrustTotal += trust
		}
	}

	// Guard against dividing by zero if every contributor had 0 trust.
	if trustTotal == 0 {
		trustTotal = 1
	}

	avgLighting := lightingSum / trustTotal
	avgCrowd := crowdSum / trustTotal
	avgPolice := policeSum / trustTotal
	avgIncident := incidentSum / trustTotal

	// Phone signal nudges the score by at most ±0.25: no signal means you
	// cannot call for help, great signal means you can.
	var avgNetwork *float64
	networkAdjustment := 0.0
	if networkTrustTotal > 0 {
		value := networkSum / networkTrustTotal
		avgNetwork = mathx.Ptr(mathx.Round1(value))
		networkAdjustment = ((value - 5) / 10) * 0.5
	}

	// The formula itself. Note (10 - avgIncident): more incidents must mean
	// a LOWER score, so we flip it before weighting.
	raw := weights.Lighting*avgLighting +
		weights.Crowd*avgCrowd +
		weights.Police*avgPolice +
		weights.Incident*(10-avgIncident) +
		networkAdjustment

	score := mathx.Round1(mathx.Clamp(raw, 0, 10))

	return Result{
		STI:         &score,
		Category:    models.Categorize(score),
		RatingCount: len(ratings),
		AvgLighting: mathx.Ptr(mathx.Round1(avgLighting)),
		AvgCrowd:    mathx.Ptr(mathx.Round1(avgCrowd)),
		AvgPolice:   mathx.Ptr(mathx.Round1(avgPolice)),
		AvgIncident: mathx.Ptr(mathx.Round1(avgIncident)),
		AvgNetwork:  avgNetwork,
		WeightsUsed: weights,
	}, nil
}

// loadTrustScores fetches the TRS for everyone who rated this location+slot
// in a single query, rather than one query per rating.
func (e *Engine) loadTrustScores(ctx context.Context, ratings []models.Rating) (map[string]float64, error) {
	// Collect the distinct tokens. A map is the easiest way to deduplicate.
	seen := make(map[string]bool)
	tokens := make([]string, 0, len(ratings))

	for _, rating := range ratings {
		if !seen[rating.UserToken] {
			seen[rating.UserToken] = true
			tokens = append(tokens, rating.UserToken)
		}
	}

	cursor, err := e.db.UserTrust.Find(ctx, bson.M{"tokenHash": bson.M{"$in": tokens}})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var records []models.UserTrust
	if err := cursor.All(ctx, &records); err != nil {
		return nil, err
	}

	trustByToken := make(map[string]float64, len(records))
	for _, record := range records {
		trustByToken[record.TokenHash] = record.TRS
	}
	return trustByToken, nil
}

// UpdateLocation recomputes a score, writes it back to the location, and
// records a snapshot so the trend chart has a data point.
func (e *Engine) UpdateLocation(locationID bson.ObjectID, timeSlot string) (Result, error) {
	result, err := e.Compute(locationID, timeSlot)
	if err != nil {
		return result, err
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	var location models.Location
	if err := e.db.Locations.FindOne(ctx, bson.M{"_id": locationID}).Decode(&location); err != nil {
		return result, err
	}

	// Older documents might predate one of the slots.
	if len(location.TimeSlots) == 0 {
		location.TimeSlots = models.NewTimeSlots()
	}

	slotIndex := location.SlotIndex(timeSlot)
	if slotIndex == -1 {
		location.TimeSlots = append(location.TimeSlots,
			models.TimeSlotSTI{Slot: timeSlot, Category: "unrated"})
		slotIndex = len(location.TimeSlots) - 1
	}

	// Only overwrite the published score once there are enough votes.
	// Below the quorum we still record the count, so the UI can say
	// "2 of 3 ratings needed".
	if !result.NeedsMoreVotes {
		now := time.Now()
		location.TimeSlots[slotIndex].STI = result.STI
		location.TimeSlots[slotIndex].Category = result.Category
		location.TimeSlots[slotIndex].LastUpdated = &now
	}

	location.TimeSlots[slotIndex].RatingCount = result.RatingCount
	location.TimeSlots[slotIndex].AvgLighting = result.AvgLighting
	location.TimeSlots[slotIndex].AvgCrowd = result.AvgCrowd
	location.TimeSlots[slotIndex].AvgPolice = result.AvgPolice
	location.TimeSlots[slotIndex].AvgIncident = result.AvgIncident

	totalRatings := 0
	for _, slot := range location.TimeSlots {
		totalRatings += slot.RatingCount
	}
	location.TotalRatings = totalRatings
	location.RecomputeOverall()

	update := bson.M{"$set": bson.M{
		"timeSlots":    location.TimeSlots,
		"totalRatings": location.TotalRatings,
		"overallSTI":   location.OverallSTI,
		"updatedAt":    time.Now(),
	}}

	if _, err := e.db.Locations.UpdateOne(ctx, bson.M{"_id": locationID}, update); err != nil {
		return result, err
	}

	// Snapshot for the trend chart. Failing here is not worth failing the
	// whole request over, so we only log it.
	snapshot := models.STIHistory{
		LocationID:  locationID,
		TimeSlot:    timeSlot,
		STI:         result.STI,
		Category:    result.Category,
		RatingCount: result.RatingCount,
		RecordedAt:  time.Now(),
	}
	if _, err := e.db.STIHistory.InsertOne(ctx, snapshot); err != nil {
		log.Printf("could not save STI history snapshot: %v", err)
	}

	return result, nil
}

// UpdateUserTRS adjusts a contributor's trust score after they rate.
//
// The idea: compare what they said against what the community already
// says. Close to consensus (within 2 points) is a match. Wildly off (more
// than 4) counts against them. In between is neutral — people genuinely
// disagree, and that is not evidence of bad faith.
func (e *Engine) UpdateUserTRS(userToken string, locationID bson.ObjectID, timeSlot string, userRawSTI float64) error {
	ctx, cancel := database.Ctx()
	defer cancel()

	var location models.Location
	if err := e.db.Locations.FindOne(ctx, bson.M{"_id": locationID}).Decode(&location); err != nil {
		return err
	}

	// What does the crowd currently think about this location+slot?
	var consensusSTI *float64
	if index := location.SlotIndex(timeSlot); index != -1 {
		consensusSTI = location.TimeSlots[index].STI
	}

	// Load this person's trust record, or start a fresh neutral one.
	var trust models.UserTrust
	err := e.db.UserTrust.FindOne(ctx, bson.M{"tokenHash": userToken}).Decode(&trust)
	if err == mongo.ErrNoDocuments {
		trust = models.UserTrust{
			TokenHash: userToken,
			TRS:       0.5,
			CreatedAt: time.Now(),
		}
	} else if err != nil {
		return err
	}

	trust.TotalRatings++
	trust.LastActivity = time.Now()

	if consensusSTI != nil {
		deviation := *consensusSTI - userRawSTI
		if deviation < 0 {
			deviation = -deviation
		}

		switch {
		case deviation <= 2:
			trust.ConsensusMatches++
		case deviation > 4:
			trust.FlaggedRatings++
		}
	} else {
		// No consensus to compare against yet (this is one of the first
		// ratings here), so give them the benefit of the doubt.
		trust.ConsensusMatches++
	}

	trust.RecomputeTRS()

	// Upsert: update the record if it exists, create it if it does not.
	update := bson.M{"$set": bson.M{
		"tokenHash":        trust.TokenHash,
		"trs":              trust.TRS,
		"totalRatings":     trust.TotalRatings,
		"consensusMatches": trust.ConsensusMatches,
		"flaggedRatings":   trust.FlaggedRatings,
		"isFlagged":        trust.IsFlagged,
		"lastActivity":     trust.LastActivity,
		"updatedAt":        time.Now(),
	}}

	_, err = e.db.UserTrust.UpdateOne(ctx,
		bson.M{"tokenHash": userToken},
		update,
		options.UpdateOne().SetUpsert(true),
	)
	return err
}
