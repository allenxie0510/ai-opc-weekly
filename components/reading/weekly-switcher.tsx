'use client';
import {useRouter} from 'next/navigation';
import Link from 'next/link';
export function WeeklySwitcher({current,options}:{current:string;options:{url:string;label:string}[]}){
 const router=useRouter();const index=options.findIndex(o=>o.url===current);
 return <nav className="brief-switcher" aria-label="周报期数"><Link href="/weekly">最新一期</Link><label>历史周报<select aria-label="切换周报期数" value={current} onChange={e=>router.push(e.target.value)}>{!current&&<option value="">选择一期周报</option>}{options.map(o=><option key={o.url} value={o.url}>{o.label}</option>)}</select></label>{index>=0&&options[index+1]&&<Link href={options[index+1].url}>上一期 →</Link>}</nav>;
}
