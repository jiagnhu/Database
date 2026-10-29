import { NextRequest,NextResponse } from 'next/server';
import { config,validateRuntime } from './lib/config';
export function proxy(request:NextRequest){
  try{validateRuntime();}catch{return NextResponse.json({error:'服务器配置尚未完成。'},{status:503});}
  if(config.preview()&&!['localhost','127.0.0.1','[::1]'].includes(request.nextUrl.hostname))return new NextResponse('Preview is local only',{status:403});
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const csp=`default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${process.env.NODE_ENV==='development'?"'unsafe-eval'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${process.env.NODE_ENV==='development'?'ws:':''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`;
  const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
  const response=NextResponse.next({request:{headers}});response.headers.set('Content-Security-Policy',csp);response.headers.set('Cache-Control','private, no-store');
  if(process.env.NODE_ENV==='production')response.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  return response;
}
