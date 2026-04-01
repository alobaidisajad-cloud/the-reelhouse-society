// Quick test to see the actual Supabase error when creating a lounge
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
    'https://wihyqkpoymwcvbprslyz.supabase.co',
    'sb_publishable_y1kmD0C9P9lrOChVkg8AgA_vH-Ab98u'
)

async function testLoungeInsert() {
    // First, check if lounges table exists and its columns
    const { data: cols, error: colErr } = await supabase
        .from('lounges')
        .select('*')
        .limit(0)
    
    console.log('Table check:', colErr ? colErr.message : 'OK')
    
    // Try to describe the table by selecting with wrong type  
    const { data: sample, error: sampleErr } = await supabase
        .from('lounges')
        .select('id, name, creator_id, is_private, invite_code, cover_image, member_count, max_members, description, created_at')
        .limit(1)
    
    console.log('Columns check:', sampleErr ? sampleErr.message : 'Columns exist - OK')
    console.log('Sample data:', sample)
    
    // Check lounge_members
    const { error: membErr } = await supabase
        .from('lounge_members')
        .select('*')
        .limit(0)
    
    console.log('Members table:', membErr ? membErr.message : 'OK')
    
    // Check lounge_messages
    const { error: msgErr } = await supabase
        .from('lounge_messages')  
        .select('*')
        .limit(0)
    
    console.log('Messages table:', msgErr ? msgErr.message : 'OK')
}

testLoungeInsert()
