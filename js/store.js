// Local data store — the single source of truth for workout history.
// Everything lives in localStorage; no server, no login. This is what the
// history summarizer (chat.js) will read from before any future Claude API
// call, and what routine.js / progression.js read to make decisions.

const STORE_KEY = "liftTracker.history.v1";

const Store = {
  // Returns all sessions, oldest first.
  getHistory() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to read history, resetting.", e);
      return [];
    }
  },

  _write(history) {
    localStorage.setItem(STORE_KEY, JSON.stringify(history));
  },

  // session = { id, date (ISO string), exercises: [{ name, muscleGroup, sets: [{weight, reps, targetReps}] }] }
  saveSession(session) {
    const history = this.getHistory();
    history.push(session);
    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    this._write(history);
    return session;
  },

  deleteSession(id) {
    const history = this.getHistory().filter((s) => s.id !== id);
    this._write(history);
  },

  // Most recent logged instance of a given exercise, or null.
  getLastForExercise(name) {
    const history = this.getHistory();
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i].exercises.find((e) => e.name === name);
      if (entry) return { date: history[i].date, ...entry };
    }
    return null;
  },

  // Map of muscleGroup -> { lastDate, daysSince } based on any exercise
  // logged in that group. daysSince is null if the group has never been trained.
  getMuscleGroupRecency() {
    const history = this.getHistory();
    const recency = {};
    for (const session of history) {
      for (const ex of session.exercises) {
        const prev = recency[ex.muscleGroup];
        if (!prev || new Date(session.date) > new Date(prev.lastDate)) {
          recency[ex.muscleGroup] = { lastDate: session.date };
        }
      }
    }
    const now = new Date();
    for (const key of Object.keys(recency)) {
      const last = new Date(recency[key].lastDate);
      recency[key].daysSince = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    }
    return recency;
  },

  clearAll() {
    localStorage.removeItem(STORE_KEY);
  },
};
