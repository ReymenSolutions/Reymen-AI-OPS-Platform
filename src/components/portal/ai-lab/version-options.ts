import type { PromptWithVersions } from "./AiLabWorkspace";

const PROMPT_TYPE_LABELS: Record<string, string> = {
  SYSTEM: "Sistema",
  GREETING: "Saludo",
  LEAD_QUALIFICATION: "Calificación de leads",
  APPOINTMENT_BOOKING: "Agendamiento",
  FAQ: "FAQ",
  ESCALATION: "Escalación",
};

export interface VersionOption {
  id: string;
  promptId: string;
  promptType: string;
  label: string;
}

// Flattens every Prompt's version history into a single pickable list, used
// by the sandbox (pin a session to a draft), test cases, and experiments
// (pick two variants to compare).
export function versionOptions(prompts: PromptWithVersions[]): VersionOption[] {
  return prompts.flatMap((prompt) =>
    prompt.versions.map((version) => ({
      id: version.id,
      promptId: prompt.id,
      promptType: prompt.type,
      label: `${prompt.name} — v${version.version} (${PROMPT_TYPE_LABELS[prompt.type] ?? prompt.type})${version.isLatest ? "" : " (histórico)"}`,
    }))
  );
}

export function versionOptionsForType(prompts: PromptWithVersions[], promptType: string): VersionOption[] {
  return versionOptions(prompts).filter((o) => o.promptType === promptType);
}
