import { requireUser,checkDb } from '@/lib/supabase';
import { failure,HttpError } from '@/lib/http';
import { z } from 'zod';
export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}){try{
  const {db,orgId}=await requireUser();const {data,error}=await db.from('cpv_documents').select('storage_path,filename').eq('org_id',orgId).eq('id',z.uuid().parse((await ctx.params).id)).maybeSingle();checkDb(error);
  if(!data?.storage_path)throw new HttpError(404,'NOT_FOUND','原文件不可用。');
  const file=await db.storage.from('cpv-originals').download(data.storage_path);checkDb(file.error);
  return new Response(file.data,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(data.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
