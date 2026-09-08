'use client';
import { useEffect, useRef, useState } from 'react';
import { KG_TO_LB } from '@/lib/onboarding-flow';

const TICK_WIDTH = 8;
export function WeightRuler({value,unit,min,max,onChange}:{value:number;unit:string;min:number;max:number;onChange:(value:number)=>void}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width,setWidth] = useState(390);
  const emitted = useRef<number | null>(null);
  const positioned = useRef<number | null>(null);
  const multiplier = unit === 'lbs' ? KG_TO_LB : 1;
  const first = Math.ceil(min * multiplier * 10);
  const last = Math.floor(max * multiplier * 10);
  const count = Math.max(0,last-first);

  useEffect(()=>{
    const el=viewport.current;
    if(!el)return;
    const observer=new ResizeObserver(()=>setWidth(el.clientWidth));
    observer.observe(el);
    // Trackpads scroll horizontally natively; mouse wheels move the same ruler.
    const wheel=(event:WheelEvent)=>{
      if(event.ctrlKey || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
      event.preventDefault();
      el.scrollLeft+=event.deltaY*(event.deltaMode===1?16:1);
    };
    el.addEventListener('wheel',wheel,{passive:false});
    return()=>{observer.disconnect();el.removeEventListener('wheel',wheel)};
  },[]);

  useEffect(()=>{
    const el=viewport.current;
    if(!el)return;
    if(emitted.current!==null && Math.abs(emitted.current-value)<.000001){emitted.current=null;return}
    const offset=Math.max(0,Math.min(count*TICK_WIDTH,(value*multiplier*10-first)*TICK_WIDTH));
    positioned.current=offset;
    el.scrollLeft=offset;
  },[value,multiplier,first,count]);

  return <div className="scroll-ruler">
    <div className="scroll-ruler-marker" aria-hidden="true"/>
    <div className="scroll-ruler-viewport" ref={viewport} tabIndex={0} role="slider" aria-label="Weight scale" aria-orientation="horizontal" aria-valuemin={first/10} aria-valuemax={last/10} aria-valuenow={+(value*multiplier).toFixed(1)} aria-valuetext={`${(value*multiplier).toFixed(1)} ${unit}`}
      onScroll={()=>{
        const el=viewport.current;if(!el)return;
        if(positioned.current!==null && Math.abs(el.scrollLeft-positioned.current)<1){positioned.current=null;return}
        positioned.current=null;
        const tick=Math.max(0,Math.min(count,Math.round(el.scrollLeft/TICK_WIDTH)));
        const next=(first+tick)/10/multiplier;
        if(Math.abs(next-value)>.000001){emitted.current=next;onChange(next)}
      }}
      onKeyDown={event=>{
        const el=viewport.current;if(!el)return;
        const move:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowDown:-1,ArrowUp:1,PageDown:-10,PageUp:10};
        if(event.key in move){event.preventDefault();el.scrollLeft+=move[event.key]*TICK_WIDTH}
        if(event.key==='Home'||event.key==='End'){event.preventDefault();el.scrollLeft=event.key==='Home'?0:count*TICK_WIDTH}
      }}>
      <div className="scroll-ruler-track" style={{width:count*TICK_WIDTH+width}} aria-hidden="true">
        <div className="scroll-ruler-ticks" style={{left:width/2,width:count*TICK_WIDTH+1,backgroundPosition:`${-first*TICK_WIDTH}px bottom`}}/>
      </div>
    </div>
  </div>;
}
