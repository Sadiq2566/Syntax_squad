const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://fghppywkyeggkcmenpuv.supabase.co";
const SUPABASE_KEY = "sb_publishable_eMTZSjMZOGIH2zRbTMLzCw_vyiLhm1x";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  console.log("Testing connection...");
  const { data, error } = await supabase.from('users').select('*').limit(1);
  if (error) {
    console.error("Select Error:", error.message, error.details, error.hint);
  } else {
    console.log("Select Success:", data);
  }
  
  const { data: insertData, error: insertError } = await supabase.from('users').upsert([
    {
      name: "Test User",
      email: "test" + Date.now() + "@example.com",
      created_at: new Date().toISOString()
    }
  ], { onConflict: "email" });
  
  if (insertError) {
    console.error("Insert Error:", insertError.message, insertError.details, insertError.hint);
  } else {
    console.log("Insert Success! Data synced.");
  }
}
test();
