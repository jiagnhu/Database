import { createHash } from 'node:crypto';
import { requireUser,checkDb } from '@/lib/supabase';
import { json,failure,HttpError,sameOrigin } from '@/lib/http';
import { validateUpload } from '@/lib/domain';
export async function POST(req:Request){try{
  sameOrigin(req);const {db,orgId}=await requireUser('editor');
  if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))throw new HttpError(400,'INVALID_FILE','请选择需要上传的文件。');
  const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'EMPTY_FILE','文件为空。');const parts:Uint8Array[]=[];let bytes=0;
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>21*1024*1024){await reader.cancel();throw new HttpError(413,'FILE_TOO_LARGE','文件不得超过 20 MB。');}parts.push(value);}
  const form=await new Response(Buffer.concat(parts),{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();const file=form.get('file');
  if(!(file instanceof File))throw new HttpError(400,'INVALID_FILE','未收到文件。');
  let type:string;try{type=validateUpload(file.name,file.size,file.type);}catch(e){throw new HttpError(400,'INVALID_FILE',(e as Error).message);}
  const buffer=Buffer.from(await file.arrayBuffer());
  if(type==='pdf'?!buffer.subarray(0,5).equals(Buffer.from('%PDF-')):!buffer.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04])))throw new HttpError(400,'INVALID_SIGNATURE','文件内容与扩展名不一致。');
  const filename=file.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(-200);const digest=createHash('sha256').update(buffer).digest('hex');
  const created=await db.rpc('cpv_create_document',{p_org:orgId,p_title:filename.replace(/\.[^.]+$/,''),p_filename:filename,p_type:type,p_hash:digest,p_size:file.size});
  if(created.error){if(created.error.code==='23505')throw new HttpError(409,'DUPLICATE_FILE','相同文件已入库，请查看已有资料。');throw new HttpError(429,'UPLOAD_REJECTED','暂时无法创建上传任务，请检查额度或联系管理员。');}
  const path=`${orgId}/${created.data}/source.${type}`;
  const contentType={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}[type]!;
  const upload=await db.storage.from('cpv-originals').upload(path,buffer,{contentType,upsert:false});
  if(upload.error){await db.rpc('cpv_document_action',{p_org:orgId,p_document:created.data,p_action:'archive'});throw new HttpError(502,'UPLOAD_FAILED','文件上传失败，该任务已归档，请联系管理员清理后重试。');}
  const queued=await db.rpc('cpv_document_action',{p_org:orgId,p_document:created.data,p_action:'queue'});checkDb(queued.error);
  return json({id:created.data,status:'queued'},201);
}catch(e){return failure(e);}}
