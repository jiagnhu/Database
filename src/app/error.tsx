'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="login-page"><div className="login-card"><h1>页面暂时无法打开</h1><p>请重试。若仍失败，请检查本地服务和配置。</p><button className="primary" onClick={reset}>重新加载</button></div></main>;}
