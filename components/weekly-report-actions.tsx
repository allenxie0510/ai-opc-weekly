'use client';
import { useState } from 'react';
import type { NewsItem } from '@/lib/types';
import { BookmarkBtn } from './article-card';
export function ReportActions({item}:{item:NewsItem}) {
 const [copied,setCopied]=useState(false);
 return <div className="wr-actions"><BookmarkBtn item={item}/><span>收藏研究</span><button onClick={()=>window.print()}>打印 / 保存 PDF</button><button onClick={async()=>{try{await navigator.clipboard.writeText(window.location.href);setCopied(true);}catch{setCopied(false);}}}>{copied?'链接已复制':'复制报告链接'}</button></div>;
}
