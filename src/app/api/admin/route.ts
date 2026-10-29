import { requireUser,checkDb } from '@/lib/supabase';
import { json,failure } from '@/lib/http';
export async function GET(){try{const {db,orgId}=await requireUser('admin');const results=await Promise.all([
 db.from('cpv_audit').select('id,action,target_id,created_at').eq('org_id',orgId).order('created_at',{ascending:false}).limit(50),
 db.from('cpv_usage').select('day,used_tokens,reserved_tokens,requests').eq('org_id',orgId).order('day',{ascending:false}).limit(7),
 db.from('cpv_organizations').select('daily_token_limit').eq('id',orgId).single(),
]);results.forEach(r=>checkDb(r.error));return json({audit:results[0].data,usage:results[1].data,dailyLimit:results[2].data?.daily_token_limit});}catch(e){return failure(e);}}
