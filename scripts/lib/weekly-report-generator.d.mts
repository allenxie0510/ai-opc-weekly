import type { NewsItem } from '../../lib/types';
export function generateReport(material:Record<string,unknown>,options?:{maxAttempts?:number}):Promise<{ok:true;item:NewsItem}|{ok:false;reason:string}>;
