export function weeklyOptions(briefs:{slug:string}[],legacy:{slug:string;issue_number:number;week_start:string}[]){
 const base=Math.max(0,...legacy.map(i=>i.issue_number));
 const numbered=[...briefs].sort((a,b)=>a.slug.localeCompare(b.slug)).map((b,index)=>({url:`/briefs/${b.slug}`,label:`第 ${base+index+1} 期 · ${b.slug}`,date:b.slug}));
 return [...numbered,...legacy.map(b=>({url:`/weekly/${b.slug}`,label:`第 ${b.issue_number} 期 · ${b.week_start}`,date:b.week_start}))].sort((a,b)=>b.date.localeCompare(a.date)||Number(b.url.startsWith('/briefs/'))-Number(a.url.startsWith('/briefs/')));
}
