import fs from 'node:fs/promises';
import {backend,owner,ensure} from './admin-client';
import {buildChunks,sha,stableUuid} from '../src/lib/domain';
import type {DocumentDetail} from '../src/lib/types';
import {ensureEmbeddings,embeddingKey,validVector} from '../src/lib/embedding-import';

const db=backend(),user=await owner(db),org=process.env.CPV_ORG_ID!,embed=process.argv.includes('--embed');
const corpus=JSON.parse(await fs.readFile('data/corpus.json','utf8')) as {documents:DocumentDetail[]};
if(embed&&!process.env.DASHSCOPE_API_KEY)throw new Error('Missing DASHSCOPE_API_KEY');
const model=process.env.BAILIAN_EMBEDDING_MODEL||'text-embedding-v4';
for(const original of corpus.documents){
 const content={sections:original.sections,importKind:'curated-bilingual'};
 const checksum=sha(JSON.stringify(content));const id=stableUuid(`${org}:${checksum}`);const document={...original,id};
 const existing=await db.from('cpv_documents').select('id,status').eq('org_id',org).eq('sha256',checksum).maybeSingle();ensure(existing.error);
 if(existing.data?.status==='archived'||(existing.data?.status==='ready'&&!embed)){console.log(`Unchanged: ${original.title}`);continue;}
 const chunks=buildChunks(document);
 if(!existing.data)ensure((await db.from('cpv_documents').insert({id,org_id:org,title:document.title,filename:document.filename,file_type:document.type,subtitle:document.subtitle,version:document.version,status:'review',sha256:checksum,byte_size:Buffer.byteLength(JSON.stringify(content)),content,source_pages:document.sourcePages,pair_count:document.sections.reduce((n,s)=>n+s.pairs.length,0),source_date:document.sourceDate,created_by:user.id})).error);
 let vectors=new Map<string,number[]>();
 if(embed){
 const stored=await db.from('cpv_chunks').select('text_en,text_zh,embedding,embedding_model').eq('org_id',org).eq('document_id',id);ensure(stored.error);
 const prior=new Map<string,number[]>();for(const c of stored.data||[]){const v=typeof c.embedding==='string'?JSON.parse(c.embedding):c.embedding;if(c.embedding_model===model&&validVector(v))prior.set(embeddingKey(model,c.text_en+'\n'+c.text_zh),v);}
 vectors=await ensureEmbeddings(chunks.map(c=>({id:c.id,text:c.en+'\n'+c.zh})),model,{
 read:async keys=>{const found=new Map(keys.filter(k=>prior.has(k)).map(k=>[k,prior.get(k)!]));const missing=keys.filter(k=>!found.has(k));if(missing.length){const cache=await db.from('cpv_processing_cache').select('cache_key,payload').eq('org_id',org).in('cache_key',missing);ensure(cache.error);for(const c of cache.data||[])if(validVector(c.payload?.embedding))found.set(c.cache_key,c.payload.embedding);}return found;},
 write:async rows=>{ensure((await db.from('cpv_processing_cache').upsert(rows.map(r=>({org_id:org,cache_key:r.key,payload:{embedding:r.vector}})),{onConflict:'org_id,cache_key'})).error);},
 embed:async texts=>{
  const rid=crypto.randomUUID();
  const amount=Buffer.byteLength(JSON.stringify(texts))+2048;
  ensure((await db.rpc('cpv_reserve',{p_org:org,p_user:user.id,p_request:rid,p_tokens:amount,p_operation:'ingest'})).error);
  const r=await fetch(`${(process.env.BAILIAN_BASE_URL||'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/,'')}/embeddings`,{method:'POST',headers:{Authorization:`Bearer ${process.env.DASHSCOPE_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:texts,dimensions:1024,encoding_format:'float'}),signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw new Error('Embedding failed; no automatic retry. Reservation retained.');
  const response=await r.json();const values=response.data?.sort((a:{index:number},b:{index:number})=>a.index-b.index);
  if(values?.length!==texts.length||values.some((v:{embedding:number[];index:number},j:number)=>v.index!==j||!validVector(v.embedding)))throw new Error('Invalid embedding response');
  if(Number.isSafeInteger(response.usage?.total_tokens))ensure((await db.rpc('cpv_settle',{p_request:rid,p_actual:response.usage.total_tokens})).error);
  return values.map((v:{embedding:number[]})=>v.embedding);
 }});
 }
 const rows=chunks.map(c=>({id:c.id,org_id:org,document_id:id,section_id:c.sectionId,pair_ids:c.pairIds,source:c.source,text_en:c.en,text_zh:c.zh,embedding:vectors.get(c.id)||null,embedding_model:embed?model:null}));
 for(let i=0;i<rows.length;i+=50)ensure((await db.from('cpv_chunks').upsert(rows.slice(i,i+50))).error);
 // Existing bilingual corpus was already reviewed in the original reader; never re-translate it.
 ensure((await db.from('cpv_documents').update({status:'ready'}).eq('id',id).eq('org_id',org)).error);
 ensure((await db.from('cpv_audit').insert({org_id:org,user_id:user.id,action:'corpus.import',target_id:id,detail:{pairs:document.sections.reduce((n,s)=>n+s.pairs.length,0),embedded:embed}})).error);
 console.log(`Imported ${original.title}: ${chunks.length} source chunks${embed?' with vectors':' (keyword index only)'}`);
}
console.log('Import complete. Original files remain in their local source directory; this imports reviewed bilingual content and figures.');
