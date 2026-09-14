import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
export const reviewKey=material=>createHash('sha256').update(JSON.stringify(['weekly-research-v2-anchored-rubric',material.source_url,material.title,material.snippet])).digest('hex');
export const cacheableRejection=reason=>reason==='editorial-reject'||/^below-weekly-bar-/.test(reason);
export function readWeeklyReviewCache(path){try{return path?JSON.parse(readFileSync(path,'utf8')):{};}catch{return {};}}
export function recentlyRejected(material,state,now=Date.now()){const t=state[reviewKey(material)];return typeof t==='number'&&t<=now&&t>now-7*86400000;}
export function rememberRejection(material,state,path,now=Date.now()){
 if(!path)return;
 state[reviewKey(material)]=now;
 const recent=Object.fromEntries(Object.entries(state).filter(([,t])=>typeof t==='number'&&t>now-7*86400000));
 writeFileSync(path,JSON.stringify(recent));
}
