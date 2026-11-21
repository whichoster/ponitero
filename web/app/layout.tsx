import type { ReactNode } from 'react';
import './style.css';

export const metadata = { title: 'ponitero', description: 'Control de viajes agrícolas' };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="es-MX"><body>{children}</body></html>;
}
