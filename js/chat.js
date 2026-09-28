// Optional text/chat layer.
//
// This is the flexible, low-frequency path from the brief: things like
// "swap this exercise, my knee's bugging me" or "make me a routine" that
// don't fit the structured logging UI. It is NOT wired to a live Claude API
// call yet — calling the Claude API directly from a browser would expose
// an API key to anyone who opens dev tools, so that needs a small backend
// proxy in front of it before CLAUDE_API_ENDPOINT is filled in.
//
// TODO (before wiring the real API): stand up a minimal proxy endpoint
// (e.g. a Cloudflare Worker / small serverless function) that holds the
// API key server-side, accepts { text, historySummary }, and forwards to
// the Claude API. Point CLAUDE_API_ENDPOINT at it.
const CLAUDE_API_ENDPOINT = null;

const HISTORY_SUMMARY_MAX_SESSIONS = 8;
const HISTORY_SUMMARY_MAX_DAYS = 28;

// Condenses local history into a compact, prompt-ready string instead of
// sending the entire all-time log. This is the "history summarizer" the
// brief calls out as a build task — Claude has no memory between API
// calls, so this snapshot has to carry everything relevant each time.
function summarizeHistoryForPrompt() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - HISTORY_SUMMARY_MAX_DAYS);

  const recent = Store.getHistory()
    .filter((s) => new Date(s.date) >= cutoff)
    .slice(-HISTORY_SUMMARY_MAX_SESSIONS);

  if (!recent.length) return "No workouts logged in the last 4 weeks.";

  return recent
    .map((session) => {
      const d = new Date(session.date).toISOString().slice(0, 10);
      const lines = session.exercises.map((ex) => {
        const best = ex.sets.reduce(
          (m, s) => (s.weight > m.weight ? s : m),
          ex.sets[0]
        );
        return `${ex.name} ${ex.sets.length}x${best.reps}@${best.weight}lb`;
      });
      return `${d}: ${lines.join(", ")}`;
    })
    .join("\n");
}

// A handful of commands are handled locally so the common case ("log 3x10
// at 135") works instantly and offline without a round trip at all. Anything
// else falls through to the (not-yet-configured) Claude API.
function tryLocalParse(text, activeExercise) {
  const m = text.match(/log\s+(\d+)\s*x\s*(\d+)\s*(?:at|@)\s*(\d+(?:\.\d+)?)/i);
  if (m && activeExercise) {
    const [, sets, reps, weight] = m;
    return {
      handled: true,
      action: "log",
      exercise: activeExercise,
      sets: Number(sets),
      reps: Number(reps),
      weight: Number(weight),
      reply: `Logged ${sets}x${reps} at ${weight} lb for ${activeExercise}.`,
    };
  }
  return { handled: false };
}

async function parseWithClaude(text, activeExercise) {
  const local = tryLocalParse(text, activeExercise);
  if (local.handled) return local;

  if (!CLAUDE_API_ENDPOINT) {
    return {
      handled: false,
      action: "unavailable",
      reply:
        "Free-form parsing needs a backend proxy in front of the Claude API " +
        "(see the TODO in js/chat.js) — not wired up yet. Try \"log 3x10 at 135\" " +
        "style commands, or use the routine screen directly.",
    };
  }

  const historySummary = summarizeHistoryForPrompt();
  const res = await fetch(CLAUDE_API_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, historySummary, activeExercise }),
  });
  if (!res.ok) throw new Error(`Claude proxy error: ${res.status}`);
  return res.json();
}
