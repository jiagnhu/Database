import {sha} from './domain';
type Vector=number[];
export const embeddingKey=(model:string,text:string)=>sha(`embedding-v1:${model}:${text}`);
export const validVector=(value:unknown):value is Vector=>Array.isArray(value)&&value.length===1024&&value.every(v=>typeof v==='number'&&Number.isFinite(v));
/** Persist every paid batch before beginning the next one; model names partition caches. */
export async function ensureEmbeddings(entries:{id:string;text:string}[],model:string,ports:{read:(keys:string[])=>Promise<Map<string,Vector>>;write:(rows:{key:string;vector:Vector}[])=>Promise<void>;embed:(texts:string[])=>Promise<Vector[]>}){
 const unique=new Map(entries.map(e=>[embeddingKey(model,e.text),e.text]));const values=new Map<string,Vector>();const keys=[...unique.keys()];
 for(let i=0;i<keys.length;i+=50){const found=await ports.read(keys.slice(i,i+50));for(const [key,vector]of found)if(validVector(vector)&&unique.has(key))values.set(key,vector);}
 const missing=keys.filter(key=>!values.has(key));
 for(let i=0;i<missing.length;i+=10){
  const group=missing.slice(i,i+10),vectors=await ports.embed(group.map(key=>unique.get(key)!));
  if(vectors.length!==group.length||vectors.some(v=>!validVector(v)))throw new Error('Invalid embedding response');
  const rows=group.map((key,j)=>({key,vector:vectors[j]}));await ports.write(rows);for(const r of rows)values.set(r.key,r.vector);
 }
 return new Map(entries.map(e=>[e.id,values.get(embeddingKey(model,e.text))!]));
}
