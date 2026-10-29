import { userClient } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
export async function GET(req:Request){
  const u=new URL(req.url),hash=u.searchParams.get('token_hash'),type=u.searchParams.get('type');
  if(hash&&(type==='invite'||type==='recovery')){const db=await userClient();const {error}=await db.auth.verifyOtp({token_hash:hash,type});if(!error)return NextResponse.redirect(new URL('/?setPassword=1',config.origin()));}
  return NextResponse.redirect(new URL('/?authError=1',config.origin()));
}
