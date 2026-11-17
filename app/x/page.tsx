import {permanentRedirect} from 'next/navigation';
// X content is now in the unified reading entry; tracked-account filtering lives in reading/data.ts.
export const dynamic='force-dynamic';
export const revalidate=0;
export default function LegacyXTimeline(){permanentRedirect('/news?view=all&source=x');}
