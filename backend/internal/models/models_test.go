package models

// Tests for the pure scoring logic — no database needed.
//
// Run them with:    go test ./...
// Or see each one:  go test -v ./internal/models
//
// Go finds tests by filename (_test.go) and function name (TestXxx).
// There is no test framework to install.

import (
	"testing"

	"shetrust/backend/internal/mathx"
)

func TestComputeRawSTI(t *testing.T) {
	cases := []struct {
		name                              string
		lighting, crowd, police, incident int
		want                              float64
	}{
		// 0.30(10) + 0.30(10) + 0.20(10) + 0.20(10-0) = 3+3+2+2
		{"perfect everything", 10, 10, 10, 0, 10},

		// 0.30(1) + 0.30(1) + 0.20(1) + 0.20(10-10) = 0.3+0.3+0.2+0
		{"worst everything", 1, 1, 1, 10, 0.8},

		// 0.30(5) + 0.30(5) + 0.20(5) + 0.20(10-5) = 1.5+1.5+1+1
		{"middle of the road", 5, 5, 5, 5, 5},

		// 0.30(3) + 0.30(2) + 0.20(2) + 0.20(10-7) = 0.9+0.6+0.4+0.6
		{"dark and empty at night", 3, 2, 2, 7, 2.5},

		// Incidents are inverted: more incidents must lower the score.
		{"good factors, many incidents", 9, 9, 9, 10, 7.2},
		{"good factors, no incidents", 9, 9, 9, 0, 9.2},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ComputeRawSTI(c.lighting, c.crowd, c.police, c.incident)
			if got != c.want {
				t.Errorf("ComputeRawSTI(%d,%d,%d,%d) = %v, want %v",
					c.lighting, c.crowd, c.police, c.incident, got, c.want)
			}
		})
	}
}

func TestCategorize(t *testing.T) {
	cases := []struct {
		sti  float64
		want string
	}{
		{10, "safe"},
		{8, "safe"}, // boundary: 8 and above is safe
		{7.9, "moderate"},
		{5, "moderate"}, // boundary: 5 and above is moderate
		{4.9, "risky"},
		{0, "risky"},
	}

	for _, c := range cases {
		if got := Categorize(c.sti); got != c.want {
			t.Errorf("Categorize(%v) = %q, want %q", c.sti, got, c.want)
		}
	}
}

func TestRecomputeTRS(t *testing.T) {
	t.Run("too few ratings stays neutral", func(t *testing.T) {
		// Even someone who matched consensus every time needs 3 ratings
		// before we are willing to judge them.
		trust := UserTrust{TotalRatings: 2, ConsensusMatches: 2}
		trust.RecomputeTRS()

		if trust.TRS != 0.5 {
			t.Errorf("TRS = %v, want 0.5 for fewer than 3 ratings", trust.TRS)
		}
	})

	t.Run("perfect agreement is capped below 1", func(t *testing.T) {
		trust := UserTrust{TotalRatings: 10, ConsensusMatches: 10}
		trust.RecomputeTRS()

		if trust.TRS != 0.98 {
			t.Errorf("TRS = %v, want 0.98 (the cap)", trust.TRS)
		}
		if trust.IsFlagged {
			t.Error("a perfectly agreeable rater should not be flagged")
		}
	})

	t.Run("constant outlier is floored and flagged", func(t *testing.T) {
		trust := UserTrust{TotalRatings: 10, ConsensusMatches: 0}
		trust.RecomputeTRS()

		if trust.TRS != 0.1 {
			t.Errorf("TRS = %v, want 0.1 (the floor)", trust.TRS)
		}
		if !trust.IsFlagged {
			t.Error("a constant outlier with 10 ratings should be flagged")
		}
	})

	t.Run("half agreement is not flagged", func(t *testing.T) {
		trust := UserTrust{TotalRatings: 10, ConsensusMatches: 5}
		trust.RecomputeTRS()

		if trust.TRS != 0.5 {
			t.Errorf("TRS = %v, want 0.5", trust.TRS)
		}
		if trust.IsFlagged {
			t.Error("50% agreement is disagreement, not abuse — should not flag")
		}
	})
}

func TestRecomputeOverall(t *testing.T) {
	t.Run("averages only the rated slots", func(t *testing.T) {
		location := Location{TimeSlots: []TimeSlotSTI{
			{Slot: "morning", STI: mathx.Ptr(8.0)},
			{Slot: "afternoon", STI: mathx.Ptr(9.0)},
			{Slot: "evening", STI: mathx.Ptr(7.0)},
			{Slot: "night", STI: nil}, // unrated, must not count as zero
		}}
		location.RecomputeOverall()

		if location.OverallSTI == nil || *location.OverallSTI != 8.0 {
			t.Errorf("overall = %v, want 8.0 (average of 8, 9, 7)", location.OverallSTI)
		}
	})

	t.Run("no rated slots means no score", func(t *testing.T) {
		location := Location{TimeSlots: NewTimeSlots()}
		location.RecomputeOverall()

		if location.OverallSTI != nil {
			t.Errorf("overall = %v, want nil for a completely unrated place", *location.OverallSTI)
		}
	})
}

func TestSlotIndex(t *testing.T) {
	location := Location{TimeSlots: NewTimeSlots()}

	if got := location.SlotIndex("evening"); got != 2 {
		t.Errorf("SlotIndex(evening) = %d, want 2", got)
	}
	if got := location.SlotIndex("teatime"); got != -1 {
		t.Errorf("SlotIndex(teatime) = %d, want -1 for an unknown slot", got)
	}
}

func TestFilterTags(t *testing.T) {
	t.Run("unknown tags are dropped", func(t *testing.T) {
		got := FilterTags([]string{"well_lit", "not_a_real_tag", "deserted"})

		want := []string{"well_lit", "deserted"}
		if len(got) != len(want) {
			t.Fatalf("got %v, want %v", got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Errorf("got %v, want %v", got, want)
			}
		}
	})

	t.Run("capped at seven", func(t *testing.T) {
		many := []string{
			"well_lit", "poorly_lit", "crowded", "deserted", "police_present",
			"no_security", "felt_safe", "felt_unsafe", "good_network",
		}
		if got := FilterTags(many); len(got) != 7 {
			t.Errorf("kept %d tags, want 7", len(got))
		}
	})

	t.Run("nil input gives an empty slice, not nil", func(t *testing.T) {
		// An empty slice encodes as [] in JSON; nil encodes as null.
		if got := FilterTags(nil); got == nil {
			t.Error("FilterTags(nil) returned nil, want an empty slice")
		}
	})
}

func TestIsValidTimeSlot(t *testing.T) {
	for _, slot := range TimeSlots {
		if !IsValidTimeSlot(slot) {
			t.Errorf("IsValidTimeSlot(%q) = false, want true", slot)
		}
	}
	for _, slot := range []string{"", "Morning", "midnight", "teatime"} {
		if IsValidTimeSlot(slot) {
			t.Errorf("IsValidTimeSlot(%q) = true, want false", slot)
		}
	}
}
