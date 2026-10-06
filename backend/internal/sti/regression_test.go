package sti

import (
	"math"
	"testing"
)

func TestMatrixInverse(t *testing.T) {
	t.Run("inverting a matrix then multiplying gives the identity", func(t *testing.T) {
		matrix := [][]float64{
			{4, 7, 2},
			{3, 6, 1},
			{2, 5, 3},
		}

		inverse := invertMatrix(matrix)
		if inverse == nil {
			t.Fatal("this matrix is invertible, but invertMatrix returned nil")
		}

		product := matMul(matrix, inverse)
		for i := range product {
			for j := range product[i] {
				want := 0.0
				if i == j {
					want = 1.0
				}
				if math.Abs(product[i][j]-want) > 1e-9 {
					t.Errorf("product[%d][%d] = %v, want %v", i, j, product[i][j], want)
				}
			}
		}
	})

	t.Run("a singular matrix returns nil", func(t *testing.T) {
		// The second row is exactly twice the first, so there is no inverse.
		singular := [][]float64{
			{1, 2},
			{2, 4},
		}

		if invertMatrix(singular) != nil {
			t.Error("a singular matrix should return nil, not a wrong answer")
		}
	})
}

func TestTranspose(t *testing.T) {
	got := transpose([][]float64{
		{1, 2, 3},
		{4, 5, 6},
	})

	want := [][]float64{
		{1, 4},
		{2, 5},
		{3, 6},
	}

	if len(got) != len(want) {
		t.Fatalf("got %d rows, want %d", len(got), len(want))
	}
	for i := range want {
		for j := range want[i] {
			if got[i][j] != want[i][j] {
				t.Errorf("transposed[%d][%d] = %v, want %v", i, j, got[i][j], want[i][j])
			}
		}
	}
}

func TestNormaliseWeights(t *testing.T) {
	t.Run("weights are made positive and sum to one", func(t *testing.T) {
		// A negative coefficient is normal in raw regression output.
		normalised := normaliseWeights([]float64{2, 1, -1, 1})

		total := 0.0
		for _, weight := range normalised {
			if weight < 0 {
				t.Errorf("weight %v is negative after normalising", weight)
			}
			total += weight
		}

		if math.Abs(total-1.0) > 1e-9 {
			t.Errorf("weights sum to %v, want exactly 1.0", total)
		}
	})

	t.Run("all-zero coefficients fall back to an even split", func(t *testing.T) {
		for _, weight := range normaliseWeights([]float64{0, 0, 0, 0}) {
			if weight != 0.25 {
				t.Errorf("weight = %v, want an even 0.25 split", weight)
			}
		}
	})
}

func TestComputeR2(t *testing.T) {
	t.Run("a perfect fit scores 1.0", func(t *testing.T) {
		// y is exactly 2*x1 + 3*x2, so coefficients {2,3} explain it fully.
		x := [][]float64{{1, 1}, {2, 1}, {3, 2}, {4, 5}}
		y := [][]float64{{5}, {7}, {12}, {23}}

		if got := computeR2(x, y, []float64{2, 3}); got != 1.0 {
			t.Errorf("R² = %v, want 1.0 for an exact fit", got)
		}
	})

	t.Run("no variation in y gives 0", func(t *testing.T) {
		// Every answer is the same, so there is nothing to explain and we
		// must not divide by zero.
		x := [][]float64{{1}, {2}, {3}}
		y := [][]float64{{5}, {5}, {5}}

		if got := computeR2(x, y, []float64{1}); got != 0 {
			t.Errorf("R² = %v, want 0 when y never varies", got)
		}
	})
}

func TestFallbackResult(t *testing.T) {
	result := fallbackResult(3, "not enough data")

	if !result.Fallback {
		t.Error("Fallback should be true")
	}
	if result.R2 != nil {
		t.Error("R² should be nil when no regression ran")
	}
	if result.Weights.Source != "default" {
		t.Errorf("Source = %q, want %q", result.Weights.Source, "default")
	}

	sum := result.Weights.Lighting + result.Weights.Crowd +
		result.Weights.Police + result.Weights.Incident
	if math.Abs(sum-1.0) > 1e-9 {
		t.Errorf("default weights sum to %v, want 1.0", sum)
	}
}
