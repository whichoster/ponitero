import type { ReactNode } from 'react';
import './style.css';
import Panel from './panel';

export const metadata = { title: 'ponitero', description: 'Control de viajes agrícolas' };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es-MX"><body><Panel />{children}</body></html>;
}
