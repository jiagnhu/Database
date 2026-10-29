import { searchDocuments } from '@/lib/repository';
import { json,failure } from '@/lib/http';
import { z } from 'zod';
export async function GET(req:Request){try{const url=new URL(req.url);const q=z.string().trim().min(2).max(300).parse(url.searchParams.get('q'));const document=url.searchParams.get('document');return json({results:await searchDocuments(q,document?z.uuid().parse(document):undefined)});}catch(e){return failure(e);}}
