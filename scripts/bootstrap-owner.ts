import {backend,owner,ensure} from './admin-client';
const db=backend();const user=await owner(db);const org=process.env.CPV_ORG_ID!;
const {data:members,error}=await db.from('cpv_memberships').select('user_id').eq('org_id',org);ensure(error);
if(members?.some(m=>m.user_id!==user.id))throw new Error('This is a single-owner project. Existing other members require manual review.');
ensure((await db.from('cpv_memberships').upsert({org_id:org,user_id:user.id,email:user.email,role:'admin',active:true})).error);
console.log('Owner access is configured. Sign in using the password you set in Supabase Auth.');
