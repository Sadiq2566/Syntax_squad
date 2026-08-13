const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://fghppywkyeggkcmenpuv.supabase.co";
const SUPABASE_KEY = "sb_publishable_eMTZSjMZOGIH2zRbTMLzCw_vyiLhm1x";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data: insertData, error: insertError } = await supabase.from('sessions').insert([
    {
      user_id: 1,
      exercise: "test",
      exercise_name: "Test",
      created_at: new Date().toISOString()
    }
  ]);
  
  if (insertError) {
    console.error("Insert Error:", insertError.message);
  } else {
    console.log("Insert Success! Data synced.");
  }
}
test();
