export const builtInSkills = [
  {
    name: "Deep Focus",
    description: "Improves long, uninterrupted work sessions.",
    maxLevel: 5,
    prerequisiteName: "Quest Planning",
    prerequisiteLevel: 1
  },
  {
    name: "Quest Planning",
    description: "Improves the habit of breaking large goals into clear quests.",
    maxLevel: 5,
    prerequisiteName: null,
    prerequisiteLevel: 1
  },
  {
    name: "Streak Discipline",
    description: "Improves consistency across daily learning and productivity loops.",
    maxLevel: 5,
    prerequisiteName: "Quest Planning",
    prerequisiteLevel: 2
  },
  {
    name: "Guild Support",
    description: "Improves collaborative progress in guild and team quest work.",
    maxLevel: 5,
    prerequisiteName: "Streak Discipline",
    prerequisiteLevel: 1
  },
  {
    name: "Recovery Rhythm",
    description: "Improves sustainable rest, breaks, and burnout-aware pacing.",
    maxLevel: 5,
    prerequisiteName: "Deep Focus",
    prerequisiteLevel: 2
  }
] as const;
