"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface ClientRowProps {
  client: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    isActive: boolean;
    createdAt: Date;
    _count: { leads: number; automations: number };
  };
  viewDetailLabel: string;
  statusActiveLabel: string;
  inactiveLabel: string;
}

export function ClientRow({ client, viewDetailLabel, statusActiveLabel, inactiveLabel }: ClientRowProps) {
  const router = useRouter();

  return (
    <tr
      onClick={() => router.push(`/admin/clients/${client.id}`)}
      className="cursor-pointer hover:bg-slate-50 transition-colors"
    >
      <td className="px-4 py-3">
        <p className="font-medium text-slate-900">{client.name}</p>
        <p className="text-xs text-slate-400">{client.slug}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant="secondary" className="capitalize">{client.plan}</Badge>
      </td>
      <td className="px-4 py-3 text-slate-700">{client._count.leads}</td>
      <td className="px-4 py-3 text-slate-700">{client._count.automations}</td>
      <td className="px-4 py-3">
        <Badge variant={client.isActive ? "success" : "destructive"}>
          {client.isActive ? statusActiveLabel : inactiveLabel}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(client.createdAt)}</td>
      <td className="px-4 py-3">
        <Link
          href={`/admin/clients/${client.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          {viewDetailLabel} <ExternalLink className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}
