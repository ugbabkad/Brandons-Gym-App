// Cloud connection (Supabase project "Brandons Gym App").
//
// The publishable key below is meant to be public — it only identifies the
// project. What actually protects your data is the login plus row-level
// security in the database: every table only lets the signed-in owner read
// or write their own rows.

const SUPABASE_URL = "https://nuggtcqxuzvdsndmrxit.supabase.co";
const SUPABASE_KEY = "sb_publishable_E5BIYCNy0peAw0fmsGCTbQ_V7hj-QSO";

const Cloud = {
  client: null,

  init() {
    this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  },

  async getSession() {
    const { data } = await this.client.auth.getSession();
    return data.session;
  },

  async signIn(email, password) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  // Resolves to null when the project requires the email to be confirmed first.
  async signUp(email, password) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut() {
    await this.client.auth.signOut();
  },
};
