import 'server-only';
export const config={
  preview:()=>process.env.APP_MODE==='preview',
  connected:()=>!!(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.CPV_ORG_ID),
  ai:()=>!!process.env.DASHSCOPE_API_KEY,
  admin:()=>!!process.env.SUPABASE_SECRET_KEY,
  origin:()=>process.env.APP_ORIGIN||'http://localhost:3100',
};
export function validateRuntime(){
  if(config.preview()&&process.env.NODE_ENV==='production')throw new Error('PREVIEW_FORBIDDEN_IN_PRODUCTION');
  if(process.env.NODE_ENV==='production'){
    if(!config.connected()||!config.ai()||!config.admin())throw new Error('PRODUCTION_CONFIGURATION_INCOMPLETE');
    if(!config.origin().startsWith('https://'))throw new Error('PRODUCTION_HTTPS_REQUIRED');
  }
}
