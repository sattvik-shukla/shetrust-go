// Command api is the SheTrust HTTP server.
//
// Start here. This file does four things, in order:
//
//  1. read configuration
//  2. connect to MongoDB
//  3. wire the pieces together
//  4. start the server, and stop it cleanly on Ctrl+C
//
// Every piece it wires up lives in its own package under internal/, named
// after what it does: auth, sti, events, handlers, and so on.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"shetrust/backend/internal/auth"
	"shetrust/backend/internal/config"
	"shetrust/backend/internal/database"
	"shetrust/backend/internal/events"
	"shetrust/backend/internal/handlers"
	"shetrust/backend/internal/sti"
)

func main() {
	// Prefix log lines with the time only — the date is noise in development.
	log.SetFlags(log.Ltime)

	cfg := config.Load()

	db, err := database.Connect(cfg.MongoURI)
	if err != nil {
		log.Fatalf("MongoDB connection failed: %v", err)
	}
	db.EnsureIndexes()
	db.LogCounts()

	// Build the parts, then hand them to the HTTP layer. Nothing here is a
	// global: each package is given exactly what it needs.
	hub := events.NewHub()
	engine := sti.NewEngine(db)
	authenticator := auth.New(cfg.JWTSecret, db)

	api := handlers.New(cfg, db, hub, engine, authenticator)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: api.Routes(),

		// Timeouts matter: without them one stalled client can hold a
		// connection open forever. WriteTimeout is deliberately absent —
		// it would cut off the /api/events stream, which stays open by
		// design.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	// Run the server in the background so main can wait for Ctrl+C below.
	go func() {
		log.Printf("SheTrust API listening on http://localhost:%s", cfg.Port)
		log.Printf("Health check: http://localhost:%s/api/health", cfg.Port)

		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("server failed: %v", err)
		}
	}()

	waitForShutdown(server, db)
}

// waitForShutdown blocks until Ctrl+C, then stops the server politely: no
// new connections, but requests already in flight get up to 10 seconds to
// finish before the process exits.
func waitForShutdown(server *http.Server, db *database.DB) {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	<-stop // blocks here until a signal arrives
	log.Println("Shutting down…")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("forced shutdown: %v", err)
	}
	if err := db.Close(ctx); err != nil {
		log.Printf("MongoDB disconnect: %v", err)
	}

	log.Println("Goodbye.")
}
