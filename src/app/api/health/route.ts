import { config,validateRuntime } from '@/lib/config';
import { json } from '@/lib/http';
export async function GET(){try{validateRuntime();return json({status:config.preview()?'preview':config.connected()?'configured':'not_configured'},config.connected()||config.preview()?200:503);}catch{return json({status:'not_ready'},503);}}
