// Package database owns the MongoDB connection and the collection handles.
//
// Mongoose hid collection names from you: a model called "Location" quietly
// read and wrote a collection called "locations". Here they are named out
// loud, because they have to match the data that already exists.
package database

import (
	"context"
	"log"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// queryTimeout caps how long any single query may take, so a slow database
// cannot leave requests hanging forever.
const queryTimeout = 10 * time.Second

// DB bundles the client and one handle per collection.
//
// Passing this around — instead of using package-level globals — is what
// lets each part of the app declare what it actually needs.
type DB struct {
	Client *mongo.Client

	Locations  *mongo.Collection
	Ratings    *mongo.Collection
	Users      *mongo.Collection
	UserTrust  *mongo.Collection
	Surveys    *mongo.Collection
	STIHistory *mongo.Collection
}

// Ctx returns a context with the standard query timeout.
//
// Use it like:
//
//	ctx, cancel := database.Ctx()
//	defer cancel()
//
// It is deliberately NOT derived from the request context: background work
// started with `go` must survive the response being sent.
func Ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), queryTimeout)
}

// Connect dials MongoDB and fills in the collection handles.
func Connect(uri string) (*DB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}

	// Connect() is lazy, so ping to prove the credentials really work.
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	name := databaseFromURI(uri)
	db := client.Database(name)

	log.Printf("MongoDB connected (database: %s)", name)

	// These strings are exactly what Mongoose created. Renaming one would
	// make the app start up against an empty collection.
	return &DB{
		Client:     client,
		Locations:  db.Collection("locations"),
		Ratings:    db.Collection("ratings"),
		Users:      db.Collection("users"),
		UserTrust:  db.Collection("usertrusts"),
		Surveys:    db.Collection("surveys"),
		STIHistory: db.Collection("stihistories"),
	}, nil
}

// Close disconnects cleanly on shutdown.
func (db *DB) Close(ctx context.Context) error {
	return db.Client.Disconnect(ctx)
}

// LogCounts prints how many documents each collection holds.
// All zeros means you are pointed at the wrong database.
func (db *DB) LogCounts() {
	ctx, cancel := Ctx()
	defer cancel()

	for _, c := range []struct {
		name string
		coll *mongo.Collection
	}{
		{"locations", db.Locations},
		{"ratings", db.Ratings},
		{"users", db.Users},
		{"surveys", db.Surveys},
	} {
		count, err := c.coll.CountDocuments(ctx, map[string]any{})
		if err != nil {
			log.Printf("  %-10s count failed: %v", c.name, err)
			continue
		}
		log.Printf("  %-10s %d documents", c.name, count)
	}
}

// databaseFromURI pulls the database name out of a connection string:
// "mongodb+srv://user:pass@host/shetrust?retryWrites=true" -> "shetrust"
func databaseFromURI(uri string) string {
	rest := uri
	if i := strings.Index(rest, "://"); i >= 0 {
		rest = rest[i+3:]
	}

	slash := strings.Index(rest, "/")
	if slash < 0 {
		return "shetrust"
	}
	rest = rest[slash+1:]

	if q := strings.Index(rest, "?"); q >= 0 {
		rest = rest[:q]
	}
	if rest == "" {
		return "shetrust"
	}
	return rest
}
