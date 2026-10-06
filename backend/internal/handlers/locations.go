package handlers

// Locations: the places people rate, and the map data built from them.

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"

	"shetrust/backend/internal/database"
	"shetrust/backend/internal/models"
	"shetrust/backend/internal/response"
)

// maxPageSize stops a caller asking for the entire collection at once.
const maxPageSize = 200

// ListLocations returns a filtered, paginated list.
//
// GET /api/locations
//
// Query parameters:
//
//	city     default "Bengaluru"
//	slot     morning | afternoon | evening | night
//	category safe | moderate | risky   (only meaningful together with slot)
//	lat,lng  centre point for a nearby search
//	radius   metres, default 10000
//	search   free text matched against name and area
//	limit    default 50, capped at 200
//	page     default 1
func (h *Handlers) ListLocations(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	filter := bson.M{"city": queryString(r, "city", "Bengaluru")}

	// Nearby search. $near needs the 2dsphere index that database.
	// EnsureIndexes creates, and it returns results nearest-first.
	usingGeoSearch := false
	if query.Get("lat") != "" && query.Get("lng") != "" {
		lat := queryFloat(r, "lat", 0)
		lng := queryFloat(r, "lng", 0)
		radius := queryInt(r, "radius", 10000)

		filter["location"] = bson.M{
			"$near": bson.M{
				"$geometry":    bson.M{"type": "Point", "coordinates": []float64{lng, lat}},
				"$maxDistance": radius,
			},
		}
		usingGeoSearch = true
	}

	if search := strings.TrimSpace(query.Get("search")); search != "" {
		filter["$or"] = nameOrAreaMatches(search)
	}

	// Filter by how safe a slot is, e.g. "show me risky places at night".
	slot := query.Get("slot")
	category := query.Get("category")
	switch {
	case slot != "" && category != "":
		filter["timeSlots"] = bson.M{"$elemMatch": bson.M{"slot": slot, "category": category}}
	case slot != "":
		filter["timeSlots.slot"] = slot
	}

	limit := queryInt(r, "limit", 50)
	if limit < 1 || limit > maxPageSize {
		limit = 50
	}
	page := queryInt(r, "page", 1)
	if page < 1 {
		page = 1
	}

	findOptions := options.Find().
		SetLimit(int64(limit)).
		SetSkip(int64((page - 1) * limit))

	// $near already orders by distance, and MongoDB rejects a second sort
	// stacked on top of it.
	if !usingGeoSearch {
		findOptions.SetSort(bson.M{"totalRatings": -1})
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	cursor, err := h.DB.Locations.Find(ctx, filter, findOptions)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch locations")
		return
	}
	defer cursor.Close(ctx)

	// Start from an empty slice, not nil, so no results encode as [] not null.
	locations := []models.Location{}
	if err := cursor.All(ctx, &locations); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch locations")
		return
	}

	total, err := h.DB.Locations.CountDocuments(ctx, filter)
	if err != nil {
		total = int64(len(locations))
	}

	pages := total / int64(limit)
	if total%int64(limit) != 0 {
		pages++
	}

	response.JSON(w, http.StatusOK, M{
		"success": true,
		"data":    locations,
		"pagination": M{
			"total": total,
			"page":  page,
			"limit": limit,
			"pages": pages,
		},
	})
}

// Heatmap returns a GeoJSON FeatureCollection, which is the format Mapbox
// draws directly.
//
// Unlike the other endpoints this is NOT wrapped in { success, data } —
// the frontend hands the body straight to the map.
//
// GET /api/locations/heatmap
func (h *Handlers) Heatmap(w http.ResponseWriter, r *http.Request) {
	slot := queryString(r, "slot", "evening")
	city := queryString(r, "city", "Bengaluru")

	ctx, cancel := database.Ctx()
	defer cancel()

	cursor, err := h.DB.Locations.Find(ctx, bson.M{"city": city})
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to generate heatmap data")
		return
	}
	defer cursor.Close(ctx)

	var locations []models.Location
	if err := cursor.All(ctx, &locations); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to generate heatmap data")
		return
	}

	features := make([]M, 0, len(locations))
	for _, location := range locations {
		// Pull out just the slot the caller asked for.
		var score *float64
		category := "unrated"
		ratingCount := 0

		if index := location.SlotIndex(slot); index != -1 {
			s := location.TimeSlots[index]
			score = s.STI
			ratingCount = s.RatingCount
			if s.Category != "" {
				category = s.Category
			}
		}

		features = append(features, M{
			"type":     "Feature",
			"geometry": location.Location,
			"properties": M{
				"id":          location.ID,
				"name":        location.Name,
				"area":        location.Area,
				"type":        location.Type,
				"sti":         score,
				"category":    category,
				"ratingCount": ratingCount,
				"overallSTI":  location.OverallSTI,
				"slot":        slot,
			},
		})
	}

	response.JSON(w, http.StatusOK, M{
		"type":     "FeatureCollection",
		"features": features,
		"meta": M{
			"slot":        slot,
			"city":        city,
			"count":       len(features),
			"generatedAt": time.Now(),
		},
	})
}

// GetLocation returns one location with all four time slots.
//
// GET /api/locations/{id}
func (h *Handlers) GetLocation(w http.ResponseWriter, r *http.Request) {
	// PathValue reads the {id} part of the route pattern. This is standard
	// library routing, added in Go 1.22 — no third-party router needed.
	objectID, err := bson.ObjectIDFromHex(r.PathValue("id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid location id")
		return
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	var location models.Location
	if err := h.DB.Locations.FindOne(ctx, bson.M{"_id": objectID}).Decode(&location); err != nil {
		if err == mongo.ErrNoDocuments {
			response.Error(w, http.StatusNotFound, "Location not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "Failed to fetch location")
		return
	}

	response.JSON(w, http.StatusOK, M{"success": true, "data": location})
}

// SearchLocations is the autocomplete endpoint: a short list of matches as
// the user types.
//
// GET /api/locations/search/{query}
func (h *Handlers) SearchLocations(w http.ResponseWriter, r *http.Request) {
	searchText := strings.TrimSpace(r.PathValue("query"))
	if searchText == "" {
		response.JSON(w, http.StatusOK, M{"success": true, "data": []models.Location{}})
		return
	}

	filter := bson.M{
		"city": "Bengaluru",
		"$or":  nameOrAreaMatches(searchText),
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	cursor, err := h.DB.Locations.Find(ctx, filter, options.Find().SetLimit(8))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Search failed")
		return
	}
	defer cursor.Close(ctx)

	locations := []models.Location{}
	if err := cursor.All(ctx, &locations); err != nil {
		response.Error(w, http.StatusInternalServerError, "Search failed")
		return
	}

	response.JSON(w, http.StatusOK, M{"success": true, "data": locations})
}

// CreateLocation lets anyone suggest a missing place. New ones start
// unverified.
//
// POST /api/locations
func (h *Handlers) CreateLocation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string    `json:"name"`
		Area        string    `json:"area"`
		Type        string    `json:"type"`
		Coordinates []float64 `json:"coordinates"` // [longitude, latitude]
	}
	if !response.Decode(w, r, &body) {
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" || len(body.Coordinates) != 2 {
		response.Error(w, http.StatusBadRequest, "name and coordinates [lng,lat] are required")
		return
	}

	lng, lat := body.Coordinates[0], body.Coordinates[1]
	if lng < -180 || lng > 180 || lat < -90 || lat > 90 {
		response.Error(w, http.StatusBadRequest, "coordinates must be [lng,lat] within valid ranges")
		return
	}

	locationType := body.Type
	if !models.LocationTypes[locationType] {
		locationType = "other"
	}

	ctx, cancel := database.Ctx()
	defer cancel()

	// Reject near-duplicates: a similar name within 50 metres.
	duplicateFilter := bson.M{
		"name": bson.M{"$regex": regexp.QuoteMeta(name), "$options": "i"},
		"location": bson.M{
			"$near": bson.M{
				"$geometry":    bson.M{"type": "Point", "coordinates": []float64{lng, lat}},
				"$maxDistance": 50,
			},
		},
	}

	var existing models.Location
	if err := h.DB.Locations.FindOne(ctx, duplicateFilter).Decode(&existing); err == nil {
		response.JSON(w, http.StatusConflict, M{
			"success": false,
			"error":   "Similar location already exists",
			"data":    existing,
		})
		return
	}

	now := time.Now()
	location := models.Location{
		ID:         bson.NewObjectID(),
		Name:       name,
		Area:       strings.TrimSpace(body.Area),
		City:       "Bengaluru",
		Type:       locationType,
		Location:   models.GeoPoint{Type: "Point", Coordinates: []float64{lng, lat}},
		TimeSlots:  models.NewTimeSlots(),
		Tags:       []string{},
		IsVerified: false,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if _, err := h.DB.Locations.InsertOne(ctx, location); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create location")
		return
	}

	response.JSON(w, http.StatusCreated, M{"success": true, "data": location})
}

// nameOrAreaMatches builds a case-insensitive "name or area contains this"
// filter.
//
// regexp.QuoteMeta escapes regex characters, so someone typing "a.*" or a
// pathological pattern searches for that literal text instead of running
// it as a regular expression across the whole collection.
func nameOrAreaMatches(search string) []bson.M {
	pattern := regexp.QuoteMeta(search)
	return []bson.M{
		{"name": bson.M{"$regex": pattern, "$options": "i"}},
		{"area": bson.M{"$regex": pattern, "$options": "i"}},
	}
}
