import { config } from '@/lib/config';
import { requireUser,checkDb } from '@/lib/supabase';
import { json,failure,HttpError } from '@/lib/http';
export async function GET(){
  if(config.preview())return json({mode:'preview',configured:false,aiReady:false,adminReady:false,organization:{name:'CPV 学习空间'}});
  if(!config.connected())return json({mode:'connected',configured:false,aiReady:false,adminReady:false});
  try{const {db,user,role,orgId}=await requireUser();const {data,error}=await db.from('cpv_organizations').select('id,name').eq('id',orgId).single();checkDb(error);return json({mode:'connected',configured:true,aiReady:config.ai(),adminReady:config.admin(),organization:data,user:{id:user.id,email:user.email,role}});}
  catch(e){if(e instanceof HttpError&&e.status===401)return json({mode:'connected',configured:true,aiReady:config.ai(),adminReady:config.admin()});return failure(e);}
}
