import { requireUser,checkDb } from '@/lib/supabase';
import { json,failure } from '@/lib/http';
import { z } from 'zod';
export async function GET(req:Request){try{
  const {db,orgId}=await requireUser();const id=new URL(req.url).searchParams.get('id');
  if(!id){const {data,error}=await db.from('cpv_conversations').select('id,title,created_at').eq('org_id',orgId).order('created_at',{ascending:false}).limit(50);checkDb(error);return json({conversations:data});}
  const {data,error}=await db.from('cpv_messages').select('role,content,payload,created_at').eq('conversation_id',z.uuid().parse(id)).eq('org_id',orgId).order('created_at').limit(100);checkDb(error);
  const ids=[...new Set((data||[]).flatMap(m=>(m.payload?.sources||[]).map((s:{documentId:string})=>s.documentId)))];
  const allowed=new Set<string>();if(ids.length){const docs=await db.from('cpv_documents').select('id').in('id',ids).eq('status','ready');checkDb(docs.error);docs.data?.forEach(d=>allowed.add(d.id));}
  return json({messages:(data||[]).map(m=>m.role==='assistant'&&(m.payload?.sources||[]).some((s:{documentId:string})=>!allowed.has(s.documentId))?{...m,content:'关联资料已归档或不可访问，历史回答已隐藏。',payload:null}:m)});
}catch(e){return failure(e);}}
