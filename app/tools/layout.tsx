import './product-radar.css';
import { notFound } from 'next/navigation';
import { isToolsEnabled } from '@/lib/product-radar/config';

export default function ToolsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!isToolsEnabled()) notFound();
  return children;
}
