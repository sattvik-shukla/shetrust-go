// Package config reads settings from .env files and the environment.
//
// Node used the "dotenv" package for this. In Go it is about 30 lines, so
// there is no reason to take on a dependency.
package config

import (
	"bufio"
	"os"
	"strings"
)

// Config holds every setting the server needs. It is built once at startup
// and passed down, so nothing else has to reach for os.Getenv itself.
type Config struct {
	Port        string
	MongoURI    string
	JWTSecret   string
	FrontendURL string
}

// Load reads ../.env then .env, and builds the Config.
//
// Both paths are relative to wherever you ran the program from, which is
// normally the backend/ folder — so this picks up a shared .env at the
// project root as well as a backend-specific one.
func Load() Config {
	loadEnvFile("../.env")
	loadEnvFile(".env")

	return Config{
		Port:        env("PORT", "5000"),
		MongoURI:    env("MONGODB_URI", "mongodb://localhost:27017/shetrust"),
		JWTSecret:   env("JWT_SECRET", "shetrust_dev_secret"),
		FrontendURL: env("FRONTEND_URL", ""),
	}
}

// AllowedOrigins is the list of frontends permitted to call the API.
func (c Config) AllowedOrigins() []string {
	if c.FrontendURL != "" {
		return []string{c.FrontendURL}
	}
	// Local development: Vite serves the frontend on port 3000.
	return []string{"http://localhost:3000", "http://127.0.0.1:3000"}
}

// loadEnvFile copies "KEY=value" pairs from a file into the environment.
// A variable that is already set for real always wins, which is what you
// want on a host like Railway or Render.
func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return // No file here. That is fine, we just use real env vars.
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip blank lines and comments.
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)

		if _, alreadySet := os.LookupEnv(key); !alreadySet {
			os.Setenv(key, value)
		}
	}
}

// env returns an environment variable, or fallback when it is empty/missing.
func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
