import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.rpc('get_notification_columns')
  if (error) {
      // Direct query if RPC doesn't exist
      const res = await supabase.from('notifications').select().limit(0);
      console.log('Error fetching columns directly:', res.error);
      // Let's try inserting a dummy row but expecting a validation error
      const insertRes = await supabase.from('notifications').insert({ user_id: '00000000-0000-0000-0000-000000000000', type: 'system', message: 'test' });
      console.log('Insert error columns info:', insertRes.error);
  }
}
check();
