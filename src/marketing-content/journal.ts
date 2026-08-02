export const journalCopy = {
  h2: "Your trades, written down where they can't be edited later.",
  sub: "Every entry is timestamped when you log it. Past you doesn't get to rewrite the story.",
  pattern:
    'You\'re down 62% of the time on trades tagged "revenge". They\'re 4% of your volume and 31% of your losses.',
  entries: [
    {
      date: "2026-03-12 09:41",
      instrument: "NQ",
      pnl: "+2.4R",
      positive: true,
      tags: ["ORB", "A+"],
      note: "Waited for the reclaim. Size felt right.",
      rotate: "-1.5deg",
    },
    {
      date: "2026-03-11 14:08",
      instrument: "ES",
      pnl: "-1.0R",
      positive: false,
      tags: ["revenge", "late"],
      note: "Chased after the first stop. Knew better.",
      rotate: "0.5deg",
    },
    {
      date: "2026-03-10 10:22",
      instrument: "CL",
      pnl: "+1.1R",
      positive: true,
      tags: ["pullback", "session-open"],
      note: "Textbook retest. Journaled before exit.",
      rotate: "-0.5deg",
    },
  ],
} as const;
