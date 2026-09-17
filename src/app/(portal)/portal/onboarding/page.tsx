import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, PartyPopper } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOnboardingStatus } from "@/lib/onboarding";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { SkipOnboardingButton } from "@/components/portal/SkipOnboardingButton";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const status = await getOnboardingStatus(session.user.organizationId);
  const progressPct = status.totalCount > 0 ? Math.round((status.completedCount / status.totalCount) * 100) : 100;

  return (
    <div>
      <PageHeader
        title="Configuración inicial"
        description={`${status.completedCount} de ${status.totalCount} pasos completados`}
      />

      {status.allDone ? (
        <Card className="mb-6 border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-center gap-2 p-4 text-sm font-semibold text-emerald-800">
            <PartyPopper className="h-4 w-4" />
            ¡Todo listo! Tu organización completó la configuración inicial.
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <SkipOnboardingButton className="flex-shrink-0" />
        </div>
      )}

      {status.steps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-400">
            Tu organización aún no tiene módulos habilitados — contacta a tu representante de Reymen.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {status.steps.map((step) => (
            <Card key={step.id} className={step.completed ? "border-emerald-200 bg-emerald-50" : undefined}>
              <CardContent className="flex items-center gap-4 p-4">
                {step.completed ? (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 flex-shrink-0 text-slate-300" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{step.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
                </div>
                {!step.completed && (
                  <Link
                    href={step.href}
                    className="flex flex-shrink-0 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    {step.ctaLabel} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export const metadata = { title: "Configuración inicial" };
