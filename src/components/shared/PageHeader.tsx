import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Título de la página y sus acciones. En celular las acciones bajan debajo
 * del título y se acomodan en varias filas, para que ningún botón quede
 * fuera de la pantalla.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 break-words">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 break-words">{description}</p>}
      </div>
      {actions && (
        // [&>div]: muchas páginas envuelven sus botones en su propio div flex; también debe acomodarse en filas.
        <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:justify-end [&>div]:flex-wrap">{actions}</div>
      )}
    </div>
  );
}
