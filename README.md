# 🏋️ PostureAI — AI Posture Coach

A real-time AI posture coaching web app using **TensorFlow.js MoveNet** for body-pose detection, with a **Node.js + Express + SQLite** backend for persistent user accounts and session history.

---

## Features

- 📷 **Live camera pose detection** via MoveNet Thunder
- 🦴 **Colour-coded skeleton overlay** with real-time joint angle labels
- 🔁 **FSM-based rep counter** for 6 exercises (Squat, Push-Up, Plank, Shoulder Press, Lunge, Bicep Curl)
- ✅ **Form quality feedback** — Good / Fair / Bad per rep
- 📊 **Progress dashboard** with 5 pure-SVG charts (no library)
- 🔐 **JWT authentication** with bcrypt password hashing
- 💾 **SQLite backend** with automatic localStorage fallback (works offline)

---

## Quick start

### 1 — Install & run the backend

```bash
cd posture-coach/backend
cp .env.example .env          # edit JWT_SECRET for production

npm install
npm start
# → http://localhost:3001
```

### 2 — Open the app

Navigate to **http://localhost:3001/landing.html** in your browser.

The backend serves all static frontend files from the `posture-coach/` folder, so you only need one URL.

### 3 — Development mode (auto-restart)

```bash
npm run dev     # uses nodemon
```

---

## API reference

All endpoints are prefixed with `/api`.

### Auth

| Method | Path | Body / Notes |
|--------|------|--------------|
| `POST` | `/auth/register` | `{ name, email, password, age?, fitnessLevel?, goals?, injuries? }` → `{ token, user }` |
| `POST` | `/auth/login` | `{ email, password }` → `{ token, user }` |
| `GET`  | `/auth/me` | Bearer token required → `{ user }` |
| `PUT`  | `/auth/profile` | Bearer token + `{ name, age, fitnessLevel, goals, injuries }` → `{ user }` |

### Sessions

All session endpoints require `Authorization: Bearer <token>`.

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/sessions` | Save a completed workout session |
| `GET`  | `/sessions` | List sessions. Query: `?exercise=squat&since=2024-01-01&limit=50` |
| `GET`  | `/sessions/stats` | Aggregated stats. Query: `?since=2024-01-01` |
| `DELETE` | `/sessions/:id` | Delete a session |

---

## Offline / localStorage fallback

`api.js` probes `/api/health` at load time with a 2-second timeout.  
- **Backend reachable** → all auth + session data goes to SQLite via the REST API.  
- **Backend unreachable** → the app automatically falls back to `localStorage` exactly as before, so everything keeps working when opened directly from the filesystem.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `JWT_SECRET` | `change_this_to_a_long_random_string_in_production` | JWT signing secret — **change this in production** |

---

## Supported exercises

| Exercise | Detection | Rep trigger |
|----------|-----------|-------------|
| Squat | Knee angle | Hip descent below threshold |
| Push-Up | Elbow angle | Arm extension after flexion |
| Plank | Hip & shoulder alignment | Hold duration (seconds) |
| Shoulder Press | Elbow angle | Arms fully extended overhead |
| Lunge | Knee angle | Front knee descent |
| Bicep Curl | Elbow angle (bilateral) | Full curl on either arm |
