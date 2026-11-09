const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Keys not found in manual parse of .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  const { data: roles, error: rError } = await supabase.from('user_roles').select('*');
  console.log('Current User Roles in DB:', roles);

  if (roles && roles.length > 0) {
    for (const r of roles) {
      const { data, error } = await supabase
        .from('user_roles')
        .update({ role: 'admin' })
        .eq('id', r.id)
        .select();
      console.log(`Updated user ${r.user_id} to admin:`, data, error);
    }
  }

  const { data: profiles } = await supabase.from('profiles').select('id, full_name, user_id, status');
  console.log('Profiles in DB:', profiles);
}

run();
