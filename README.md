# SheTrust

A crowd-verified women's safety map for Bengaluru.

People rate a place on four things — street lighting, crowd behaviour, police
visibility and recent incidents — and the backend turns thousands of those
ratings into a single **Safety Trust Index** (STI) from 0 to 10, calculated
separately for morning, afternoon, evening and night. A market that is fine at
noon is a different place at midnight, and the map shows that.

**Go backend · React frontend · MongoDB**

## What makes the score trustworthy

Three ideas stop it from being a plain average that one person could skew:

- **Weighted by reliability.** Every contributor carries a Trust Reliability
  Score between 0.1 and 0.98, earned by how often they agree with everyone
  else. Ratings are averaged in proportion to it.
- **Quorum before publication.** Below three ratings a place stays `unrated`
  rather than showing a number one person decided.
- **Weights learned from data.** The 30/30/20/20 split started as a guess. A
  survey asks for the same four factors *plus* an overall gut-feel score, and
  ordinary least squares regression works out which factors actually predict
  how safe a place feels.

You never need an account to contribute. First contact with the API mints an
anonymous token, and only a SHA-256 hash of it is ever stored.

## Running it

You need [Go](https://go.dev/dl/) 1.26+, [Node](https://nodejs.org) 18+, and a
MongoDB database (local, or a free [Atlas](https://cloud.mongodb.com) cluster).

```bash
cp .env.example .env     # then set MONGODB_URI and VITE_MAPBOX_TOKEN
npm install

npm run seed             # optional: 34 real Bengaluru locations + demo ratings
npm run dev              # starts the Go API on :5000 and the frontend on :3000
```

Open <http://localhost:3000>.

| Command | What it does |
| --- | --- |
| `npm run dev` | API and frontend together |
| `npm run dev:api` | Go API only |
| `npm run dev:web` | Frontend only |
| `npm run seed` | Load demo data (**deletes** existing Bengaluru data first) |
| `npm run test:api` | Go test suite |
| `npm run build` | Production frontend build |

## Layout

```
backend/     Go API — see backend/README.md for a full tour
frontend/    React + Vite + Mapbox
```

The backend is deliberately written to be read: standard-library HTTP routing,
and hand-written JWT, rate limiting, `.env` parsing and regression maths rather
than a dependency for each. Its only two external packages are the official
MongoDB driver and bcrypt.

**[→ backend/README.md](backend/README.md)** explains the package layout, how
the scoring engine works, and every endpoint.

## Credits

Built as a collaborative project. The React frontend is largely the work of
[Shambhavi Singh](https://github.com/shambhavi106); this repository is my Go
rewrite of the backend, which originally ran on Express and Mongoose.
