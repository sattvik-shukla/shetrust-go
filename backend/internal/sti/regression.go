// Package sti calculates the Safety Trust Index: the single 0–10 number
// shown on the map for a place at a time of day.
package sti

// Working out how much each safety factor actually matters.
//
// The STI formula weights lighting at 30%, crowd at 30% and so on. Those
// numbers were originally guesses. The survey exists to replace the guesses
// with evidence: it asks people to score four factors AND to give an
// overall gut-feel rating. Given enough of those, we can ask
//
//	"what mix of the four factors best predicts the gut feel?"
//
// That is ordinary least squares (OLS) linear regression, and it has a
// closed-form answer — no iteration, no machine-learning library:
//
//	β = (XᵀX)⁻¹ Xᵀy
//
// where X is the matrix of factor scores (one row per survey), y is the
// column of overall ratings, and β comes out as one weight per factor.
//
// Everything below is just that formula, written out: transpose, multiply,
// invert.

import (
	"fmt"
	"math"

	"go.mongodb.org/mongo-driver/v2/bson"

	"shetrust/backend/internal/database"
	"shetrust/backend/internal/mathx"
	"shetrust/backend/internal/models"
)

// MinSurveysForRegression is how much data we need before the maths means
// anything at all.
const MinSurveysForRegression = 10

// DefaultWeights are used until the survey data says otherwise.
var DefaultWeights = Weights{
	Lighting: 0.30,
	Crowd:    0.30,
	Police:   0.20,
	Incident: 0.20,
}

// Weights are the four multipliers in the STI formula. They add up to 1.0.
type Weights struct {
	Lighting float64 `json:"lighting"`
	Crowd    float64 `json:"crowd"`
	Police   float64 `json:"police"`
	Incident float64 `json:"incident"`

	// Where these came from: "default" or "regression".
	Source string `json:"source"`
}

// RegressionResult is what the /api/survey/weights endpoint reports.
type RegressionResult struct {
	Weights    Weights  `json:"weights"`
	R2         *float64 `json:"r2"` // goodness of fit 0–1; nil when not computed
	SampleSize int      `json:"sampleSize"`
	Fallback   bool     `json:"fallback"`
	Message    string   `json:"message"`
	Formula    string   `json:"formula"`
}

// ─── Matrix helpers ──────────────────────────────────────────────────────
//
// A matrix here is just a slice of rows: [][]float64.

// transpose flips a matrix over its diagonal, turning rows into columns.
func transpose(matrix [][]float64) [][]float64 {
	if len(matrix) == 0 {
		return nil
	}

	rows, cols := len(matrix), len(matrix[0])
	result := make([][]float64, cols)
	for i := range result {
		result[i] = make([]float64, rows)
	}

	for i := 0; i < rows; i++ {
		for j := 0; j < cols; j++ {
			result[j][i] = matrix[i][j]
		}
	}
	return result
}

// matMul multiplies A (m×n) by B (n×p). Each output cell is the dot
// product of a row of A with a column of B.
func matMul(a, b [][]float64) [][]float64 {
	if len(a) == 0 || len(b) == 0 {
		return nil
	}

	m, inner, p := len(a), len(b), len(b[0])
	result := make([][]float64, m)

	for i := 0; i < m; i++ {
		result[i] = make([]float64, p)
		for j := 0; j < p; j++ {
			sum := 0.0
			for k := 0; k < inner; k++ {
				sum += a[i][k] * b[k][j]
			}
			result[i][j] = sum
		}
	}
	return result
}

// invertMatrix inverts a square matrix by Gauss-Jordan elimination.
//
// The trick: glue an identity matrix onto the right to make [M | I], then
// row-reduce the left half down to the identity. Whatever the right half
// has become is M⁻¹.
//
// Returns nil when the matrix is singular — which here means two survey
// factors moved together so closely that the maths cannot separate them.
func invertMatrix(matrix [][]float64) [][]float64 {
	n := len(matrix)

	// Build the augmented matrix [M | I].
	augmented := make([][]float64, n)
	for i := 0; i < n; i++ {
		augmented[i] = make([]float64, 2*n)
		copy(augmented[i], matrix[i])
		augmented[i][n+i] = 1
	}

	for col := 0; col < n; col++ {
		// Partial pivoting: swap in the row with the biggest value in this
		// column. Dividing by a tiny pivot would wreck the precision.
		pivotRow := col
		for row := col + 1; row < n; row++ {
			if math.Abs(augmented[row][col]) > math.Abs(augmented[pivotRow][col]) {
				pivotRow = row
			}
		}
		augmented[col], augmented[pivotRow] = augmented[pivotRow], augmented[col]

		pivot := augmented[col][col]
		if math.Abs(pivot) < 1e-12 {
			return nil // singular: no inverse exists
		}

		// Scale the pivot row so the pivot becomes exactly 1.
		for j := 0; j < 2*n; j++ {
			augmented[col][j] /= pivot
		}

		// Subtract multiples of the pivot row from every other row, so this
		// column becomes zero everywhere except at the pivot.
		for row := 0; row < n; row++ {
			if row == col {
				continue
			}
			factor := augmented[row][col]
			for j := 0; j < 2*n; j++ {
				augmented[row][j] -= factor * augmented[col][j]
			}
		}
	}

	// The right half is now the inverse.
	inverse := make([][]float64, n)
	for i := 0; i < n; i++ {
		inverse[i] = append([]float64(nil), augmented[i][n:]...)
	}
	return inverse
}

// ─── The regression itself ───────────────────────────────────────────────

// ComputeOptimalWeights reads every survey and derives the best-fit weights.
func ComputeOptimalWeights(db *database.DB) RegressionResult {
	ctx, cancel := database.Ctx()
	defer cancel()

	cursor, err := db.Surveys.Find(ctx, bson.M{})
	if err != nil {
		return fallbackResult(0, "Could not read survey data. Using default weights.")
	}
	defer cursor.Close(ctx)

	var surveys []models.Survey
	if err := cursor.All(ctx, &surveys); err != nil {
		return fallbackResult(0, "Could not read survey data. Using default weights.")
	}

	if len(surveys) < MinSurveysForRegression {
		return fallbackResult(len(surveys),
			"Not enough survey data yet (need at least 10). Using default weights.")
	}

	// Build X (the inputs) and y (what we are predicting).
	//
	// Note (10 - incidentFrequency): every other factor is "higher is
	// safer", so we flip incidents to match. Otherwise its weight would
	// come out negative and the normalisation below would be nonsense.
	x := make([][]float64, 0, len(surveys))
	y := make([][]float64, 0, len(surveys))

	for _, s := range surveys {
		x = append(x, []float64{
			float64(s.Lighting),
			float64(s.CrowdDensity),
			float64(s.PublicTransport),
			float64(10 - s.IncidentFrequency),
		})
		y = append(y, []float64{float64(s.OverallRating)})
	}

	// β = (XᵀX)⁻¹ Xᵀy
	xt := transpose(x)
	xtxInverse := invertMatrix(matMul(xt, x))
	if xtxInverse == nil {
		return fallbackResult(len(surveys),
			"Survey factors are too closely correlated to separate. Using default weights.")
	}

	beta := matMul(xtxInverse, matMul(xt, y))

	// beta is a column matrix; pull out the four raw coefficients.
	raw := make([]float64, len(beta))
	for i := range beta {
		raw[i] = beta[i][0]
	}

	normalised := normaliseWeights(raw)
	r2 := computeR2(x, y, raw)

	return RegressionResult{
		Weights: Weights{
			Lighting: normalised[0],
			Crowd:    normalised[1],
			// The survey asks about public transport; it stands in for
			// public infrastructure generally, which is what police
			// visibility measures in the rating form.
			Police:   normalised[2],
			Incident: normalised[3],
			Source:   "regression",
		},
		R2:         &r2,
		SampleSize: len(surveys),
		Fallback:   false,
		Message:    "Weights derived from survey data using OLS regression.",
		Formula:    formatFormula(normalised),
	}
}

// normaliseWeights rescales raw coefficients so they are all positive and
// add up to exactly 1.0 — which is what the STI formula expects.
func normaliseWeights(raw []float64) []float64 {
	total := 0.0
	for _, value := range raw {
		total += math.Abs(value)
	}

	if total == 0 {
		return []float64{0.25, 0.25, 0.25, 0.25}
	}

	normalised := make([]float64, len(raw))
	for i, value := range raw {
		normalised[i] = mathx.Round2(math.Abs(value) / total)
	}

	// Rounding to 2 decimals can leave the total at 0.99 or 1.01. Push the
	// difference onto the first weight so it lands on exactly 1.0.
	sum := 0.0
	for _, value := range normalised {
		sum += value
	}
	normalised[0] = mathx.Round2(normalised[0] + (1 - sum))

	return normalised
}

// computeR2 measures how well the fitted weights explain the data.
//
//	R² = 1 - (unexplained variation / total variation)
//
// 1.0 is a perfect fit; 0 means the model is no better than always
// guessing the average. Below ~0.3 we do not trust it (see weights.go).
func computeR2(x, y [][]float64, coefficients []float64) float64 {
	mean := 0.0
	for _, row := range y {
		mean += row[0]
	}
	mean /= float64(len(y))

	totalVariation, unexplainedVariation := 0.0, 0.0

	for i := range y {
		predicted := 0.0
		for j, value := range x[i] {
			predicted += value * coefficients[j]
		}
		unexplainedVariation += math.Pow(y[i][0]-predicted, 2)
		totalVariation += math.Pow(y[i][0]-mean, 2)
	}

	if totalVariation == 0 {
		return 0
	}
	return mathx.Round3(1 - unexplainedVariation/totalVariation)
}

// fallbackResult is what we return whenever the regression cannot run.
func fallbackResult(sampleSize int, message string) RegressionResult {
	weights := DefaultWeights
	weights.Source = "default"

	return RegressionResult{
		Weights:    weights,
		R2:         nil,
		SampleSize: sampleSize,
		Fallback:   true,
		Message:    message,
		Formula: formatFormula([]float64{
			weights.Lighting, weights.Crowd, weights.Police, weights.Incident,
		}),
	}
}

// formatFormula renders the weights as the readable string the
// How It Works page displays.
func formatFormula(w []float64) string {
	return fmt.Sprintf("STI = %g×Lighting + %g×Crowd + %g×Police + %g×(10 − Incidents)",
		w[0], w[1], w[2], w[3])
}
