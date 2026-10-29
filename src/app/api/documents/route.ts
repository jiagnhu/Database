import { listDocuments } from '@/lib/repository';
import { json,failure } from '@/lib/http';
export async function GET(){try{return json({documents:await listDocuments()});}catch(e){return failure(e);}}
