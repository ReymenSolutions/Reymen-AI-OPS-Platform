"use client";

import { useState } from "react";
import { MessageSquare, FlaskConical, Split } from "lucide-react";
import { cn } from "@/lib/utils";
import { SandboxPanel } from "./SandboxPanel";
import { TestCasesPanel } from "./TestCasesPanel";
import { ExperimentsPanel } from "./ExperimentsPanel";
import { usePreferences } from "@/context/preferences";
import type {
  Prompt, PromptVersion, AiSandboxSession, PromptTestCase, PromptTestCaseResult,
  PromptExperiment, PromptExperimentSample,
} from "@prisma/client";

export type PromptWithVersions = Prompt & { versions: PromptVersion[] };
type SandboxSessionListItem = AiSandboxSession & { _count: { messages: number } };
type TestCaseWithResults = PromptTestCase & { results: PromptTestCaseResult[] };
type ExperimentWithDetail = PromptExperiment & {
  variantA: PromptVersion;
  variantB: PromptVersion;
  samples: PromptExperimentSample[];
};

interface AiLabWorkspaceProps {
  prompts: PromptWithVersions[];
  initialSessions: SandboxSessionListItem[];
  initialTestCases: TestCaseWithResults[];
  initialExperiments: ExperimentWithDetail[];
}

type Tab = "sandbox" | "test-cases" | "experiments";

const TABS_ES: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "sandbox", label: "Sandbox", icon: MessageSquare },
  { id: "test-cases", label: "Casos de prueba", icon: FlaskConical },
  { id: "experiments", label: "Experimentos A/B", icon: Split },
];

const TABS_EN: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "sandbox", label: "Sandbox", icon: MessageSquare },
  { id: "test-cases", label: "Test cases", icon: FlaskConical },
  { id: "experiments", label: "A/B experiments", icon: Split },
];

export function AiLabWorkspace({ prompts, initialSessions, initialTestCases, initialExperiments }: AiLabWorkspaceProps) {
  const { lang } = usePreferences();
  const TABS = lang === "es" ? TABS_ES : TABS_EN;
  const [tab, setTab] = useState<Tab>("sandbox");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "sandbox" && <SandboxPanel prompts={prompts} initialSessions={initialSessions} />}
      {tab === "test-cases" && <TestCasesPanel prompts={prompts} initialTestCases={initialTestCases} />}
      {tab === "experiments" && <ExperimentsPanel prompts={prompts} initialExperiments={initialExperiments} />}
    </div>
  );
}
