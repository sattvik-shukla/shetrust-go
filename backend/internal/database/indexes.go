package database

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// EnsureIndexes creates the indexes the queries in this project rely on.
//
// Mongoose did this invisibly at startup. Doing it explicitly means you can
// see exactly which queries are meant to be fast — and the app still works
// against a brand new, empty database.
//
// Creating an index that already exists is a harmless no-op, so this is
// safe to run on every boot.
func (db *DB) EnsureIndexes() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	indexes := []struct {
		collection *mongo.Collection
		model      mongo.IndexModel
		purpose    string
	}{
		// 2dsphere powers the "$near" searches. Without it, a $near query
		// fails outright rather than merely running slowly.
		{db.Locations, mongo.IndexModel{
			Keys: bson.D{{Key: "location", Value: "2dsphere"}},
		}, "locations geo search"},

		{db.Locations, mongo.IndexModel{
			Keys: bson.D{{Key: "city", Value: 1}, {Key: "totalRatings", Value: -1}},
		}, "locations list"},

		// The exact shape the STI engine queries by.
		{db.Ratings, mongo.IndexModel{
			Keys: bson.D{
				{Key: "locationId", Value: 1},
				{Key: "timeSlot", Value: 1},
				{Key: "isIncluded", Value: 1},
			},
		}, "STI calculation"},

		// For "my ratings" and the 6-hour cooldown check.
		{db.Ratings, mongo.IndexModel{
			Keys: bson.D{{Key: "userToken", Value: 1}, {Key: "createdAt", Value: -1}},
		}, "rating history"},

		// Unique: two accounts must never share an email address.
		{db.Users, mongo.IndexModel{
			Keys:    bson.D{{Key: "email", Value: 1}},
			Options: options.Index().SetUnique(true),
		}, "unique user emails"},

		{db.UserTrust, mongo.IndexModel{
			Keys:    bson.D{{Key: "tokenHash", Value: 1}},
			Options: options.Index().SetUnique(true),
		}, "trust score lookup"},

		{db.STIHistory, mongo.IndexModel{
			Keys: bson.D{
				{Key: "locationId", Value: 1},
				{Key: "timeSlot", Value: 1},
				{Key: "recordedAt", Value: -1},
			},
		}, "trend charts"},
	}

	for _, index := range indexes {
		if _, err := index.collection.Indexes().CreateOne(ctx, index.model); err != nil {
			// Not fatal: the app works without an index, just slower. The
			// usual cause is an equivalent index already existing under a
			// different name, which is harmless.
			log.Printf("index for %s not created: %v", index.purpose, err)
		}
	}
}
