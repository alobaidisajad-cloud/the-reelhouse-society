import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://wihyqkpoymwcvbprslyz.supabase.co', 'sb_publishable_y1kmD0C9P9lrOChVkg8AgA_vH-Ab98u')

async function run() {
    console.log("Testing exact inputs from user's screenshot:")
    const { data, error } = await supabase.auth.signUp({
        email: 'sajad.s.alobaidi@gmail.com',
        password: 'somerandompassword123',
        options: {
            data: { username: 'sajjadsaleel_', role: 'cinephile' }
        }
    })

    if (error) {
        console.error("❌ ERROR CAUGHT:", error.message)
    } else {
        console.log("✅ SUCCESS:", data.user ? "User created" : "No user")
    }
}
run()
