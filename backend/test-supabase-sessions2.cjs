const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://fghppywkyeggkcmenpuv.supabase.co";
const SUPABASE_KEY = "sb_publishable_eMTZSjMZOGIH2zRbTMLzCw_vyiLhm1x";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  // 1. Get a valid user ID from Supabase
  const { data: users } = await supabase.from('users').select('id').limit(1);
  if (!users || users.length === 0) {
    console.log("No users found in Supabase.");
    return;
  }
  const validUserId = users[0].id;
  console.log("Using user ID:", validUserId);

  const { data: insertData, error: insertError } = await supabase.from('sessions').insert([
    {
      user_id: validUserId,
      exercise: "test",
      exercise_name: "Test",
      created_at: new Date().toISOString()
    }
  ]);
  
  if (insertError) {
    console.error("Insert Error:", insertError);
  } else {
    console.log("Insert Success! Data synced.");
  }
}
test();
