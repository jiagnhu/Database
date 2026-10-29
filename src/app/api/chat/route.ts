import { questionSchema,selectEvidence,termsFor,buildChunks } from '@/lib/domain';
import { embedQuery,generateAnswer,modelMessages } from '@/lib/bailian';
import { dbEvidence,getDocument } from '@/lib/repository';
import { adminClient,requireUser,checkDb } from '@/lib/supabase';
import { json,failure,HttpError,sameOrigin,jsonBody } from '@/lib/http';
import type { ChatResult,Evidence } from '@/lib/types';

export async function POST(req:Request){let requestId=crypto.randomUUID();try{
  sameOrigin(req);const {db,orgId,user}=await requireUser();const input=questionSchema.parse(await jsonBody(req));requestId=input.requestId;
  if(!process.env.DASHSCOPE_API_KEY)throw new HttpError(503,'MODEL_NOT_CONFIGURED','百炼尚未配置，暂不能生成 AI 回答。');
  const admin=adminClient();
  let selected:Evidence[]=[];
  if(input.pairId){if(!input.documentId)throw new HttpError(400,'INVALID_SCOPE','选句提问需要指定资料。');const d=await getDocument(input.documentId);if(d.status!=='ready')throw new HttpError(400,'UNPUBLISHED','资料发布后才能参与问答。');selected=buildChunks(d).filter(c=>c.pairIds.includes(input.pairId!));if(!selected.length)throw new HttpError(404,'PAIR_NOT_FOUND','所选句子已不存在。');}
  let conversationId=input.conversationId;let history:{role:string;content:string}[]=[];
  if(conversationId){const c=await db.from('cpv_conversations').select('id').eq('id',conversationId).eq('org_id',orgId).maybeSingle();checkDb(c.error);if(!c.data)throw new HttpError(404,'NOT_FOUND','会话不存在。');
    const h=await db.from('cpv_messages').select('role,content').eq('conversation_id',conversationId).eq('role','user').order('created_at',{ascending:false}).limit(3);checkDb(h.error);history=(h.data||[]).reverse();
  }
  // Conservative reservation covers capped evidence, history, embedding and output.
  const reserve=await admin.rpc('cpv_reserve',{p_org:orgId,p_user:user.id,p_request:requestId,p_tokens:80000,p_operation:'chat'});
  if(reserve.error){const code=reserve.error.message.includes('duplicate')?'DUPLICATE_REQUEST':'QUOTA_EXCEEDED';throw new HttpError(code==='DUPLICATE_REQUEST'?409:429,code,code==='DUPLICATE_REQUEST'?'此请求已提交，请查看会话记录，避免重复计费。':'已达到调用频率或今日可用额度，请稍后重试或联系管理员。');}
  const queryText=[...history.slice(-1).map(h=>h.content.slice(0,300)),input.question].join('\n');
  const embedded=await embedQuery(orgId,queryText,req.signal);
  const result=await db.rpc('cpv_search',{p_org:orgId,p_terms:termsFor(queryText),p_vector:JSON.stringify(embedded.vector),p_document:input.documentId||null,p_limit:12,p_model:process.env.BAILIAN_EMBEDDING_MODEL||'text-embedding-v4'});checkDb(result.error);
  const evidence=selectEvidence([...selected,...(result.data||[]).map(dbEvidence)]);
  const generated=evidence.length?await generateAnswer(modelMessages(input.question,evidence,history),evidence,req.signal):{answer:{found:false,paragraphs:[],followups:[]},model:process.env.BAILIAN_CHAT_MODEL||'qwen-plus',input:0,output:0};
  // Revalidate membership and publication after a potentially long external request.
  await requireUser();const ids=[...new Set(evidence.map(e=>e.documentId))];
  if(ids.length){const check=await db.from('cpv_documents').select('id').in('id',ids).eq('status','ready');checkDb(check.error);if(check.data?.length!==ids.length)throw new HttpError(409,'SOURCES_CHANGED','资料权限或发布状态刚刚发生变化，请重新提问。');}
  const used=new Set(generated.answer.paragraphs.flatMap(p=>p.citations));
  if(!conversationId){const c=await db.from('cpv_conversations').insert({org_id:orgId,user_id:user.id,title:input.question.slice(0,100)}).select('id').single();checkDb(c.error);conversationId=c.data!.id;}
  const payload:ChatResult={requestId,conversationId,answer:generated.answer,sources:evidence.filter(e=>used.has(e.id)),model:generated.model,usage:{input:generated.input+embedded.tokens,output:generated.output},retrieval:'hybrid'};
  const save=await admin.rpc('cpv_save_chat',{p_org:orgId,p_user:user.id,p_conversation:conversationId,p_request:requestId,p_question:input.question,p_answer:generated.answer.found?generated.answer.paragraphs.map(p=>p.text).join('\n'):'资料中未找到足够依据。',p_payload:payload});checkDb(save.error);
  const settle=await admin.rpc('cpv_settle',{p_request:requestId,p_actual:payload.usage.input+payload.usage.output});checkDb(settle.error);
  return json(payload);
}catch(e){return failure(e,requestId);}}
