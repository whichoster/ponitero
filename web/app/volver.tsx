import type { ComponentProps } from 'react';

export function Volver({ etiqueta = 'Volver', ...props }: Omit<ComponentProps<'button'>, 'children'> & { etiqueta?: string }) {
  return <button {...props} type="button" className="secondary volver" aria-label={etiqueta} title={etiqueta}>
    <span aria-hidden="true">↶</span>
  </button>;
}
