export type Role = 'reader' | 'editor' | 'admin';
export interface Pair { id:string; en:string; zh:string; kind:string }
export interface Section { id:string; title:string; source:string; pairs:Pair[]; figures?:{caption:string;data:string}[] }
export interface DocumentSummary { id:string; title:string; filename:string; type:string; subtitle:string; version:number; status:string; sourcePages:number; sourceDate:string|null; pairCount?:number; createdAt?:string; errorCode?:string|null; hasOriginal?:boolean }
export interface DocumentDetail extends DocumentSummary { sections:Section[] }
export interface Evidence { id:string; documentId:string; documentTitle:string; filename:string; source:string; sectionId:string; pairIds:string[]; en:string; zh:string; version:number; score:number; sourceDate?:string|null }
export interface Answer { found:boolean; paragraphs:{text:string;citations:string[]}[]; followups:string[] }
export interface ChatResult { requestId:string; conversationId?:string; answer:Answer; sources:Evidence[]; model:string; usage:{input:number;output:number}; retrieval:'hybrid'|'keyword' }
export interface SessionInfo { mode:'preview'|'connected'; user?:{id:string;email:string;role:Role}; organization?:{id:string;name:string}; configured:boolean; aiReady:boolean; adminReady:boolean }
