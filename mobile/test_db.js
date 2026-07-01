require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const r1 = await supabase.from("log_comments").select("id,log_id,user_id,body,created_at,profiles(username,avatar_url,display_name)").limit(1);
  console.log("log_comments:", JSON.stringify(r1.error));
  const r2 = await supabase.from("lists").select("id,title,description,cover_film_poster,user_id,is_public,is_private,is_ranked,created_at,profiles(username)").limit(1);
  console.log("lists:", JSON.stringify(r2.error));
  const r3 = await supabase.from("list_items").select("film_id,film_title,poster_path").limit(1);
  console.log("list_items:", JSON.stringify(r3.error));
}
test();
