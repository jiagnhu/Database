import {createClient} from '@supabase/supabase-js';
export function backend(){
 for(const name of ['SUPABASE_URL','SUPABASE_SECRET_KEY','CPV_ORG_ID'])if(!process.env[name])throw new Error(`Missing ${name}; configure .env.local first.`);
 return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function owner(db:ReturnType<typeof backend>){
 const email=process.env.CPV_OWNER_EMAIL?.toLowerCase();if(!email)throw new Error('Missing CPV_OWNER_EMAIL');
 for(let page=1;page<=20;page++){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw new Error('Unable to look up owner account. Check server key.');
  const user=data.users.find(u=>u.email?.toLowerCase()===email);
  if(user){if(!user.email_confirmed_at)throw new Error('Owner email must be confirmed first.');return user;}
  if(data.users.length<100)break;
 }throw new Error('Create your account in Supabase Auth / Users first. No invitation email was sent.');
}
export function ensure(error:unknown){if(error)throw new Error('Backend operation failed; no credentials or source content logged.');}
