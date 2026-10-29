import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { requireUser,checkDb } from './supabase';
import { HttpError } from './http';
import { buildChunks,keywordRank } from './domain';
import type { DocumentDetail,DocumentSummary,Evidence } from './types';

let corpusPromise:Promise<{documents:DocumentDetail[]}>|undefined;
async function corpus(){
  if(!config.preview()||process.env.NODE_ENV==='production')throw new HttpError(403,'PREVIEW_DISABLED','预览数据未启用。');
  corpusPromise??=fs.readFile(path.join(process.cwd(),'data/corpus.json'),'utf8').then(JSON.parse);
  return corpusPromise;
}
function summary(d:DocumentDetail):DocumentSummary{const {sections,...meta}=d;return {...meta,pairCount:sections.reduce((n,s)=>n+s.pairs.length,0)};}
export function dbSummary(d:Record<string,any>):DocumentSummary{return{id:d.id,title:d.title,filename:d.filename,type:d.file_type,subtitle:d.subtitle||'',version:d.version,status:d.status,sourcePages:d.source_pages,sourceDate:d.source_date,pairCount:d.pair_count,createdAt:d.created_at,errorCode:d.error_code,hasOriginal:!!d.storage_path};}
export async function listDocuments(){
  if(config.preview())return (await corpus()).documents.map(summary);
  const {db,orgId}=await requireUser();const {data,error}=await db.from('cpv_documents').select('id,title,filename,file_type,subtitle,version,status,source_pages,source_date,pair_count,created_at,error_code').eq('org_id',orgId).order('created_at',{ascending:false}).limit(500);checkDb(error);return(data||[]).map(dbSummary);
}
export async function getDocument(id:string):Promise<DocumentDetail>{
  if(config.preview()){const d=(await corpus()).documents.find(d=>d.id===id);if(!d)throw new HttpError(404,'NOT_FOUND','资料不存在。');return d;}
  const {db,orgId}=await requireUser();const {data,error}=await db.from('cpv_documents').select('*').eq('id',id).eq('org_id',orgId).maybeSingle();checkDb(error);
  if(!data)throw new HttpError(404,'NOT_FOUND','资料不存在或你没有访问权限。');
  return {...dbSummary(data),sections:data.content?.sections||[]};
}
export function dbEvidence(row:Record<string,any>):Evidence{return{id:row.id,documentId:row.document_id,documentTitle:row.document_title,filename:row.filename,source:row.source,sectionId:row.section_id,pairIds:row.pair_ids,en:row.text_en,zh:row.text_zh,version:row.version,score:row.score||0,sourceDate:row.source_date};}
export async function searchDocuments(query:string,documentId?:string){
  if(config.preview()){const chunks=(await corpus()).documents.filter(d=>!documentId||d.id===documentId).flatMap(buildChunks);return keywordRank(query,chunks,20);}
  const {db,orgId}=await requireUser();const {termsFor}=await import('./domain');
  const {data,error}=await db.rpc('cpv_search',{p_org:orgId,p_terms:termsFor(query),p_vector:null,p_document:documentId||null,p_limit:20});checkDb(error);return(data||[]).map(dbEvidence);
}
