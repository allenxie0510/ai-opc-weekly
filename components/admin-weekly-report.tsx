'use client';
import {useState} from 'react';
import Link from 'next/link';
export function AdminWeeklyReport({id,ready}:{id:string;ready:boolean}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(ready);
 if(done)return <Link href={`/reports/${id}`} target="_blank" className="admin-btn">预览研究报告 ↗</Link>;
 return <span><button className="admin-btn" disabled={busy} onClick={async()=>{
  setBusy(true);setMessage('');
  try{const token=localStorage.getItem('ai_opc_admin_token')||'';const res=await fetch('/api/admin/weekly-report',{method:'POST',headers:{'Content-Type':'application/json','x-admin-token':token},body:JSON.stringify({id})});const data=await res.json();if(!res.ok)throw new Error(data.error);setDone(true);}catch(e){setMessage(e instanceof Error?e.message:'生成失败');}finally{setBusy(false);}
 }}>{busy?'正在读取原文并分析…':'生成完整研究报告'}</button>{message&&<small role="status" style={{display:'block',maxWidth:300}}>{message}</small>}</span>;
}
