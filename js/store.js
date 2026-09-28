// Cloud-backed data store — the single source of truth for workout history.
//
// Everything lives in the Supabase project "Brandons Gym App" (see cloud.js);
// nothing is kept only on the phone. The rest of the app reads history
// synchronously through getHistory() / getLastForExercise() / etc., which
// serve an in-memory copy loaded once at startup by init(). Every write goes
// to the database.
//
// In-progress workouts are saved set-by-set as you log them (best effort,
// retried in the background). Finishing a workout does a full, idempotent
// reconcile of everything on screen, so the finished history is always
// complete even if an earlier background save failed.
//
// Weights are in lbs. For assisted machines the weight is the assistance
// (weightMeaning "assistance"), so a lower number is progress.

const LEGACY_KEY = "liftTracker.history.v1"; // old on-phone storage, migrated once after first sign-in

const SESSION_SELECT =
  "id, client_id, started_at, ended_at, status, notes, cardio, " +
  "session_exercises(id, position, exercise_name, muscle_group, equipment, weight_meaning, target_reps, note, " +
  "sets(set_number, weight, reps, target_reps))";

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function exerciseMeta(name) {
  return EXERCISE_DB.find((e) => e.name === name) || null;
}

const Store = {
  _history: [], // completed sessions, oldest first
  _active: null, // the in-progress workout, if any
  _queue: Promise.resolve(),
  _pending: 0,
  _failedOps: [],
  onStatus: null, // callback("saving" | "saved" | "error")

  // ---------- background save queue ----------

  _emit() {
    if (!this.onStatus) return;
    this.onStatus(this._failedOps.length ? "error" : this._pending > 0 ? "saving" : "saved");
  },

  // Runs fn after everything queued before it, retrying with backoff. With
  // track=true a permanent failure is remembered so retryFailed() can redo it.
  _enqueue(fn, track = true) {
    this._pending++;
    this._emit();
    const run = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
        }
      }
    };
    const p = this._queue.then(run);
    this._queue = p.catch(() => {});
    p.then(
      () => {
        this._pending--;
        this._emit();
      },
      (e) => {
        this._pending--;
        if (track) this._failedOps.push(fn);
        console.error("Save failed", e);
        this._emit();
      }
    );
    return p;
  },

  retryFailed() {
    const ops = this._failedOps;
    this._failedOps = [];
    ops.forEach((fn) => this._enqueue(fn));
    this._emit();
  },

  // ---------- loading ----------

  async init() {
    const { data, error } = await Cloud.client
      .from("workout_sessions")
      .select(SESSION_SELECT)
      .order("started_at", { ascending: true });
    if (error) throw error;
    this._history = [];
    this._active = null;
    for (const row of data) {
      if (row.status === "completed") {
        const s = this._toAppSession(row);
        if (s.exercises.length) this._history.push(s);
      } else {
        this._active = this._toActive(row); // newest in-progress workout wins
      }
    }
  },

  _sortedExercises(row) {
    return (row.session_exercises || []).slice().sort((a, b) => a.position - b.position);
  },

  _toAppSession(row) {
    return {
      id: row.id,
      date: row.started_at,
      notes: row.notes,
      cardio: row.cardio,
      exercises: this._sortedExercises(row)
        .map((e) => ({
          name: e.exercise_name,
          muscleGroup: e.muscle_group,
          equipment: e.equipment,
          weightMeaning: e.weight_meaning,
          targetReps: e.target_reps,
          note: e.note,
          sets: (e.sets || [])
            .slice()
            .sort((a, b) => a.set_number - b.set_number)
            .map((s) => {
              const o = { reps: s.reps };
              if (s.weight !== null && s.weight !== undefined) o.weight = Number(s.weight);
              return o;
            }),
        }))
        .filter((e) => e.sets.length),
    };
  },

  _toActive(row) {
    return {
      id: row.id,
      clientId: row.client_id,
      startedAt: row.started_at,
      exercises: this._sortedExercises(row).map((e) => ({
        id: e.id,
        position: e.position,
        name: e.exercise_name,
        muscleGroup: e.muscle_group,
        equipment: e.equipment,
        weightMeaning: e.weight_meaning,
        targetReps: e.target_reps,
        sets: (e.sets || []).map((s) => ({
          setNumber: s.set_number,
          weight: s.weight === null || s.weight === undefined ? null : Number(s.weight),
          reps: s.reps,
        })),
      })),
    };
  },

  // ---------- reads used by routine / progression / chat ----------

  // All completed sessions, oldest first.
  getHistory() {
    return this._history;
  },

  // Most recent logged instance of a given exercise, or null.
  getLastForExercise(name) {
    for (let i = this._history.length - 1; i >= 0; i--) {
      const entry = this._history[i].exercises.find((e) => e.name === name);
      if (entry) return { date: this._history[i].date, ...entry };
    }
    return null;
  },

  // Map of muscleGroup -> { lastDate, daysSince } based on any exercise
  // logged in that group. Groups never trained are absent.
  getMuscleGroupRecency() {
    const recency = {};
    for (const session of this._history) {
      for (const ex of session.exercises) {
        const prev = recency[ex.muscleGroup];
        if (!prev || new Date(session.date) > new Date(prev.lastDate)) {
          recency[ex.muscleGroup] = { lastDate: session.date };
        }
      }
    }
    const now = new Date();
    for (const key of Object.keys(recency)) {
      recency[key].daysSince = Math.floor((now - new Date(recency[key].lastDate)) / (1000 * 60 * 60 * 24));
    }
    return recency;
  },

  // ---------- in-progress workout ----------

  getActive() {
    return this._active;
  },

  _activeExercise(ex, position) {
    const meta = exerciseMeta(ex.name);
    return {
      id: newId(),
      position,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment || null,
      weightMeaning: (meta && meta.weightMeaning) || ex.weightMeaning || "load",
      targetReps: suggestNext(ex).targetReps,
      sets: [],
    };
  },

  _exRow(a, e) {
    return {
      id: e.id,
      session_id: a.id,
      position: e.position,
      exercise_name: e.name,
      muscle_group: e.muscleGroup,
      equipment: e.equipment || null,
      weight_meaning: e.weightMeaning || "load",
      target_reps: e.targetReps ?? null,
    };
  },

  async _upsertSessionAndExercises(a, status, extra = {}) {
    let r = await Cloud.client
      .from("workout_sessions")
      .upsert({ id: a.id, client_id: a.clientId, started_at: a.startedAt, status, ...extra }, { onConflict: "id" });
    if (r.error) throw r.error;
    if (a.exercises.length) {
      r = await Cloud.client
        .from("session_exercises")
        .upsert(a.exercises.map((e) => this._exRow(a, e)), { onConflict: "id" });
      if (r.error) throw r.error;
    }
  },

  // Starts saving a new workout for the given routine (array of EXERCISE_DB entries).
  beginSession(exercises) {
    const a = {
      id: newId(),
      clientId: `s_${Date.now()}`,
      startedAt: new Date().toISOString(),
      exercises: exercises.map((ex, i) => this._activeExercise(ex, i)),
    };
    this._active = a;
    this._enqueue(() => this._upsertSessionAndExercises(a, "in_progress"));
  },

  // values = { weight?, reps } to record the set, or null to clear it.
  saveSet(name, setNumber, values) {
    const a = this._active;
    const e = a && a.exercises.find((x) => x.name === name);
    if (!e) return;
    this._enqueue(async () => {
      if (values) {
        const { error } = await Cloud.client.from("sets").upsert(
          {
            session_exercise_id: e.id,
            set_number: setNumber,
            weight: values.weight ?? null,
            reps: values.reps,
            target_reps: e.targetReps ?? null,
            logged_at: new Date().toISOString(),
          },
          { onConflict: "session_exercise_id,set_number" }
        );
        if (error) throw error;
      } else {
        const { error } = await Cloud.client
          .from("sets")
          .delete()
          .eq("session_exercise_id", e.id)
          .eq("set_number", setNumber);
        if (error) throw error;
      }
    });
  },

  replaceExercise(oldName, newExercise) {
    const a = this._active;
    if (!a) return;
    const idx = a.exercises.findIndex((x) => x.name === oldName);
    if (idx === -1) return;
    const old = a.exercises[idx];
    const fresh = this._activeExercise(newExercise, old.position);
    a.exercises[idx] = fresh;
    this._enqueue(async () => {
      let r = await Cloud.client.from("session_exercises").delete().eq("id", old.id);
      if (r.error) throw r.error;
      r = await Cloud.client.from("session_exercises").upsert(this._exRow(a, fresh), { onConflict: "id" });
      if (r.error) throw r.error;
    });
  },

  // rows = what is on screen: [{ name, muscleGroup, targetReps, sets: [{ setNumber, weight?, reps }] }].
  // Rejects (and leaves the workout active) if it could not be fully saved.
  async finishSession(rows) {
    const a = this._active;
    if (!a) throw new Error("No workout in progress.");
    const byName = new Map(rows.map((r) => [r.name, r]));
    a.exercises.forEach((e) => {
      const r = byName.get(e.name);
      if (r) e.targetReps = r.targetReps;
    });
    const endedAt = new Date().toISOString();

    await this._enqueue(async () => {
      // Make sure the session and exercise rows exist, then reconcile every set.
      await this._upsertSessionAndExercises(a, "in_progress");
      for (const e of a.exercises) {
        const r = byName.get(e.name);
        const sets = r ? r.sets : [];
        if (!sets.length) {
          const del = await Cloud.client.from("session_exercises").delete().eq("id", e.id);
          if (del.error) throw del.error;
          continue;
        }
        const keep = sets.map((s) => s.setNumber).join(",");
        const del = await Cloud.client
          .from("sets")
          .delete()
          .eq("session_exercise_id", e.id)
          .not("set_number", "in", `(${keep})`);
        if (del.error) throw del.error;
        const up = await Cloud.client.from("sets").upsert(
          sets.map((s) => ({
            session_exercise_id: e.id,
            set_number: s.setNumber,
            weight: s.weight ?? null,
            reps: s.reps,
            target_reps: e.targetReps ?? null,
          })),
          { onConflict: "session_exercise_id,set_number" }
        );
        if (up.error) throw up.error;
      }
      const fin = await Cloud.client
        .from("workout_sessions")
        .update({ status: "completed", ended_at: endedAt })
        .eq("id", a.id);
      if (fin.error) throw fin.error;
    }, false);

    const session = {
      id: a.id,
      date: a.startedAt,
      notes: null,
      cardio: null,
      exercises: rows
        .filter((r) => r.sets.length)
        .map((r) => {
          const meta = exerciseMeta(r.name);
          return {
            name: r.name,
            muscleGroup: r.muscleGroup,
            equipment: (meta && meta.equipment) || null,
            weightMeaning: (meta && meta.weightMeaning) || "load",
            targetReps: r.targetReps,
            sets: r.sets.map((s) => {
              const o = { reps: s.reps };
              if (s.weight !== undefined) o.weight = s.weight;
              return o;
            }),
          };
        }),
    };
    this._history.push(session);
    this._history.sort((x, y) => new Date(x.date) - new Date(y.date));
    this._active = null;
    this._failedOps = []; // the reconcile above supersedes any earlier failed saves
    this._emit();
    return session;
  },

  discardSession() {
    const a = this._active;
    if (!a) return;
    this._active = null;
    this._enqueue(async () => {
      const { error } = await Cloud.client.from("workout_sessions").delete().eq("id", a.id);
      if (error) throw error;
    });
  },

  async deleteSession(id) {
    const { error } = await Cloud.client.from("workout_sessions").delete().eq("id", id);
    if (error) throw error;
    this._history = this._history.filter((s) => s.id !== id);
  },

  // ---------- one-time move of the old on-phone history into the cloud ----------

  // Returns how many sessions were moved. Safe to run repeatedly: each old
  // session is keyed by its old id, so nothing is ever imported twice, and the
  // old copy is kept under a backup key rather than deleted.
  async migrateLegacy() {
    let legacy;
    try {
      legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    } catch (e) {
      return 0;
    }
    if (!Array.isArray(legacy) || !legacy.length) return 0;

    let moved = 0;
    for (const s of legacy) {
      const { data, error } = await Cloud.client
        .from("workout_sessions")
        .upsert(
          {
            client_id: String(s.id),
            started_at: s.date,
            ended_at: s.date,
            status: "completed",
            notes: s.notes || null,
            cardio: s.cardio || null,
          },
          { onConflict: "user_id,client_id", ignoreDuplicates: true }
        )
        .select("id");
      if (error) throw error;
      if (!data || !data.length) continue; // already imported earlier
      try {
        await this._writeLegacyExercises(data[0].id, s.exercises || []);
        moved++;
      } catch (e) {
        await Cloud.client.from("workout_sessions").delete().eq("id", data[0].id); // don't leave a half-import
        throw e;
      }
    }
    try {
      localStorage.setItem(LEGACY_KEY + ".migrated", localStorage.getItem(LEGACY_KEY));
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {
      /* storage unavailable — harmless, imports are idempotent */
    }
    return moved;
  },

  async _writeLegacyExercises(sessionId, exercises) {
    const usable = exercises.filter((e) => e.sets && e.sets.length);
    if (!usable.length) return;
    const exRows = usable.map((e, i) => {
      const meta = exerciseMeta(e.name);
      return {
        id: newId(),
        session_id: sessionId,
        position: i,
        exercise_name: e.name,
        muscle_group: e.muscleGroup || (meta && meta.muscleGroup) || "other",
        equipment: e.equipment || (meta && meta.equipment) || null,
        weight_meaning: (meta && meta.weightMeaning) || e.weightMeaning || "load",
        target_reps: e.targetReps ?? null,
        note: e.note || null,
      };
    });
    let r = await Cloud.client.from("session_exercises").insert(exRows);
    if (r.error) throw r.error;
    const setRows = [];
    usable.forEach((e, i) => {
      e.sets.forEach((s, j) => {
        setRows.push({
          session_exercise_id: exRows[i].id,
          set_number: j + 1,
          weight: s.weight ?? null,
          reps: s.reps,
          target_reps: s.targetReps ?? e.targetReps ?? null,
        });
      });
    });
    r = await Cloud.client.from("sets").insert(setRows);
    if (r.error) throw r.error;
  },
};
