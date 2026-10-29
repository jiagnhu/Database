import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChunks, keywordRank, validateAnswer, selectEvidence, estimateReservation, validateUpload } from '../src/lib/domain';
import type { DocumentDetail, Evidence } from '../src/lib/types';
import { ensureEmbeddings } from '../src/lib/embedding-import';
import { uploadSchema } from '../src/lib/upload';

const doc: DocumentDetail = {id:'d',title:'市场价值',filename:'lesson.pdf',type:'pdf',subtitle:'',version:1,status:'ready',sourcePages:1,sourceDate:null,sections:[{id:'s',title:'市场价值',source:'PDF 第 2 页',pairs:[{id:'p1',en:'Market value is an estimated amount.',zh:'市场价值是估计的金额。',kind:'text'},{id:'p2',en:'WALE means weighted average lease expiry.',zh:'WALE 指加权平均租约到期年限。',kind:'text'}]}]};
const evidence: Evidence = {id:'c1',documentId:'d',documentTitle:'市场价值',filename:'lesson.pdf',source:'PDF 第 2 页',sectionId:'s',pairIds:['p1'],en:doc.sections[0].pairs[0].en,zh:doc.sections[0].pairs[0].zh,version:1,score:1};

test('chunking keeps exact source pair references and stable identifiers',()=>{
  const chunks=buildChunks(doc); assert.deepEqual(chunks[0].pairIds,['p1','p2']);
  assert.equal(chunks[0].id,buildChunks(doc)[0].id); assert.equal(chunks[0].source,'PDF 第 2 页');
});
test('Chinese terms and English acronyms locate actual source; nonsense has no hit',()=>{
  const chunks=buildChunks(doc); assert.equal(keywordRank('市场价值',chunks)[0].documentId,'d');
  assert.equal(keywordRank('WALE',chunks).length,1); assert.equal(keywordRank('xyzznone',chunks).length,0);
});
test('untrusted model citations, uncited claims and missing-source assertions are rejected',()=>{
  assert.throws(()=>validateAnswer({found:true,paragraphs:[{text:'x',citations:['invented']}],followups:[]},[evidence]));
  assert.throws(()=>validateAnswer({found:true,paragraphs:[{text:'x',citations:[]}],followups:[]},[evidence]));
  const answer=validateAnswer({found:false,paragraphs:[],followups:[]},[evidence]); assert.equal(answer.found,false);
  assert.equal(validateAnswer({found:true,paragraphs:[{text:'解释',citations:['c1']}],followups:[]},[evidence]).paragraphs.length,1);
});
test('context and reservation caps bound model cost including Chinese UTF-8 bytes',()=>{
  const selected=selectEvidence(Array.from({length:12},(_,i)=>({...evidence,id:String(i),en:'a'.repeat(2200),zh:'字'.repeat(1000)})));
  assert.ok(selected.length<=6); assert.ok(selected.reduce((s,e)=>s+e.en.length+e.zh.length,0)<=16000);
  assert.ok(estimateReservation('你好',1200)>=1206);
});
test('upload validation rejects disguised extension, empty and oversized files',()=>{
  assert.throws(()=>validateUpload('a.exe',100,'application/pdf'));
  assert.throws(()=>validateUpload('a.pdf',0,'application/pdf'));
  assert.throws(()=>validateUpload('a.pdf',21*1024*1024,'application/pdf'));
  assert.equal(validateUpload('original.pdf',100,'application/pdf'),'pdf');
});

test('direct upload metadata rejects arbitrary paths, hashes, fractional and oversized lengths',()=>{
  const valid={filename:'lesson.pdf',size:6*1024*1024,mime:'application/pdf',sha256:'a'.repeat(64)};
  assert.ok(uploadSchema.safeParse(valid).success);
  for(const bad of [{...valid,size:21*1024*1024},{...valid,size:1.5},{...valid,sha256:'abc'},{...valid,mime:'text/html'},{...valid,path:'other/file.pdf'},{...valid,filename:'payload.exe'}])assert.equal(uploadSchema.safeParse(bad).success,false);
});

test('indexing resumes after a failed batch without repeating paid completed work',async()=>{
  const cache=new Map<string,number[]>(),inputs=Array.from({length:11},(_,i)=>({id:String(i),text:`source ${i}`}));let calls=0,fail=true;
  const ports={read:async(keys:string[])=>new Map(keys.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)!])),write:async(rows:{key:string;vector:number[]}[])=>{rows.forEach(r=>cache.set(r.key,r.vector));},embed:async(texts:string[])=>{calls++;if(calls===2&&fail)throw new Error('timeout');return texts.map(()=>Array(1024).fill(.1));}};
  await assert.rejects(()=>ensureEmbeddings(inputs,'model-a',ports));assert.equal(cache.size,10);
  fail=false;const resumed=await ensureEmbeddings(inputs,'model-a',ports);assert.equal(resumed.size,11);assert.equal(calls,3);
  await ensureEmbeddings(inputs,'model-a',ports);assert.equal(calls,3);
  await ensureEmbeddings(inputs,'model-b',ports);assert.equal(calls,5);
});
