import { NextResponse } from 'next/server';
import { getWeeklyIssues } from '@/lib/data';

export async function GET() {
  try {
    const issues = await getWeeklyIssues();
    return NextResponse.json({ issues }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 });
  }
}
