import { z } from 'zod';
import { requireUser,checkDb } from '@/lib/supabase';
import { json,jsonBody,failure,HttpError,sameOrigin } from '@/lib/http';
import { uploadTypes } from '@/lib/upload';

export async function POST(req:Request){try{
  sameOrigin(req);const {db,orgId,user}=await requireUser('editor');
  const {id}=z.object({id:z.uuid()}).strict().parse(await jsonBody(req));
  const result=await db.from('cpv_documents').select('id,status,storage_path,byte_size,file_type').eq('org_id',orgId).eq('created_by',user.id).eq('id',id).maybeSingle();
  checkDb(result.error);const doc=result.data;
  if(!doc)throw new HttpError(404,'NOT_FOUND','没有找到该上传任务。');
  if(['queued','processing','review','ready'].includes(doc.status))return json({id,status:doc.status});
  if(doc.status!=='uploading')throw new HttpError(409,'INVALID_STATUS','该文件已结束上传，请查看资料状态。');
  const stored=await db.storage.from('cpv-originals').info(doc.storage_path);
  if(stored.error)throw new HttpError(409,'UPLOAD_INCOMPLETE','文件尚未完整上传，请重新选择同一文件继续上传。');
  if(stored.data.size!==doc.byte_size||stored.data.contentType!==uploadTypes[doc.file_type as keyof typeof uploadTypes])throw new HttpError(409,'UPLOAD_MISMATCH','文件信息不一致，请联系管理员检查该上传任务。');
  const queued=await db.rpc('cpv_document_action',{p_org:orgId,p_document:id,p_action:'queue'});
  if(queued.error){
    const latest=await db.from('cpv_documents').select('status').eq('org_id',orgId).eq('id',id).single();
    checkDb(latest.error);
    if(!['queued','processing','review','ready'].includes(latest.data!.status))checkDb(queued.error);
    return json({id,status:latest.data!.status});
  }
  return json({id,status:'queued'});
}catch(e){return failure(e);}}
