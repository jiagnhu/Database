import {backend,owner} from './admin-client';
const required=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','CPV_ORG_ID','CPV_OWNER_EMAIL','DASHSCOPE_API_KEY'];
for(const name of required)console.log(`${name}: ${process.env[name]?'configured':'MISSING'}`);
console.log(`APP_MODE: ${process.env.APP_MODE||'connected'}`);
if(process.env.SUPABASE_SECRET_KEY){
 const db=backend();const {data,error}=await db.from('cpv_organizations').select('id').eq('id',process.env.CPV_ORG_ID!).maybeSingle();
 console.log(`Database schema: ${!error&&data?'reachable':'not ready'}`);
 try{const user=await owner(db);const membership=await db.from('cpv_memberships').select('role,active').eq('org_id',process.env.CPV_ORG_ID!).eq('user_id',user.id).maybeSingle();console.log(`Owner access: ${membership.data?.active?'ready':'run bootstrap-owner'}`);}catch{console.log('Owner account: create/confirm in Supabase Auth first');}
}
console.log('No paid model request was sent. Key values were not printed.');
