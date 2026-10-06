# SheTrust API — Go backend

The server behind SheTrust: a crowd-sourced women's safety map for Bengaluru.
People rate a place on four factors, and the server turns thousands of those
ratings into one trustworthy score per place, per time of day.

This replaces an Express + Mongoose backend. It is written to be **read**, so
it sticks to Go's standard library wherever that is reasonable:

| Job | What we use | Instead of |
| --- | --- | --- |
| HTTP routing | `net/http.ServeMux` | Express, Gin, Chi |
| JSON | `encoding/json` | — |
| Login tokens | ~80 hand-written lines (`internal/auth/jwt.go`) | `jsonwebtoken` |
| Config files | ~30 hand-written lines (`internal/config`) | `dotenv` |
| Rate limiting | ~60 hand-written lines (`internal/middleware`) | `express-rate-limit` |
| Live updates | Server-Sent Events (`internal/events`) | Socket.io |
| Regression maths | Hand-written matrix code (`internal/sti`) | a stats library |

Only two dependencies are not standard library, and both earn their place:
the official **MongoDB driver**, and **bcrypt** for password hashing — which
you should never implement yourself.

## Running it

You need [Go](https://go.dev/dl/) 1.26 or newer and a MongoDB database.
(The language features used here need only 1.22; the floor comes from
keeping `golang.org/x/crypto` on its current, patched release.)

```bash
cp .env.example .env     # then edit MONGODB_URI
go mod download
go run ./cmd/api
```

The API comes up on <http://localhost:5000>. Check it with:

```bash
curl http://localhost:5000/api/health
```

To fill an empty database with 34 real Bengaluru locations and demo ratings:

```bash
go run ./cmd/seed
```

> The seeder **deletes** all existing locations, ratings and trust scores
> first. Never run it against a database with real contributions in it.

Other useful commands:

```bash
go test ./...            # run the tests
go vet ./...             # catch suspicious code
go build -o bin/api ./cmd/api
```

From the project root, `npm run dev` starts this server and the React
frontend together.

## Layout

This is the standard Go project layout: `cmd/` holds the programs you can
run, and `internal/` holds the packages they are built from. The name
`internal` is special to the Go toolchain — nothing outside this module can
import it, so these packages stay free to change.

```
backend/
├── cmd/                      programs you can run
│   ├── api/                  the HTTP server
│   └── seed/                 demo-data loader
│
├── internal/
│   ├── config/               reading .env and environment variables
│   ├── models/               the shape of our data
│   ├── database/             MongoDB connection and indexes
│   ├── response/             writing JSON replies
│   ├── mathx/                rounding and clamping helpers
│   ├── auth/                 JWTs, token hashing, "who is calling?"
│   ├── middleware/           CORS, logging, recovery, rate limiting
│   ├── events/               live updates over Server-Sent Events
│   ├── sti/                  the scoring engine and its regression
│   ├── handlers/             one file per feature area
│   └── seed/                 the demo dataset
│
├── go.mod                    module name and dependencies
└── README.md
```

Packages only ever import ones listed above them, so the dependency graph
is a straight line with no cycles. `models` depends on almost nothing;
`handlers` depends on nearly everything.

### Reading order

| Where | What is in it |
| --- | --- |
| `cmd/api/main.go` | **Start here.** Config, database, wiring, server start. |
| `internal/handlers/handlers.go` | The route table — every URL in one place. |
| `internal/models/` | Location, Rating, User, Survey, and the TRS maths. |
| `internal/database/` | Connecting to MongoDB and creating indexes. |
| `internal/auth/jwt.go` | What a login token is, and how it is signed and checked. |
| `internal/auth/middleware.go` | Identifying callers, including anonymous ones. |
| `internal/handlers/*.go` | One file per feature: auth, locations, ratings, survey. |
| `internal/sti/engine.go` | **The interesting part** — how a safety score is calculated. |
| `internal/sti/regression.go` | How the formula's weights are learned from survey data. |
| `internal/events/sse.go` | Pushing live score updates to the browser. |

### How the pieces are connected

There are no global variables. `cmd/api/main.go` builds each part and hands
it to whoever needs it:

```go
db     := database.Connect(cfg.MongoURI)   // owns the collections
hub    := events.NewHub()                  // owns the SSE connections
engine := sti.NewEngine(db)                // owns the weights cache
authn  := auth.New(cfg.JWTSecret, db)      // owns the signing secret

api := handlers.New(cfg, db, hub, engine, authn)
http.ListenAndServe(addr, api.Routes())
```

That is the whole wiring. Each package declares what it needs in its own
constructor, so you can see a component's dependencies without reading its
implementation — and swap any of them out in a test.

## How the score works

Each rating scores four things from 1 to 10:
**lighting**, **crowd behaviour**, **police visibility** and **incidents**
(plus optional phone **network** strength).

The published score for a place is a weighted average of everyone's ratings:

```
STI = 0.30×Lighting + 0.30×Crowd + 0.20×Police + 0.20×(10 − Incidents)
```

Three things make that more than a plain average:

**Incidents are flipped.** `10 − Incidents`, because every other factor is
"higher is safer" and incidents are the opposite.

**Not everyone counts equally.** Each contributor has a Trust Reliability
Score (TRS) between 0.1 and 0.98. Rate close to what everyone else says and
it rises; submit wild outliers and it falls. The average is weighted by it,
so one person cannot swing a location on their own. See `updateUserTRS`.

**A score needs a quorum.** Below three ratings a place stays `unrated`
rather than showing a number one person decided.

Scores are kept separately for **morning, afternoon, evening and night**,
because a market that is fine at noon is a different place at midnight.
Above 8 is `safe`, 5 to 8 is `moderate`, below 5 is `risky`.

### Where the weights come from

The 30/30/20/20 split started as a guess. The survey replaces the guess with
evidence: it asks for the same four factors **and** an overall gut-feel
score, then `regression.go` solves

```
β = (XᵀX)⁻¹ Xᵀy
```

for the mix of factors that best predicts the gut feel. Once there are 10+
surveys and the fit is good enough (R² ≥ 0.3), those learned weights take
over from the defaults.

## Endpoints

All responses are `{ "success": true, "data": ... }` or
`{ "success": false, "error": "..." }`. The two exceptions are `/api/health`
and `/api/locations/heatmap`, which return bare objects the frontend
consumes directly.

### Locations

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/locations` | Filters: `city`, `slot`, `category`, `lat`+`lng`+`radius`, `search`, `limit`, `page` |
| `GET` | `/api/locations/heatmap` | GeoJSON for the map. `?slot=night` |
| `GET` | `/api/locations/search/{query}` | Autocomplete, max 8 results |
| `GET` | `/api/locations/{id}` | One location, all four slots |
| `POST` | `/api/locations` | Suggest a new place |

### Ratings

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/ratings` | Submit a rating. One per place+slot per 6 hours |
| `GET` | `/api/ratings/my` | Everything this token has submitted |
| `GET` | `/api/ratings/location/{id}` | Per-slot averages |
| `GET` | `/api/ratings/location/{id}/trend` | Score history for a chart |

### Survey

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/survey` | Submit a questionnaire response |
| `GET` | `/api/survey/stats` | Count and per-question averages |
| `GET` | `/api/survey/weights` | Run the regression, return the weights |

### Auth and the rest

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | |
| `POST` | `/api/auth/login` | |
| `GET` | `/api/auth/me` | Needs `Authorization: Bearer <token>` |
| `POST` | `/api/auth/logout` | Client-side only; JWTs are stateless |
| `GET` | `/api/health` | |
| `GET` | `/api/events` | Live updates stream (SSE) |

## Rating without an account

You do not need to sign up to contribute. The first time a browser calls the
API, the server mints an anonymous token and returns it in the
`X-Auth-Token` response header; the frontend saves it and sends it back from
then on. That token is what ties someone's ratings together and earns them a
trust score.

The server only ever stores a **SHA-256 hash** of the token, never the token
itself, so a database leak could not be used to impersonate anyone.

## Notes if you knew the Node version

- **Collection names are explicit.** Mongoose turned a model called
  `Location` into a collection called `locations` behind your back.
  `internal/database/database.go` names all six out loud. They match the
  existing data — do not rename them.

- **Existing login tokens still work.** This is the same HS256 algorithm, so
  as long as `JWT_SECRET` is unchanged, tokens issued by the old server
  verify here.

- **Indexes are created at startup**, in `database.EnsureIndexes()`, rather than
  invisibly by Mongoose. The 2dsphere one is required: `$near` queries fail
  outright without it.

- **Socket.io is now SSE.** Updates only ever flowed server-to-browser, which
  is exactly what SSE is for. The frontend's `utils/socket.js` keeps the same
  `.on()` / `.off()` API, so components did not change.

- **One bug fixed in the port.** The old `computeSTI` in `stiEngine.js` divided the network
  average by the total trust of *all* raters, including those who left
  network blank, which understated it. It now divides by the trust of the
  raters who actually answered.

- **These features were dropped** to keep the backend small: incident
  reports with photo upload, the notification centre and web push, the admin
  dashboard, and the Gemini-powered chatbot and comment classifier. The
  frontend components for them still exist but have no server to talk to.
  Comments are still stored on ratings, just no longer auto-classified.
