import { requireUser,checkDb } from '@/lib/supabase';
import { json,jsonBody,failure,HttpError,sameOrigin } from '@/lib/http';
import { uploadSchema,uploadTypes } from '@/lib/upload';
export async function POST(req:Request){try{
  sameOrigin(req);const {db,orgId,user}=await requireUser('editor');
  const input=uploadSchema.parse(await jsonBody(req));
  const type=input.filename.split('.').at(-1)!.toLowerCase() as keyof typeof uploadTypes;
  const filename=input.filename.replace(/[\\/\u0000-\u001f]/g,'_');
  // Re-selecting an interrupted upload resumes the same immutable object.
  const existing=await db.from('cpv_documents').select('id,status,created_by,byte_size,file_type').eq('org_id',orgId).eq('sha256',input.sha256).maybeSingle();
  checkDb(existing.error);let id=existing.data?.id;
  if(existing.data&&(existing.data.status!=='uploading'||existing.data.created_by!==user.id||existing.data.byte_size!==input.size||existing.data.file_type!==type))throw new HttpError(409,'DUPLICATE_FILE','相同文件已有记录，请查看已有资料。');
  if(!id){
    const created=await db.rpc('cpv_create_document',{p_org:orgId,p_title:filename.replace(/\.[^.]+$/,''),p_filename:filename,p_type:type,p_hash:input.sha256,p_size:input.size});
    if(created.error){if(created.error.code==='23505')throw new HttpError(409,'DUPLICATE_FILE','文件已有上传任务，请重新选择该文件以继续。');throw new HttpError(429,'UPLOAD_REJECTED','暂时无法创建上传任务，请检查额度或联系管理员。');}
    id=created.data;
  }
  const path=`${orgId}/${id}/source.${type}`;
  if(existing.data){
    const stored=await db.storage.from('cpv-originals').info(path);
    if(stored.data)return json({id,alreadyUploaded:true},201);
  }
  const signed=await db.storage.from('cpv-originals').createSignedUploadUrl(path,{upsert:false});
  if(signed.error)throw new HttpError(502,'UPLOAD_UNAVAILABLE','无法取得上传凭证，请重新选择文件重试。');
  return json({id,path,token:signed.data.token,url:process.env.SUPABASE_URL,publicKey:process.env.SUPABASE_PUBLISHABLE_KEY,contentType:uploadTypes[type]},201);
}catch(e){return failure(e);}}
