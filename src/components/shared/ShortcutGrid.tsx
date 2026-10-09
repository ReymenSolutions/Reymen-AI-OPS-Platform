import Link from "next/link";
import { cn } from "@/lib/utils";

export interface ShortcutItem {
  key: string;
  href: string;
  icon: React.ElementType;
  title: string;
  hint: string;
}

/**
 * Cuadrícula de atajos de Inicio. En celular va de 2 en 2; si el número es
 * impar, el último se extiende a lo ancho para no dejar un hueco vacío.
 */
export function ShortcutGrid({ items }: { items: ShortcutItem[] }) {
  const odd = items.length % 2 === 1;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((s, i) => {
        const wide = odd && i === items.length - 1;
        return (
          <Link
            key={s.key}
            href={s.href}
            className={cn(
              "group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm",
              wide && "col-span-2 flex-row items-center sm:col-span-1 sm:flex-col sm:items-stretch"
            )}
          >
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-100">
              <s.icon className="h-6 w-6" />
            </span>
            <span>
              <span className="block font-semibold text-slate-900">{s.title}</span>
              <span className="block text-sm text-slate-500">{s.hint}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
