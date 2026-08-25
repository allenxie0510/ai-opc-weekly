import './product-radar.css';
import { notFound } from 'next/navigation';
import { canAccessTools } from '@/lib/product-radar/access';

export const dynamic = 'force-dynamic';

export default async function ToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!(await canAccessTools())) notFound();
  return children;
}
