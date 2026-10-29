import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Answer, DocumentDetail, Evidence } from './types';

export const answerSchema=z.object({found:z.boolean(),paragraphs:z.array(z.object({text:z.string().min(1).max(6000),citations:z.array(z.string()).max(6)}).strict()).max(10),followups:z.array(z.string().max(150)).max(3)}).strict();
export const questionSchema=z.object({question:z.string().trim().min(2).max(1200),requestId:z.uuid(),conversationId:z.uuid().optional(),documentId:z.uuid().optional(),pairId:z.string().max(160).optional()}).strict();
export const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export function stableUuid(s:string){ const h=sha(s);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; }
export function buildChunks(doc:DocumentDetail):Evidence[]{
  const out:Evidence[]=[];
  for(const s of doc.sections){
    let pairs:typeof s.pairs=[];let length=0;
    const flush=()=>{if(!pairs.length)return;out.push({id:stableUuid(`${doc.id}:${doc.version}:${pairs.map(p=>p.id).join(',')}`),documentId:doc.id,documentTitle:doc.title,filename:doc.filename,source:s.source,sectionId:s.id,pairIds:pairs.map(p=>p.id),en:pairs.map(p=>p.en).join('\n'),zh:pairs.map(p=>p.zh).join('\n'),version:doc.version,sourceDate:doc.sourceDate,score:0});pairs=[];length=0;};
    for(const p of s.pairs){if(length+p.en.length+p.zh.length>2200)flush();pairs.push(p);length+=p.en.length+p.zh.length;}flush();
  }return out;
}
const stop=new Set(['the','what','is','are','a','an','in','of','to','and','how','this','that','请问','什么','如何','解释','一下','这个','中的','是否','可以','为什么','意思']);
export function termsFor(query:string){
  const terms=query.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]+/g)||[];
  return [...new Set(terms.flatMap(t=>/^[\u4e00-\u9fff]+$/.test(t)&&t.length>2?Array.from({length:t.length-1},(_,i)=>t.slice(i,i+2)): [t]).filter(t=>!stop.has(t)))].slice(0,40);
}
export function keywordRank(query:string,chunks:Evidence[],limit=12):Evidence[]{
  const terms=termsFor(query);if(!terms.length)return[];
  return chunks.map(c=>{const text=(c.en+' '+c.zh).toLowerCase();const hits=terms.reduce((n,t)=>n+(text.includes(t)?1:0),0);return{...c,score:hits/terms.length};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function selectEvidence(chunks:Evidence[],maxChars=16000){
  let used=0;const seen=new Set<string>();const out:Evidence[]=[];
  for(const c of chunks){if(seen.has(c.id)||out.length>=6)continue;const n=c.en.length+c.zh.length;if(n>maxChars-used)continue;out.push(c);seen.add(c.id);used+=n;}return out;
}
export function validateAnswer(raw:unknown,evidence:Evidence[]):Answer{
  const a=answerSchema.parse(raw),allowed=new Set(evidence.map(e=>e.id));
  if(!a.found)return {found:false,paragraphs:[],followups:a.followups};
  if(!a.paragraphs.length)throw new Error('Empty supported answer');
  for(const p of a.paragraphs){if(!p.citations.length||p.citations.some(c=>!allowed.has(c)))throw new Error('Invalid citation');}
  return a;
}
export function estimateReservation(input:string,output:number){return Buffer.byteLength(input,'utf8')+output+2048;}
export function validateUpload(name:string,size:number,mime:string){
  const ext=name.split('.').at(-1)?.toLowerCase();
  const supported:Record<string,string>={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  if(!ext||!supported[ext]||size<=0||size>20*1024*1024||(mime&&mime!==supported[ext]&&mime!=='application/octet-stream'))throw new Error('只支持 20 MB 以内的 PDF、DOCX、PPTX 文件。');
  return ext;
}
