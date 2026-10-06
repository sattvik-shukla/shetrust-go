// Command seed fills the database with demo data for local development.
//
//	go run ./cmd/seed
//
// WARNING: this DELETES every location, rating and trust score for
// Bengaluru before rebuilding them. Never point it at a database holding
// real contributions.
package main

import (
	"log"

	"shetrust/backend/internal/config"
	"shetrust/backend/internal/database"
	"shetrust/backend/internal/seed"
	"shetrust/backend/internal/sti"
)

func main() {
	log.SetFlags(log.Ltime)

	cfg := config.Load()

	db, err := database.Connect(cfg.MongoURI)
	if err != nil {
		log.Fatalf("MongoDB connection failed: %v", err)
	}
	db.EnsureIndexes()

	// The seeder runs the real scoring engine over the ratings it creates,
	// so the demo data is scored exactly the way live data would be.
	if err := seed.Run(db, sti.NewEngine(db)); err != nil {
		log.Fatalf("seeding failed: %v", err)
	}
}
