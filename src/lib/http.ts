import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { config } from './config';
export class HttpError extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export function sameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(origin!==new URL(config.origin()).origin)throw new HttpError(403,'ORIGIN_REJECTED','请求来源不正确，请刷新后重试。');
  if(req.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'ORIGIN_REJECTED','跨站请求已拒绝。');
}
export async function jsonBody(req:Request,max=16000){
  const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'INVALID_BODY','请求内容为空。');
  let total=0;const chunks:Uint8Array[]=[];
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new HttpError(413,'BODY_TOO_LARGE','请求内容过长。');}chunks.push(value);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(400,'INVALID_JSON','请求格式不正确。');}
}
export function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export function failure(error:unknown,requestId=crypto.randomUUID()){
  if(error instanceof HttpError)return json({error:error.message,code:error.code,requestId},error.status);
  if(error instanceof ZodError)return json({error:'输入格式不正确，请检查后重试。',code:'INVALID_INPUT',requestId},400);
  console.error(JSON.stringify({event:'request_failed',requestId,errorType:error instanceof Error?error.name:'Unknown'}));
  return json({error:'服务暂时不可用，请稍后重试或联系管理员。',code:'INTERNAL_ERROR',requestId},500);
}
