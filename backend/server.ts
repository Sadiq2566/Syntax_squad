import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import initSqlJs from "sql.js";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "postureai_secret_key_12345";

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || "https://fghppywkyeggkcmenpuv.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_eMTZSjMZOGIH2zRbTMLzCw_vyiLhm1x";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper functions to sync with Supabase tables
async function syncUserToSupabase(userData: any) {
  try {
    const goalsVal = typeof userData.goals === "string" ? userData.goals : JSON.stringify(userData.goals || []);
    const injuriesVal = typeof userData.injuries === "string" ? userData.injuries : JSON.stringify(userData.injuries || []);

    const { data, error } = await supabase.from("users").upsert([
      {
        name: userData.name,
        email: userData.email,
        password: userData.password || "",
        age: userData.age || null,
        fitness_level: userData.fitness_level || userData.fitnessLevel || null,
        goals: goalsVal,
        injuries: injuriesVal,
        created_at: userData.created_at || new Date().toISOString()
      }
    ], { onConflict: "email" });

    if (error) {
      console.warn("Supabase user sync notice:", error.message);
    } else {
      console.log("⚡ User synced to Supabase backend:", userData.email);
    }
  } catch (err: any) {
    console.warn("Supabase user sync exception:", err.message || err);
  }
}

async function syncSessionToSupabase(sessionData: any, userEmail?: string) {
  try {
    let supabaseUserId = sessionData.user_id || sessionData.userId || 1;

    // Look up the actual Supabase user ID by email if provided
    if (userEmail) {
      const { data: userRecord } = await supabase
        .from("users")
        .select("id")
        .eq("email", userEmail)
        .single();
        
      if (userRecord && userRecord.id) {
        supabaseUserId = userRecord.id;
      }
    }

    const repHistVal = typeof sessionData.rep_history === "string" 
      ? sessionData.rep_history 
      : JSON.stringify(sessionData.rep_history || sessionData.repHistory || []);

    const payload = {
      user_id: supabaseUserId,
      exercise: sessionData.exercise || "unknown",
      exercise_name: sessionData.exercise_name || sessionData.exerciseName || sessionData.exercise || "Exercise",
      reps: Number(sessionData.reps) || 0,
      good_reps: Number(sessionData.good_reps ?? sessionData.goodReps) || 0,
      bad_reps: Number(sessionData.bad_reps ?? sessionData.badReps) || 0,
      form_score: Number(sessionData.form_score ?? sessionData.formScore) || 0,
      rep_history: repHistVal,
      duration_secs: Number(sessionData.duration_secs ?? sessionData.durationSecs) || 0,
      plank_hold_secs: Number(sessionData.plank_hold_secs ?? sessionData.plankHoldSecs) || 0,
      created_at: sessionData.created_at || new Date().toISOString()
    };

    const { data, error } = await supabase.from("sessions").insert([payload]);

    if (error) {
      console.warn("Supabase session insert notice:", error.message);
    } else {
      console.log("⚡ Workout exercise details saved to Supabase backend!", sessionData.exercise);
    }
  } catch (err: any) {
    console.warn("Supabase session sync exception:", err.message || err);
  }
}

async function startServer() {

  const SQL = await initSqlJs();
  const DB_FILE = path.join(process.cwd(), "backend", "posture_coach.db");

  let db: any;
  if (fs.existsSync(DB_FILE)) {
    try {
      const filebuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(filebuffer);
    } catch {
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      age INTEGER,
      fitness_level TEXT,
      goals TEXT,
      injuries TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      exercise TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      reps INTEGER DEFAULT 0,
      good_reps INTEGER DEFAULT 0,
      bad_reps INTEGER DEFAULT 0,
      form_score INTEGER DEFAULT 0,
      rep_history TEXT,
      duration_secs INTEGER DEFAULT 0,
      plank_hold_secs INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  function saveDb() {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_FILE, buffer);
    } catch (err) {
      console.error("Failed to save DB:", err);
    }
  }
  saveDb();

  function queryAll(sql: string, params: any[] = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  function queryOne(sql: string, params: any[] = []) {
    const rows = queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  function run(sql: string, params: any[] = []) {
    db.run(sql, params);
    const res = db.exec("SELECT last_insert_rowid() as id");
    const lastId = res.length > 0 && res[0].values.length > 0 ? res[0].values[0][0] : null;
    saveDb();
    return lastId;
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/project_source.zip", (req, res) => {
    const file = path.join(process.cwd(), "project_source.zip");
    if (fs.existsSync(file)) {
      res.download(file);
    } else {
      res.status(404).send("File not found");
    }
  });

  function getAuthUser(req: express.Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split(" ")[1];
    try {
      return jwt.verify(token, JWT_SECRET) as any;
    } catch {
      return null;
    }
  }

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const { name, email, password, age, fitnessLevel, goals, injuries } = req.body || {};
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required." });
      }

      const existing = queryOne("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email]);
      if (existing) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      const createdAt = new Date().toISOString();
      const goalsStr = JSON.stringify(goals || []);
      const injuriesStr = JSON.stringify(injuries || []);

      const userId = run(
        "INSERT INTO users (name, email, password, age, fitness_level, goals, injuries, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [name, email.toLowerCase(), hashedPassword, age || null, fitnessLevel || null, goalsStr, injuriesStr, createdAt]
      );

      const userObj = { id: userId, name, email: email.toLowerCase(), age, fitnessLevel, goals, injuries, password: hashedPassword, created_at: createdAt };
      syncUserToSupabase(userObj);

      const token = jwt.sign({ id: userId, email: userObj.email, name: userObj.name }, JWT_SECRET, { expiresIn: "7d" });

      return res.json({ user: userObj, token });
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ error: err.message || "Server error during registration" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
      }

      const user = queryOne("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email]);
      if (!user) {
        return res.status(400).json({ error: "Incorrect email or password. Please try again." });
      }

      const valid = bcrypt.compareSync(password, user.password);
      if (!valid) {
        return res.status(400).json({ error: "Incorrect email or password. Please try again." });
      }

      let goals = [];
      let injuries = [];
      try { goals = JSON.parse(user.goals || "[]"); } catch {}
      try { injuries = JSON.parse(user.injuries || "[]"); } catch {}

      const userObj = {
        id: user.id,
        name: user.name,
        email: user.email,
        age: user.age,
        fitnessLevel: user.fitness_level,
        goals,
        injuries,
      };

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });

      return res.json({ user: userObj, token });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err.message || "Server error during login" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    const authUser = getAuthUser(req);
    if (!authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = queryOne("SELECT * FROM users WHERE id = ?", [authUser.id]);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let goals = [];
    let injuries = [];
    try { goals = JSON.parse(user.goals || "[]"); } catch {}
    try { injuries = JSON.parse(user.injuries || "[]"); } catch {}

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        age: user.age,
        fitnessLevel: user.fitness_level,
        goals,
        injuries,
      },
    });
  });

  app.post("/api/sessions", (req, res) => {
    try {
      const authUser = getAuthUser(req);
      const userId = authUser ? authUser.id : 1;

      const {
        exercise,
        exerciseName,
        reps = 0,
        goodReps = 0,
        badReps = 0,
        formScore = 0,
        repHistory = [],
        durationSecs = 0,
        plankHoldSecs = 0,
      } = req.body || {};

      const createdAt = new Date().toISOString();
      const repHistoryStr = JSON.stringify(repHistory);

      const sessionId = run(
        `INSERT INTO sessions 
          (user_id, exercise, exercise_name, reps, good_reps, bad_reps, form_score, rep_history, duration_secs, plank_hold_secs, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          exercise || "unknown",
          exerciseName || exercise || "Exercise",
          reps,
          goodReps,
          badReps,
          formScore,
          repHistoryStr,
          durationSecs,
          plankHoldSecs,
          createdAt,
        ]
      );

      const sessionObj = {
        id: sessionId,
        user_id: userId,
        exercise,
        exercise_name: exerciseName || exercise,
        reps,
        good_reps: goodReps,
        bad_reps: badReps,
        form_score: formScore,
        rep_history: repHistory,
        duration_secs: durationSecs,
        plank_hold_secs: plankHoldSecs,
        created_at: createdAt,
      };

      syncSessionToSupabase(sessionObj, authUser?.email);

      return res.json(sessionObj);
    } catch (err: any) {
      console.error("Save session error:", err);
      return res.status(500).json({ error: err.message || "Failed to save session" });
    }
  });

  app.get("/api/sessions", (req, res) => {
    try {
      const authUser = getAuthUser(req);
      const userId = authUser ? authUser.id : null;
      const { exercise, limit } = req.query;

      let sql = "SELECT * FROM sessions";
      const conditions: string[] = [];
      const params: any[] = [];

      if (userId) {
        conditions.push("user_id = ?");
        params.push(userId);
      }
      if (exercise && typeof exercise === "string" && exercise !== "all") {
        conditions.push("exercise = ?");
        params.push(exercise);
      }

      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }

      sql += " ORDER BY created_at ASC";

      if (limit && !isNaN(Number(limit))) {
        sql += ` LIMIT ${Number(limit)}`;
      }

      const rows = queryAll(sql, params);
      const sessions = rows.map((s) => {
        let repHistory = [];
        try {
          repHistory = typeof s.rep_history === "string" ? JSON.parse(s.rep_history) : s.rep_history || [];
        } catch {}
        return {
          ...s,
          rep_history: repHistory,
        };
      });

      return res.json({ sessions });
    } catch (err: any) {
      console.error("List sessions error:", err);
      return res.status(500).json({ error: err.message || "Failed to list sessions" });
    }
  });

  app.get("/api/sessions/stats", (req, res) => {
    try {
      const authUser = getAuthUser(req);
      const userId = authUser ? authUser.id : null;

      let sql = "SELECT * FROM sessions";
      const params: any[] = [];
      if (userId) {
        sql += " WHERE user_id = ?";
        params.push(userId);
      }

      const rows = queryAll(sql, params);
      const totalSessions = rows.length;
      const totalReps = rows.reduce((acc, r) => acc + (r.reps || 0), 0);
      const totalGoodReps = rows.reduce((acc, r) => acc + (r.good_reps || 0), 0);
      const totalBadReps = rows.reduce((acc, r) => acc + (r.bad_reps || 0), 0);
      const avgFormScore = totalSessions > 0 ? Math.round(rows.reduce((acc, r) => acc + (r.form_score || 0), 0) / totalSessions) : 0;

      return res.json({
        totalReps,
        totalSessions,
        avgFormScore,
        totalGoodReps,
        totalBadReps,
      });
    } catch (err: any) {
      console.error("Stats error:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch stats" });
    }
  });

  app.delete("/api/sessions/:id", (req, res) => {
    try {
      const { id } = req.params;
      run("DELETE FROM sessions WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Delete session error:", err);
      return res.status(500).json({ error: err.message || "Failed to delete session" });
    }
  });

  // --- Vite / Static Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
