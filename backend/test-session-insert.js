async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User 2",
        email: "test2@example.com",
        password: "password123"
      })
    });
    const { user, token } = await res.json();
    console.log("Registered:", user.email);

    // Give it a second to sync to Supabase
    await new Promise(r => setTimeout(r, 1000));

    const sessRes = await fetch("http://localhost:3000/api/sessions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({
        exercise: "pushups",
        reps: 10,
        goodReps: 8,
        badReps: 2
      })
    });
    
    const sessData = await sessRes.json();
    console.log("Session saved local id:", sessData.id);
  } catch (err) {
    console.error(err);
  }
}
run();
