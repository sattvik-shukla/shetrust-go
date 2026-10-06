// Package seed fills an empty database with demo data, so a fresh clone
// has something on the map.
//
// Run it with:  go run ./cmd/seed
//
// It is a separate command, never something the server does on startup,
// because Run deletes every location, rating and trust score for Bengaluru
// before rebuilding them.
package seed

import (
	"log"
	"math/rand"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"

	"shetrust/backend/internal/database"
	"shetrust/backend/internal/mathx"
	"shetrust/backend/internal/models"
	"shetrust/backend/internal/sti"
)

// place is a seed location before it becomes a full models.Location.
type place struct {
	name        string
	area        string
	kind        string
	coordinates []float64 // [longitude, latitude]
}

// Real places in Bengaluru, with real coordinates.
var places = []place{
	// Metro and rail
	{"MG Road Metro Station", "MG Road", "metro_station", []float64{77.6057, 12.9752}},
	{"Indiranagar Metro Station", "Indiranagar", "metro_station", []float64{77.6409, 12.9719}},
	{"Koramangala Metro (Upcoming)", "Koramangala", "metro_station", []float64{77.6245, 12.9279}},
	{"Majestic / KSR Railway Station", "Majestic", "metro_station", []float64{77.5713, 12.9767}},
	{"Whitefield Metro Station", "Whitefield", "metro_station", []float64{77.7480, 12.9698}},
	{"Silk Board Metro Station", "Silk Board", "metro_station", []float64{77.6218, 12.9174}},
	{"Yelahanka Metro Station", "Yelahanka", "metro_station", []float64{77.5942, 13.1013}},

	// Bus stops
	{"Shivajinagar Bus Stand", "Shivajinagar", "bus_stop", []float64{77.5946, 12.9856}},
	{"Kempegowda Bus Station (Majestic)", "Majestic", "bus_stop", []float64{77.5722, 12.9787}},
	{"BTM Layout Bus Stop", "BTM Layout", "bus_stop", []float64{77.6101, 12.9165}},
	{"Hebbal Flyover Bus Stop", "Hebbal", "bus_stop", []float64{77.5953, 13.0351}},

	// Markets and commercial
	{"Commercial Street", "Shivajinagar", "commercial", []float64{77.6072, 12.9819}},
	{"Brigade Road", "MG Road", "commercial", []float64{77.6073, 12.9719}},
	{"Chickpete Market", "Chickpete", "market", []float64{77.5762, 12.9668}},
	{"KR Market (City Market)", "Kalasipalya", "market", []float64{77.5741, 12.9642}},
	{"Russell Market", "Shivajinagar", "market", []float64{77.5990, 12.9831}},
	{"Jayanagar 4th Block Market", "Jayanagar", "market", []float64{77.5835, 12.9258}},
	{"Malleshwaram Market", "Malleshwaram", "market", []float64{77.5685, 13.0031}},
	{"Forum Mall, Koramangala", "Koramangala", "commercial", []float64{77.6101, 12.9322}},
	{"Phoenix Marketcity, Whitefield", "Whitefield", "commercial", []float64{77.7126, 12.9965}},

	// Parks
	{"Cubbon Park", "Cubbon Park", "park", []float64{77.5930, 12.9763}},
	{"Lalbagh Botanical Garden", "Lalbagh", "park", []float64{77.5840, 12.9507}},
	{"Ulsoor Lake", "Ulsoor", "park", []float64{77.6203, 12.9799}},
	{"Bannerghatta Road Park", "Bannerghatta", "park", []float64{77.5910, 12.8704}},

	// Roads
	{"Residency Road", "MG Road", "road", []float64{77.6012, 12.9714}},
	{"Outer Ring Road (Marathahalli)", "Marathahalli", "road", []float64{77.7025, 12.9562}},
	{"Hosur Road (Bommanahalli)", "Bommanahalli", "road", []float64{77.6257, 12.9059}},
	{"Old Airport Road", "Varthur", "road", []float64{77.6886, 12.9629}},
	{"Domlur Flyover", "Domlur", "road", []float64{77.6378, 12.9614}},
	{"Marathahalli Bridge", "Marathahalli", "road", []float64{77.7012, 12.9592}},

	// Residential and other
	{"HSR Layout Sector 7", "HSR Layout", "residential", []float64{77.6381, 12.9082}},
	{"Electronic City Phase 1", "Electronic City", "commercial", []float64{77.6659, 12.8399}},
	{"Rajajinagar Market", "Rajajinagar", "market", []float64{77.5555, 12.9912}},
	{"Frazer Town", "Frazer Town", "residential", []float64{77.6127, 12.9865}},
}

// scoreRange is the [min, max] a generated factor can fall in.
type scoreRange struct{ min, max int }

// slotProfile describes what a typical rating looks like in one time slot.
// Night is darker, emptier and has more incidents, so the demo data shows
// the same day/night pattern real ratings do.
type slotProfile struct {
	lighting scoreRange
	crowd    scoreRange
	police   scoreRange
	incident scoreRange
}

var slotProfiles = map[string]slotProfile{
	"morning":   {scoreRange{6, 9}, scoreRange{5, 8}, scoreRange{4, 7}, scoreRange{1, 3}},
	"afternoon": {scoreRange{8, 10}, scoreRange{6, 9}, scoreRange{5, 8}, scoreRange{1, 2}},
	"evening":   {scoreRange{4, 8}, scoreRange{5, 9}, scoreRange{3, 6}, scoreRange{2, 5}},
	"night":     {scoreRange{2, 6}, scoreRange{2, 6}, scoreRange{2, 5}, scoreRange{3, 8}},
}

// Some kinds of place are simply safer than others.
var safetyModifier = map[string]int{
	"metro_station": 0, "bus_stop": -1, "market": 0, "park": +1,
	"road": -2, "residential": +1, "commercial": +1, "other": 0,
}

// Run wipes the Bengaluru data and rebuilds it from the lists above.
func Run(db *database.DB, engine *sti.Engine) error {
	ctx, cancel := database.Ctx()
	defer cancel()

	log.Println("Clearing existing Bengaluru data…")
	if _, err := db.Locations.DeleteMany(ctx, bson.M{"city": "Bengaluru"}); err != nil {
		return err
	}
	if _, err := db.Ratings.DeleteMany(ctx, bson.M{}); err != nil {
		return err
	}
	if _, err := db.UserTrust.DeleteMany(ctx, bson.M{}); err != nil {
		return err
	}

	// Twenty pretend contributors, so ratings are not all from one person.
	tokens := make([]string, 20)
	for i := range tokens {
		tokens[i] = "demo_" + bson.NewObjectID().Hex()
	}

	// Give each one a trust score, which is what makes the weighted
	// average in the STI engine actually do something visible.
	for _, token := range tokens {
		trust := 0.4 + rand.Float64()*0.55

		_, err := db.UserTrust.InsertOne(ctx, models.UserTrust{
			ID:               bson.NewObjectID(),
			TokenHash:        token,
			TRS:              mathx.Round2(trust),
			TotalRatings:     randBetween(5, 40),
			ConsensusMatches: randBetween(3, 30),
			IsFlagged:        trust < 0.3,
			LastActivity:     time.Now(),
			CreatedAt:        time.Now(),
		})
		if err != nil {
			return err
		}
	}

	for _, p := range places {
		now := time.Now()
		location := models.Location{
			ID:         bson.NewObjectID(),
			Name:       p.name,
			Area:       p.area,
			City:       "Bengaluru",
			Type:       p.kind,
			Location:   models.GeoPoint{Type: "Point", Coordinates: p.coordinates},
			TimeSlots:  models.NewTimeSlots(),
			Tags:       []string{},
			IsVerified: true,
			CreatedAt:  now,
			UpdatedAt:  now,
		}

		if _, err := db.Locations.InsertOne(ctx, location); err != nil {
			return err
		}

		modifier := safetyModifier[p.kind]

		for slot, profile := range slotProfiles {
			for i := 0; i < randBetween(4, 25); i++ {
				token := tokens[randBetween(0, len(tokens)-1)]

				lighting := mathx.ClampInt(randIn(profile.lighting)+modifier, 1, 10)
				crowd := mathx.ClampInt(randIn(profile.crowd)+modifier, 1, 10)
				police := mathx.ClampInt(randIn(profile.police)+modifier, 1, 10)
				incident := mathx.ClampInt(randIn(profile.incident)-modifier, 0, 10)

				rating := models.Rating{
					ID:               bson.NewObjectID(),
					LocationID:       location.ID,
					UserToken:        token,
					TimeSlot:         slot,
					Lighting:         lighting,
					CrowdBehavior:    crowd,
					PoliceVisibility: police,
					IncidentWeight:   incident,
					RawSTI:           models.ComputeRawSTI(lighting, crowd, police, incident),
					Tags:             []string{},
					TRSAtSubmission:  0.5,
					IsIncluded:       true,
					CreatedAt:        time.Now(),
				}

				if _, err := db.Ratings.InsertOne(ctx, rating); err != nil {
					return err
				}
			}

			// Now run the real scoring engine over what we just inserted.
			if _, err := engine.UpdateLocation(location.ID, slot); err != nil {
				log.Printf("could not score %s/%s: %v", p.name, slot, err)
			}
		}

		log.Printf("  seeded %s", p.name)
	}

	log.Printf("Done. %d locations seeded.", len(places))
	return nil
}

// randBetween returns a random int in [low, high], inclusive.
func randBetween(low, high int) int {
	if high <= low {
		return low
	}
	return low + rand.Intn(high-low+1)
}

func randIn(r scoreRange) int {
	return randBetween(r.min, r.max)
}
