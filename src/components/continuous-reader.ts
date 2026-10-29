'use client';
import { useEffect,useLayoutEffect,useRef,useState } from 'react';
import type { DocumentDetail } from '@/lib/types';

export function useContinuousReader(document:DocumentDetail|null){
 const reader=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null),current=useRef(0);
 const [section,setSection]=useState(0),[visibleCount,setVisibleCount]=useState(2);
 const [target,setTarget]=useState<{index:number;pairId?:string}|null>(null);
 function openAt(index:number,pairId?:string){current.current=index;setSection(index);setVisibleCount(index+2);setTarget({index,pairId});}
 function jump(index:number){
  if(!document||index<0||index>=document.sections.length)return;
  current.current=index;setSection(index);setVisibleCount(n=>Math.max(n,index+2));setTarget({index});
 }
 useLayoutEffect(()=>{
  const body=reader.current;if(!body||!document||!target)return;
  const element=target.pairId?window.document.getElementById(`pair-${target.pairId}`):body.querySelector<HTMLElement>(`[data-section-index="${target.index}"]`);
  if(element){
   const offset=target.pairId?Math.max(0,(body.clientHeight-element.clientHeight)/2):0;
   body.scrollTop+=element.getBoundingClientRect().top-body.getBoundingClientRect().top-offset;
  }else body.scrollTop=0;
  try{localStorage.setItem(`cpv-position-${document.id}`,String(target.index));}catch{}
  setTarget(null);
 },[document,target,visibleCount]);
 useEffect(()=>{
  const body=reader.current,edge=sentinel.current;
  if(!body||!edge||!document||visibleCount>=document.sections.length)return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting))setVisibleCount(n=>Math.min(document.sections.length,n+2));
  },{root:body,rootMargin:'0px 0px 600px 0px'});
  observer.observe(edge);return()=>observer.disconnect();
 },[document,visibleCount]);
 useEffect(()=>{
  const body=reader.current;if(!body||!document||target)return;
  let frame=0;
  const update=()=>{
   frame=0;const top=body.getBoundingClientRect().top+48;let index=0;
   for(const node of body.querySelectorAll<HTMLElement>('[data-section-index]')){
    if(node.getBoundingClientRect().top>top)break;
    index=Number(node.dataset.sectionIndex);
   }
   if(visibleCount>=document.sections.length&&body.scrollTop>0&&body.scrollHeight-body.clientHeight-body.scrollTop<2)index=Math.max(0,document.sections.length-1);
   if(index!==current.current){current.current=index;setSection(index);try{localStorage.setItem(`cpv-position-${document.id}`,String(index));}catch{}}
  };
  const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  body.addEventListener('scroll',onScroll,{passive:true});
  const resize=new ResizeObserver(onScroll);resize.observe(body);onScroll();
  return()=>{body.removeEventListener('scroll',onScroll);resize.disconnect();cancelAnimationFrame(frame);};
 },[document,visibleCount,target]);
 return {reader,sentinel,section,visibleCount,openAt,jump};
}
