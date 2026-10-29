import { getDocument } from '@/lib/repository';
import { requireUser,checkDb } from '@/lib/supabase';
import { json,failure,jsonBody,sameOrigin } from '@/lib/http';
import { z } from 'zod';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,ctx:Context){try{return json(await getDocument(z.uuid().parse((await ctx.params).id)));}catch(e){return failure(e);}}
export async function PATCH(req:Request,ctx:Context){try{sameOrigin(req);const {db,orgId}=await requireUser('editor');const {action}=z.object({action:z.enum(['publish','archive','retry'])}).parse(await jsonBody(req));const {error}=await db.rpc('cpv_document_action',{p_org:orgId,p_document:z.uuid().parse((await ctx.params).id),p_action:action});checkDb(error);return json({ok:true});}catch(e){return failure(e);}}
