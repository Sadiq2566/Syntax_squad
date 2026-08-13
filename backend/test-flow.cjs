async function run() {
  const fetch = (await import('node-fetch')).default;
  try {
    const res = await fetch("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "User 3", email: "test3@example.com", password: "pw" })
    });
    const { user, token } = await res.json();
    
    await fetch("http://localhost:3000/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ exercise: "squat", reps: 10, goodReps: 5, formScore: 80 })
    });
    
    const sessRes = await fetch("http://localhost:3000/api/sessions", {
      method: "GET",
      headers: { "Authorization": "Bearer " + token }
    });
    const sessions = await sessRes.json();
    console.log("Sessions count:", sessions.sessions.length);
  } catch (e) { console.error(e) }
}
run();
