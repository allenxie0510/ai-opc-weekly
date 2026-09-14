import { lookup } from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import { isIP } from 'node:net';
import { stripHtml } from './feed-parser.mjs';
import { publicSourceUrl } from '../../lib/editorial-policy.mjs';
export function publicAddress(address) {
  if (isIP(address) === 4) return !/^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.|198\.(1[89])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/.test(address);
  // Accept only global IPv6 unicast; reject mapped IPv4 and local/multicast addresses.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}
export async function readPublicUrl(value, redirects = 0) {
  const url = new URL(value);
  if (!publicSourceUrl(value) || url.port && !['80','443'].includes(url.port) || redirects > 4) throw new Error('source-url-not-public');
  const addresses = await lookup(url.hostname, {all:true});
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw new Error('private-source-address');
  // Pin the checked address for this request, including every redirect.
  return new Promise((resolve,reject)=>{
    const req = (url.protocol==='https:'?https:http).get(url, {
      headers:{'User-Agent':'AI-OPC-Research/1.0 (+https://www.aiopcnews.com/about)','Accept':'text/html, application/json, application/rss+xml, application/atom+xml, text/xml'},
      lookup:(_host,opts,cb)=>opts?.all?cb(null,[addresses[0]]):cb(null,addresses[0].address,addresses[0].family),
    },res=>{
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume(); resolve(readPublicUrl(new URL(res.headers.location,url).href,redirects+1)); return;
      }
      if (res.statusCode!==200) { res.resume(); reject(new Error(`source-http-${res.statusCode}`)); return; }
      const chunks=[]; let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>1_500_000){res.destroy();reject(new Error('source-too-large'));}else chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>resolve({url:url.href,body:Buffer.concat(chunks).toString('utf8'),type:res.headers['content-type']||''}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('source-timeout')),12000);
    req.on('close',()=>clearTimeout(timer)); req.on('error',reject);
  });
}
export function extractSourceText(html) {
  const body = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
  const articles=[...body.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(m=>stripHtml(m[1])).sort((a,b)=>b.length-a.length);
  const main=stripHtml(body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]||'');
  // Product sites often use <article> for a tiny testimonial, not the page body.
  const text=articles[0]?.length>=800?articles[0]:main.length>=800?main:stripHtml(body);
  return text.slice(0,14000);
}
export async function enrichMaterial(material) {
  const result = await readPublicUrl(material.source_url);
  if (!/html|text/.test(result.type)) throw new Error('source-not-readable');
  const text = extractSourceText(result.body);
  if (text.length<150 || /just a moment|verify you are human|access denied/i.test(text.slice(0,300))) throw new Error('source-insufficient-text');
  return {...material, source_url:result.url, snippet:text, accessed_at:new Date().toISOString()};
}
