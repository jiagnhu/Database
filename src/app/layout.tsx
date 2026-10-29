import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'知衡 · CPV 私有资料库',description:'查阅中英对照资料，依据原文学习房地产估值。',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
