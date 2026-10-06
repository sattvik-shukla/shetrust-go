package handlers

// Ratings: submitting one, and reading them back.

import (
	"log"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"shetrust/backend/internal/auth"
	"shetrust/backend/internal/database"
	"shetrust/backend/internal/mathx"
	"shetrust/backend/internal/models"
	"shetrust/backend/internal/response"
)

// ratingCooldown is how long someone must wait before rating the same
// place and slot again. It stops one person submitting the same opinion
// over and over.
const ratingCooldown = 6 * time.Hour

// SubmitRating records one person's scoring of a location.
//
// POST /api/ratings
func (h *Handlers) SubmitRating(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LocationID string `json:"locationId"`
		TimeSlot   string `json:"timeSlot"`

		// Pointers so we can tell "field missing" from "field sent as 0".
		Lighting         *int `json:"lighting"`
		CrowdBehavior    *int `json:"crowdBehavior"`
		PoliceVisibility *int `json:"policeVisibility"`
		IncidentWeight   *int `json:"incidentWeight"`

		NetworkAvailability *float64 `json:"networkAvailability"`
		Comment             string   `json:"comment"`
		Tags                []string `json:"tags"`
	}
	if !response.Decode(w, r, &body) {
		return
	}

	locationID, err := bson.ObjectIDFromHex(body.LocationID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "locationId and timeSlot are required")
		return
	}
	if !models.IsValidTimeSlot(body.TimeSlot) {
		response.Error(w, http.StatusBadRequest, "Invalid timeSlot")
		return
	}

	// Check the four required factors in one pass.
	for _, factor := range []struct {
		name  string
		value *int
	}{
		{"lighting", body.Lighting},
		{"crowdBehavior", body.CrowdBehavior},
		{"policeVisibility", body.PoliceVisibility},
		{"incidentWeight", body.IncidentWeight},
	} {
		if factor.value == nil || *factor.value < 0 || *factor.value > 10 {
			response.Error(w, http.StatusBadRequest, factor.name+" must be 0–10")
			return
		}
	}

	if body.NetworkAvailability != nil {
		if *body.NetworkAvailability < 0 || *body.NetworkAvailability > 10 {
			response.Error(w, http.StatusBadRequest, "networkAvailability must be 0–10")
			return
		}
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	var location models.Location
	if err := h.DB.Locations.FindOne(ctx, bson.M{"_id": locationID}).Decode(&location); err != nil {
		response.Error(w, http.StatusNotFound, "Location not found")
		return
	}

	userToken := auth.UserToken(r)

	// Enforce the cooldown.
	recentFilter := bson.M{
		"locationId": locationID,
		"userToken":  userToken,
		"timeSlot":   body.TimeSlot,
		"createdAt":  bson.M{"$gte": time.Now().Add(-ratingCooldown)},
	}
	if err := h.DB.Ratings.FindOne(ctx, recentFilter).Err(); err == nil {
		response.Error(w, http.StatusTooManyRequests,
			"You already rated this location recently. Try again in 6 hours.")
		return
	} else if err != mongo.ErrNoDocuments {
		response.Error(w, http.StatusInternalServerError, "Failed to submit rating")
		return
	}

	comment := body.Comment
	if len(comment) > 500 {
		comment = comment[:500]
	}

	rating := models.Rating{
		ID:                  bson.NewObjectID(),
		LocationID:          locationID,
		UserToken:           userToken,
		TimeSlot:            body.TimeSlot,
		Lighting:            *body.Lighting,
		CrowdBehavior:       *body.CrowdBehavior,
		PoliceVisibility:    *body.PoliceVisibility,
		IncidentWeight:      *body.IncidentWeight,
		NetworkAvailability: body.NetworkAvailability,
		Comment:             comment,
		Tags:                models.FilterTags(body.Tags),
		TRSAtSubmission:     0.5,
		IsIncluded:          true,
		CreatedAt:           time.Now(),
	}
	rating.RawSTI = models.ComputeRawSTI(
		rating.Lighting, rating.CrowdBehavior, rating.PoliceVisibility, rating.IncidentWeight)

	if _, err := h.DB.Ratings.InsertOne(ctx, rating); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to submit rating")
		return
	}

	// Remember which locations a logged-in user has rated.
	if userID := auth.UserID(r); userID != "" {
		if objectID, err := bson.ObjectIDFromHex(userID); err == nil {
			h.DB.Users.UpdateOne(ctx,
				bson.M{"_id": objectID},
				bson.M{"$addToSet": bson.M{"ratedLocationIds": locationID}},
			)
		}
	}

	// Recomputing the location score touches every rating for that slot, so
	// do it in the background. `go` starts a goroutine: the HTTP response
	// goes out immediately and this carries on afterwards.
	//
	// It must NOT use the request's context — that is cancelled the moment
	// we reply, which would abort these queries halfway through.
	go h.recalculateAfterRating(locationID, body.TimeSlot, userToken, rating.RawSTI)

	response.JSON(w, http.StatusCreated, M{
		"success": true,
		"message": "Rating submitted successfully",
		"data": M{
			"ratingId":     rating.ID,
			"rawSTI":       rating.RawSTI,
			"locationName": location.Name,
			"timeSlot":     body.TimeSlot,
			"isNewToken":   auth.IsNewToken(r),
		},
	})
}

// recalculateAfterRating updates the location score and the rater's trust
// score, then tells every connected browser about the new number.
func (h *Handlers) recalculateAfterRating(locationID bson.ObjectID, timeSlot, userToken string, rawSTI float64) {
	result, err := h.STI.UpdateLocation(locationID, timeSlot)
	if err != nil {
		log.Printf("STI update failed for %s/%s: %v", locationID.Hex(), timeSlot, err)
		return
	}

	if err := h.STI.UpdateUserTRS(userToken, locationID, timeSlot, rawSTI); err != nil {
		log.Printf("TRS update failed: %v", err)
	}

	// Re-read the location so browsers get the fully updated document.
	ctx, cancel := database.Ctx()
	defer cancel()

	var location models.Location
	if err := h.DB.Locations.FindOne(ctx, bson.M{"_id": locationID}).Decode(&location); err != nil {
		return
	}

	// The frontend listens for exactly this event name and payload shape.
	h.Hub.Broadcast("heatmap-update", M{
		"locationId":  locationID.Hex(),
		"timeSlot":    timeSlot,
		"sti":         result.STI,
		"category":    result.Category,
		"ratingCount": result.RatingCount,
		"location":    location,
	})
}

// RatingsForLocation returns per-slot averages for one location.
//
// GET /api/ratings/location/{locationId}
func (h *Handlers) RatingsForLocation(w http.ResponseWriter, r *http.Request) {
	locationID, err := bson.ObjectIDFromHex(r.PathValue("locationId"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid location id")
		return
	}

	filter := bson.M{"locationId": locationID, "isIncluded": true}
	if slot := r.URL.Query().Get("slot"); slot != "" {
		filter["timeSlot"] = slot
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	findOptions := options.Find().
		SetSort(bson.M{"createdAt": -1}).
		SetLimit(100)

	cursor, err := h.DB.Ratings.Find(ctx, filter, findOptions)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch ratings")
		return
	}
	defer cursor.Close(ctx)

	var ratings []models.Rating
	if err := cursor.All(ctx, &ratings); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch ratings")
		return
	}

	// Group by time slot.
	bySlot := make(map[string][]models.Rating)
	for _, rating := range ratings {
		bySlot[rating.TimeSlot] = append(bySlot[rating.TimeSlot], rating)
	}

	summary := make([]M, 0, len(bySlot))
	for slot, slotRatings := range bySlot {
		count := float64(len(slotRatings))

		var stiSum, lightingSum, crowdSum, networkSum float64
		networkCount := 0
		tags := []string{}

		for _, rating := range slotRatings {
			stiSum += rating.RawSTI
			lightingSum += float64(rating.Lighting)
			crowdSum += float64(rating.CrowdBehavior)

			if rating.NetworkAvailability != nil {
				networkSum += *rating.NetworkAvailability
				networkCount++
			}
			tags = append(tags, rating.Tags...)
		}

		var avgNetwork *float64
		if networkCount > 0 {
			avgNetwork = mathx.Ptr(mathx.Round1(networkSum / float64(networkCount)))
		}

		if len(tags) > 10 {
			tags = tags[:10]
		}

		summary = append(summary, M{
			"slot":        slot,
			"count":       len(slotRatings),
			"avgSTI":      mathx.Round1(stiSum / count),
			"avgLighting": mathx.Round1(lightingSum / count),
			"avgCrowd":    mathx.Round1(crowdSum / count),
			"avgNetwork":  avgNetwork,
			"recentTags":  tags,
		})
	}

	response.JSON(w, http.StatusOK, M{
		"success": true,
		"data": M{
			"summary":     summary,
			"recentCount": len(ratings),
		},
	})
}

// RatingTrend returns the snapshots behind the trend chart, oldest first.
//
// GET /api/ratings/location/{locationId}/trend
func (h *Handlers) RatingTrend(w http.ResponseWriter, r *http.Request) {
	locationID, err := bson.ObjectIDFromHex(r.PathValue("locationId"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid location id")
		return
	}

	filter := bson.M{"locationId": locationID}
	if slot := r.URL.Query().Get("slot"); slot != "" {
		filter["timeSlot"] = slot
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	// Take the 120 most recent, then flip them so the chart reads left to
	// right in time order.
	findOptions := options.Find().
		SetSort(bson.M{"recordedAt": -1}).
		SetLimit(120)

	cursor, err := h.DB.STIHistory.Find(ctx, filter, findOptions)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch trend data")
		return
	}
	defer cursor.Close(ctx)

	snapshots := []models.STIHistory{}
	if err := cursor.All(ctx, &snapshots); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch trend data")
		return
	}

	// Reverse in place: swap the ends and walk inwards.
	for i, j := 0, len(snapshots)-1; i < j; i, j = i+1, j-1 {
		snapshots[i], snapshots[j] = snapshots[j], snapshots[i]
	}

	response.JSON(w, http.StatusOK, M{"success": true, "data": snapshots})
}

// MyRatings returns everything the current token has submitted. It works
// for anonymous visitors too, which is the whole point of the anon token.
//
// GET /api/ratings/my
func (h *Handlers) MyRatings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := database.Ctx()
	defer cancel()

	findOptions := options.Find().
		SetSort(bson.M{"createdAt": -1}).
		SetLimit(50)

	cursor, err := h.DB.Ratings.Find(ctx, bson.M{"userToken": auth.UserToken(r)}, findOptions)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch your ratings")
		return
	}
	defer cursor.Close(ctx)

	ratings := []models.Rating{}
	if err := cursor.All(ctx, &ratings); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch your ratings")
		return
	}

	response.JSON(w, http.StatusOK, M{
		"success": true,
		"data":    ratings,
		"count":   len(ratings),
	})
}
