require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const rLists = await supabase.from("lists").select("*").limit(1);
  console.log("lists columns:", rLists.data && rLists.data.length > 0 ? Object.keys(rLists.data[0]) : "No data or error", rLists.error);
  
  const rListItems = await supabase.from("list_items").select("*").limit(1);
  console.log("list_items columns:", rListItems.data && rListItems.data.length > 0 ? Object.keys(rListItems.data[0]) : "No data or error", rListItems.error);

  const rListItemsOrder = await supabase.from("list_items").select("*").order("position", { ascending: true }).limit(1);
  console.log("list_items order position error:", JSON.stringify(rListItemsOrder.error));

  const rListItemsOrderCreated = await supabase.from("list_items").select("*").order("created_at", { ascending: true }).limit(1);
  console.log("list_items order created_at error:", JSON.stringify(rListItemsOrderCreated.error));
}
test();
