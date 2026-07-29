const GRADE_ORDER = ["D", "C", "C+", "B-", "B", "B+", "A-", "A", "A+", "S"];

const GRADE_MEANINGS = {
  S: "Elite / championship-level coach",
  "A+": "Top coach / finals contender",
  A: "Very strong coach",
  "A-": "Good competitive coach",
  "B+": "Solid coach",
  B: "Average coach",
  "B-": "Developing coach",
  "C+": "Needs improvement",
  C: "Struggling coach",
  D: "Poor results",
  "Not Rated": "Not enough rating information",
};

export const COACH_GRADE_SCALE = [
  { grade: "S", meaning: GRADE_MEANINGS.S },
  { grade: "A+", meaning: GRADE_MEANINGS["A+"] },
  { grade: "A", meaning: GRADE_MEANINGS.A },
  { grade: "A-", meaning: GRADE_MEANINGS["A-"] },
  { grade: "B+", meaning: GRADE_MEANINGS["B+"] },
  { grade: "B", meaning: GRADE_MEANINGS.B },
  { grade: "B-", meaning: GRADE_MEANINGS["B-"] },
  { grade: "C+", meaning: GRADE_MEANINGS["C+"] },
  { grade: "C", meaning: GRADE_MEANINGS.C },
  { grade: "D", meaning: GRADE_MEANINGS.D },
];

function ratingFor(coach, ratings = {}) {
  return ratings?.coaches?.[coach?.id] || ratings?.[coach?.id] || null;
}

export function coachGradeValue(grade = "Not Rated") {
  const index = GRADE_ORDER.indexOf(grade);
  return index >= 0 ? index + 1 : 0;
}

export function coachGradeMeaning(grade = "Not Rated") {
  return GRADE_MEANINGS[grade] || GRADE_MEANINGS["Not Rated"];
}

export function decorateCoachGrade(coach = {}, ratings = {}) {
  const rating = ratingFor(coach, ratings);
  const overallGrade = rating?.overallGrade || "Not Rated";
  const categories = rating?.categories || {};
  return {
    ...coach,
    overallGrade,
    gradeValue: coachGradeValue(overallGrade),
    gradeMeaning: coachGradeMeaning(overallGrade),
    tacticalStyle: rating?.tacticalStyle || "Not Rated",
    strength: rating?.strength || "Not Rated",
    weakness: rating?.weakness || "Not Rated",
    experienceLabel: rating?.experience || (coach.seasons ? `${coach.seasons} season${coach.seasons === 1 ? "" : "s"} listed` : "Not Rated"),
    categoryGrades: {
      tactics: categories.tactics || "Not Rated",
      playerDevelopment: categories.playerDevelopment || "Not Rated",
      motivation: categories.motivation || "Not Rated",
      playoffPerformance: categories.playoffPerformance || "Not Rated",
      experience: categories.experience || "Not Rated",
    },
    ratingAchievements: Array.isArray(rating?.achievements) ? rating.achievements : [],
  };
}
