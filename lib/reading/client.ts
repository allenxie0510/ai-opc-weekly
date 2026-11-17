'use client';
import { trackAnalytics } from '@/lib/analytics-client';
let initialized: Promise<void> | null = null;
let queue:Promise<unknown>=Promise.resolve();
export function trackReading(kind:string,contentId:string,extra:Record<string,string>={}) : Promise<boolean> {
  if(typeof window==='undefined'||navigator.doNotTrack==='1'||(navigator as Navigator & {globalPrivacyControl?:boolean}).globalPrivacyControl)return Promise.resolve(false);
  const channel=new URLSearchParams(window.location.search).get('from')||'direct';
  const send=async()=>{try{initialized ||= trackAnalytics('visit'); await initialized;const r=await fetch('/api/reading/events',{method:'POST',credentials:'same-origin',keepalive:true,signal:AbortSignal.timeout(4000),headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,contentId,channel,...extra})});if(!r.ok)return false;const data=await r.json();return data.recorded===true;}catch{return false;}};
  const result=queue.then(send,send);queue=result;return result;
}
