export const REPORT_VERSION: number;
export const REPORT_DIMENSIONS: Record<string,string>;
export const REPORT_SECTIONS: Record<string,string>;
export interface WeeklyReport {
 version:1; headline:string; dek:string; verdict:string; score:number;
 dimensions:Record<string,number>; analysis:Record<string,string>;
 facts:{claim:string;quote:string;source_id:string}[];
 sources:{id:string;title:string;url:string;published_at:string|null;accessed_at:string}[];
 plan:{period:string;action:string;signal:string;stop:string}[];
 risks:{risk:string;test:string}[]; takeaways:string[]; open_questions:string[];
 generated_at:string; model:string; evidence_note:string;
}
export function isWeeklyReport(value:unknown):value is WeeklyReport;
export function weeklyDeliveryReady(items:unknown):boolean;
