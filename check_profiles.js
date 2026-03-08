import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://wihyqkpoymwcvbprslyz.supabase.co', 'sb_publishable_y1kmD0C9P9lrOChVkg8AgA_vH-Ab98u')
async function run() {
    const { data } = await supabase.from('profiles').select('*')
    console.log(JSON.stringify(data, null, 2))
}
run()
