package handlers

// Survey: the research questionnaire that teaches the STI formula its
// weights.
//
// A Rating asks "score these four things". A Survey asks the same four
// things AND "how safe did it feel overall". That extra answer is what
// lets the regression work out which factors actually drive the feeling
// of safety.

import (
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"shetrust/backend/internal/auth"
	"shetrust/backend/internal/database"
	"shetrust/backend/internal/mathx"
	"shetrust/backend/internal/models"
	"shetrust/backend/internal/response"
	"shetrust/backend/internal/sti"
)

// SubmitSurvey records a questionnaire response.
//
// POST /api/survey
func (h *Handlers) SubmitSurvey(w http.ResponseWriter, r *http.Request) {
	var body struct {
		LocationID string `json:"locationId"`
		TimeSlot   string `json:"timeSlot"`

		Lighting          *int `json:"lighting"`
		CrowdDensity      *int `json:"crowdDensity"`
		PublicTransport   *int `json:"publicTransport"`
		IncidentFrequency *int `json:"incidentFrequency"`
		OverallRating     *int `json:"overallRating"`
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

	for _, field := range []struct {
		name  string
		value *int
	}{
		{"lighting", body.Lighting},
		{"crowdDensity", body.CrowdDensity},
		{"publicTransport", body.PublicTransport},
		{"incidentFrequency", body.IncidentFrequency},
		{"overallRating", body.OverallRating},
	} {
		if field.value == nil || *field.value < 0 || *field.value > 10 {
			response.Error(w, http.StatusBadRequest, field.name+" must be 0–10")
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

	survey := models.Survey{
		ID:                bson.NewObjectID(),
		LocationID:        locationID,
		UserToken:         auth.UserToken(r),
		TimeSlot:          body.TimeSlot,
		Lighting:          *body.Lighting,
		CrowdDensity:      *body.CrowdDensity,
		PublicTransport:   *body.PublicTransport,
		IncidentFrequency: *body.IncidentFrequency,
		OverallRating:     *body.OverallRating,
		CreatedAt:         time.Now(),
	}

	if _, err := h.DB.Surveys.InsertOne(ctx, survey); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to submit survey")
		return
	}

	// New evidence has arrived, so the cached weights are now stale. The
	// frontend asks for the new weights immediately after submitting.
	h.STI.InvalidateWeights()

	response.JSON(w, http.StatusCreated, M{
		"success": true,
		"message": "Survey submitted successfully",
		"data": M{
			"surveyId":     survey.ID,
			"locationName": location.Name,
		},
	})
}

// SurveyStats returns how many surveys we have and the average answer to
// each question.
//
// GET /api/survey/stats
func (h *Handlers) SurveyStats(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := database.Ctx()
	defer cancel()

	cursor, err := h.DB.Surveys.Find(ctx, bson.M{})
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch survey stats")
		return
	}
	defer cursor.Close(ctx)

	var surveys []models.Survey
	if err := cursor.All(ctx, &surveys); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch survey stats")
		return
	}

	if len(surveys) == 0 {
		response.JSON(w, http.StatusOK, M{"success": true, "data": M{"count": 0}})
		return
	}

	// Averaging in Go rather than with a MongoDB aggregation pipeline.
	// Surveys are few, and the loop is far easier to read.
	var lighting, crowd, transport, incident, overall float64
	for _, survey := range surveys {
		lighting += float64(survey.Lighting)
		crowd += float64(survey.CrowdDensity)
		transport += float64(survey.PublicTransport)
		incident += float64(survey.IncidentFrequency)
		overall += float64(survey.OverallRating)
	}

	count := float64(len(surveys))

	response.JSON(w, http.StatusOK, M{
		"success": true,
		"data": M{
			"count":        len(surveys),
			"avgLighting":  mathx.Round2(lighting / count),
			"avgCrowd":     mathx.Round2(crowd / count),
			"avgTransport": mathx.Round2(transport / count),
			"avgIncident":  mathx.Round2(incident / count),
			"avgOverall":   mathx.Round2(overall / count),
		},
	})
}

// SurveyWeights runs the regression and returns the derived weights plus
// the readable formula.
//
// GET /api/survey/weights
func (h *Handlers) SurveyWeights(w http.ResponseWriter, r *http.Request) {
	result := sti.ComputeOptimalWeights(h.DB)

	// The response is assembled by hand for one reason: the frontend reads
	// the third weight as "transport", because that is the survey question
	// ("how good is public transport here?"). Internally the STI engine
	// applies that same weight to police visibility, so it is called
	// "police" everywhere else in this codebase. Renaming it here keeps
	// the existing SurveyModal working.
	response.JSON(w, http.StatusOK, M{
		"success": true,
		"data": M{
			"weights": M{
				"lighting":  result.Weights.Lighting,
				"crowd":     result.Weights.Crowd,
				"transport": result.Weights.Police,
				"incident":  result.Weights.Incident,
			},
			"r2":         result.R2,
			"sampleSize": result.SampleSize,
			"fallback":   result.Fallback,
			"message":    result.Message,
			"formula":    result.Formula,
			"source":     result.Weights.Source,
		},
	})
}
