"use client";

import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { usePreferences } from "@/context/preferences";
import type { Strings } from "@/lib/i18n";

type StatusVariant = BadgeProps["variant"];

const STATUS_VARIANT: Record<string, StatusVariant> = {
  NEW: "info",
  CONTACTED: "secondary",
  QUALIFIED: "default",
  PROPOSAL: "warning",
  WON: "success",
  LOST: "destructive",
  ACTIVE: "success",
  PAUSED: "secondary",
  ERROR: "destructive",
  ARCHIVED: "outline",
  OPEN: "info",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  CLOSED: "secondary",
  ESCALATED: "destructive",
  SCHEDULED: "info",
  CONFIRMED: "success",
  CANCELLED: "destructive",
  COMPLETED: "success",
  NO_SHOW: "warning",
  PENDING: "warning",
  SUCCESS: "success",
  FAILED: "destructive",
  RETRYING: "warning",
  PROCESSING: "info",
  PROCESSED: "success",
};

const STATUS_KEY: Record<string, keyof Strings> = {
  NEW: "statusNew",
  CONTACTED: "statusContacted",
  QUALIFIED: "statusQualified",
  PROPOSAL: "statusProposal",
  WON: "statusWon",
  LOST: "statusLost",
  ACTIVE: "statusActive",
  PAUSED: "statusPaused",
  ERROR: "statusError",
  ARCHIVED: "statusArchived",
  OPEN: "statusOpen",
  IN_PROGRESS: "statusInProgress",
  RESOLVED: "statusResolved",
  CLOSED: "statusClosed",
  ESCALATED: "statusEscalated",
  SCHEDULED: "statusScheduled",
  CONFIRMED: "statusConfirmed",
  CANCELLED: "statusCancelled",
  COMPLETED: "statusCompleted",
  NO_SHOW: "statusNoShow",
  PENDING: "statusPending",
  SUCCESS: "statusSuccess",
  FAILED: "statusFailed",
  RETRYING: "statusRetrying",
  PROCESSING: "statusProcessing",
  PROCESSED: "statusProcessed",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = usePreferences();
  const key = STATUS_KEY[status];
  const label = key ? t[key] : status;
  const variant = STATUS_VARIANT[status] ?? "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}
