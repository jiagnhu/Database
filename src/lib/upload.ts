import { z } from 'zod';

export const uploadTypes={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'} as const;
export const uploadSchema=z.object({
  filename:z.string().min(1).max(200),size:z.number().int().min(1).max(20*1024*1024),mime:z.string().max(150),sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(input=>{
  const ext=input.filename.split('.').at(-1)?.toLowerCase() as keyof typeof uploadTypes;
  return Object.hasOwn(uploadTypes,ext)&&(!input.mime||input.mime==='application/octet-stream'||input.mime===uploadTypes[ext]);
},{message:'只支持 20 MB 以内的 PDF、DOCX、PPTX 文件。'});
export type UploadTicket={id:string;alreadyUploaded:true}|{id:string;alreadyUploaded?:false;path:string;token:string;url:string;publicKey:string;contentType:string};
