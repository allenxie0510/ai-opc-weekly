export const MARKET_LABELS: Record<string, string>;
export const BUSINESS_LABELS: Record<string, string>;
export const QUESTION_LABELS: Record<string, string>;
export interface EditorialBrief {
  version: number;
  operating_market: string;
  market_quote: string;
  business_form: string;
  answers: Record<string, { answer: string; basis: string; quote: string }>;
  source_url: string;
  rights_basis: string;
  evidence_grade: string;
  evidence_note: string;
}
export function inferOperatingMarket(text: string): string;
export function publicSourceUrl(value: string): boolean;
export function canUseMaterial(material: Record<string, unknown>): boolean;
export function publishableBrief(brief: unknown): boolean;
export function candidateMix(materials: Record<string, unknown>[]): { counts: Record<string, number>; total: number; domestic_share: number; target: number; shortfall: number };
export function validateEditorialBrief(raw: unknown, material: Record<string, unknown>): { ok: boolean; reason?: string; brief?: EditorialBrief };
export const EDITORIAL_PROMPT: string;
export const EDITORIAL_BRIEF_TEMPLATE: Record<string, unknown>;
export function assertEditorialShape(items: Record<string, unknown>[]): void;
