import { userClient } from '@/lib/supabase';
import { json,failure,sameOrigin,jsonBody,HttpError } from '@/lib/http';
import { z } from 'zod';
const attempts=new Map<string,number[]>();
export async function POST(req:Request){try{
  sameOrigin(req);const input=z.object({action:z.enum(['login','logout','password']),email:z.email().optional(),password:z.string().min(1).max(128).optional()}).parse(await jsonBody(req));const db=await userClient();
  if(input.action==='logout'){await db.auth.signOut();return json({ok:true});}
  if(input.action==='password'){if(!input.password||input.password.length<12)throw new HttpError(400,'PASSWORD_REQUIRED','密码至少 12 位。');const {data:{user}}=await db.auth.getUser();if(!user)throw new HttpError(401,'UNAUTHENTICATED','邀请或重置链接已失效，请联系管理员。');const {error}=await db.auth.updateUser({password:input.password});if(error)throw new HttpError(400,'PASSWORD_REJECTED','密码不符合要求或链接已过期。');return json({ok:true});}
  if(!input.email||!input.password)throw new HttpError(400,'CREDENTIALS_REQUIRED','请输入企业邮箱和密码。');
  const key=input.email.toLowerCase();const recent=(attempts.get(key)||[]).filter(t=>t>Date.now()-60000);if(recent.length>=5)throw new HttpError(429,'LOGIN_RATE_LIMIT','尝试次数过多，请一分钟后再试。');if(attempts.size>1000)attempts.clear();attempts.set(key,[...recent,Date.now()]);
  const {error}=await db.auth.signInWithPassword({email:input.email,password:input.password});if(error)throw new HttpError(401,'LOGIN_FAILED','登录失败，请检查邮箱和密码。');return json({ok:true});
}catch(e){return failure(e);}}
