// Package mathx holds the few numeric helpers the rest of the app reuses.
//
// Go's standard "math" package has no "round to 2 decimal places", and we
// need that in several places, so it lives here rather than being copied.
package mathx

import "math"

// Round1 rounds to one decimal place: 7.8333 -> 7.8
func Round1(value float64) float64 {
	return math.Round(value*10) / 10
}

// Round2 rounds to two decimal places: 0.8333 -> 0.83
func Round2(value float64) float64 {
	return math.Round(value*100) / 100
}

// Round3 rounds to three decimal places, used for the R² goodness-of-fit.
func Round3(value float64) float64 {
	return math.Round(value*1000) / 1000
}

// Clamp keeps a value inside [low, high].
func Clamp(value, low, high float64) float64 {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

// ClampInt is Clamp for whole numbers.
func ClampInt(value, low, high int) int {
	if value < low {
		return low
	}
	if value > high {
		return high
	}
	return value
}

// Ptr wraps a value in a pointer.
//
// Needed because Go will not let you write &7.8 directly, and our
// "this can be null" fields are pointers. Ptr(7.8) does the job.
func Ptr[T any](value T) *T {
	return &value
}
