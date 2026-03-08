import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuth() {
    console.log("--- TESTING SIGNUP ---");
    const testEmail = `test_${Date.now()}@reelhouse.local`;

    let { data: signupData, error: signupError } = await supabase.auth.signUp({
        email: testEmail,
        password: 'Password123!',
        options: {
            data: { username: `test_${Date.now()}`, role: 'cinephile' }
        }
    });

    if (signupError) {
        console.error("Signup Error:", signupError.message);
    } else {
        console.log("Signup Success. Session exists:", !!signupData.session);
    }

    console.log("\n--- TESTING LOGIN ---");
    // Test login with a known bad credential
    let { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'invalid@invalid.invalid',
        password: 'wrongpassword'
    });

    if (loginError) {
        console.error("Login Error (Expected):", loginError.message);
    }

    // Try login with the newly created account
    let { data: newLoginData, error: newLoginError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: 'Password123!'
    });

    if (newLoginError) {
        console.error("Login Error (New Account):", newLoginError.message);
    } else {
        console.log("Login Success (New Account)");

        // Test Profile fetch
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newLoginData.user.id)
            .single();

        if (profileErr) {
            console.error("Profile Fetch Error:", profileErr.message);
        } else {
            console.log("Profile Fetch Success:", !!profile);
        }
    }
}

testAuth();
