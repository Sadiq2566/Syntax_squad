const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = "https://fghppywkyeggkcmenpuv.supabase.co";
const SUPABASE_KEY = "sb_publishable_eMTZSjMZOGIH2zRbTMLzCw_vyiLhm1x";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const { data: users } = await supabase.from('users').select('*');
  console.log("Users in Supabase:", users);
  
  const { data: sessions } = await supabase.from('sessions').select('*');
  console.log("Sessions in Supabase:", sessions);
}
test();
