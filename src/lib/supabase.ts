import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { config } from './config';
import { HttpError } from './http';
import type { Role } from './types';

export async function userClient(){
  if(!config.connected())throw new HttpError(503,'NOT_CONFIGURED','尚未连接企业数据服务。');
  const jar=await cookies();
  return createServerClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{
    cookieOptions:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'},
    cookies:{getAll:()=>jar.getAll(),setAll:items=>{for(const {name,value,options} of items)jar.set(name,value,options);}},
  });
}
export function adminClient(){
  if(!process.env.SUPABASE_SECRET_KEY)throw new HttpError(503,'ADMIN_NOT_CONFIGURED','管理员服务尚未配置。');
  return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function requireUser(minRole:Role='reader'){
  if(config.preview())throw new HttpError(403,'PREVIEW_READ_ONLY','本地预览为只读模式，连接企业服务后可使用此功能。');
  const db=await userClient();const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw new HttpError(401,'UNAUTHENTICATED','请先登录企业账号。');
  const orgId=process.env.CPV_ORG_ID!;
  const {data:membership,error:merror}=await db.from('cpv_memberships').select('role,active').eq('org_id',orgId).eq('user_id',user.id).maybeSingle();
  if(merror)throw new HttpError(503,'MEMBERSHIP_UNAVAILABLE','无法确认企业成员权限。');
  const rank={reader:1,editor:2,admin:3};
  if(!membership?.active||rank[membership.role as Role]<rank[minRole])throw new HttpError(403,'FORBIDDEN','此账号没有执行该操作的权限。');
  return {db,user,orgId,role:membership.role as Role};
}
export function checkDb(error:{message?:string}|null){if(error)throw new Error('Database operation failed');}
