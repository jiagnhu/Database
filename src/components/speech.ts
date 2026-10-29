'use client';
import { useEffect,useRef,useState } from 'react';
export function useSpeech(){
 const [speaking,setSpeaking]=useState<string|null>(null),[message,setMessage]=useState(''),[rate,setRate]=useState(1);
 const current=useRef<SpeechSynthesisUtterance|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 function stop(){current.current=null;if(timer.current)clearTimeout(timer.current);window.speechSynthesis?.cancel();setSpeaking(null);}
 useEffect(()=>{try{setRate(localStorage.getItem('cpv-rate')==='0.8'?0.8:1);}catch{}const clear=()=>{current.current=null;window.speechSynthesis?.cancel();};window.addEventListener('pagehide',clear);return()=>{clear();if(timer.current)clearTimeout(timer.current);window.removeEventListener('pagehide',clear);};},[]);
 function changeRate(n:number){stop();setRate(n);try{localStorage.setItem('cpv-rate',String(n));}catch{}}
 function speak(id:string,text:string){
  if(speaking===id){stop();return;}stop();setMessage('');
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){setMessage('当前浏览器不支持朗读，请使用 Edge 或 Chrome。');return;}
  const utterance=new SpeechSynthesisUtterance(text),voices=window.speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang));
  const voice=voices.find(v=>v.localService&&v.lang==='en-AU')||voices.find(v=>v.localService)||voices[0];
  utterance.lang=voice?.lang||'en-US';if(voice)utterance.voice=voice;else setMessage('未找到英文音色，将尝试按英语朗读；发音不自然时可安装系统英语语音包。');
  utterance.rate=rate;current.current=utterance;setSpeaking(id);
  utterance.onstart=()=>{if(current.current===utterance&&timer.current)clearTimeout(timer.current);};
  utterance.onend=()=>{if(current.current===utterance)stop();};
  utterance.onerror=e=>{if(current.current!==utterance)return;stop();if(!['canceled','interrupted'].includes(e.error))setMessage('英文朗读失败，请检查音色或音频输出。');};
  timer.current=setTimeout(()=>{if(current.current===utterance){stop();setMessage('语音未能启动，请重试或换用支持朗读的浏览器。');}},12000);
  window.speechSynthesis.speak(utterance);
 }
 return {speaking,message,rate,changeRate,speak,stop};
}
