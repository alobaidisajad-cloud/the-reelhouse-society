require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
// Use service role if available to bypass RLS, otherwise use anon
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, key);
async function test() {
  // Test a direct RPC to check if from_user_id exists
  const r = await supabase.from("notifications").select("from_user_id").limit(1);
  console.log("from_user_id query result:", JSON.stringify(r));
}
test();
