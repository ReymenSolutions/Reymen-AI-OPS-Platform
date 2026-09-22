"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Webhook, Copy, Eye, EyeOff, Loader2, RotateCcw, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { usePreferences } from "@/context/preferences";
import { rotateOrgWebhookSecret, rotateFoodPosReadKey } from "@/actions/admin/clients";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }
  return { copied, copy };
}

function CopyButton({ text, copyKey }: { text: string; copyKey: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      onClick={() => copy(text, copyKey)}
      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-brand-600 transition-colors"
      title="Copiar"
    >
      {copied === copyKey ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

const ENDPOINTS = [
  "/api/webhooks/n8n/leads",
  "/api/webhooks/n8n/conversations",
  "/api/webhooks/n8n/scoring",
  "/api/v1/knowledge-base (X-Api-Key)",
];

export function OrgWebhookInfoDialog({
  orgId,
  secret,
  foodPosReadKey = null,
  showFoodPosKey = false,
}: {
  orgId: string;
  secret: string;
  foodPosReadKey?: string | null;
  showFoodPosKey?: boolean;
}) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [secretVisible, setSecretVisible] = useState(false);
  const [currentSecret, setCurrentSecret] = useState(secret);
  const [rotating, startRotate] = useTransition();

  const [posKeyVisible, setPosKeyVisible] = useState(false);
  const [currentPosKey, setCurrentPosKey] = useState(foodPosReadKey);
  const [rotatingPosKey, startRotatePosKey] = useTransition();

  function handleRotate() {
    startRotate(async () => {
      try {
        const res = await rotateOrgWebhookSecret(orgId);
        setCurrentSecret(res.secret);
        toast.success(t.adminWebhookRotated);
      } catch {
        toast.error(t.adminWebhookRotateError);
      }
    });
  }

  function handleRotatePosKey() {
    startRotatePosKey(async () => {
      try {
        const res = await rotateFoodPosReadKey(orgId);
        setCurrentPosKey(res.secret);
        setPosKeyVisible(true);
        toast.success(t.adminFoodPosKeyRotated);
      } catch {
        toast.error(t.adminFoodPosKeyRotateError);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <KeyRound className="h-4 w-4 mr-2" />
        {t.adminOrgWebhookBtn}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-brand-600" />
              {t.adminOrgWebhookTitle}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <p className="text-xs text-slate-500">{t.adminOrgWebhookDesc}</p>

            <div className="rounded-md border border-slate-200 divide-y divide-slate-100">
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-medium text-slate-700">{t.adminOrgWebhookOrgIdLabel}</code>
                  <p className="text-xs text-slate-400 mt-0.5 break-all">{orgId}</p>
                </div>
                <CopyButton text={orgId} copyKey="orgid" />
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0 flex-1">
                  <code className="text-xs font-medium text-slate-700">{t.adminOrgWebhookSecretLabel}</code>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono break-all">
                    {secretVisible ? currentSecret : "•".repeat(20)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setSecretVisible((v) => !v)}
                    className="text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {secretVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <CopyButton text={currentSecret} copyKey="secret" />
                  <button
                    onClick={handleRotate}
                    disabled={rotating}
                    className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
                  >
                    {rotating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    <span>{t.adminWebhookRotateBtn}</span>
                  </button>
                </div>
              </div>
            </div>

            {showFoodPosKey && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t.adminFoodPosKeyLabel}
                </Label>
                <p className="text-xs text-slate-500">{t.adminFoodPosKeyDesc}</p>
                <div className="rounded-md border border-slate-200">
                  <div className="flex items-center justify-between px-3 py-2.5 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-400 font-mono break-all">
                        {currentPosKey ? (posKeyVisible ? currentPosKey : "•".repeat(20)) : t.adminFoodPosKeyEmpty}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {currentPosKey && (
                        <>
                          <button
                            onClick={() => setPosKeyVisible((v) => !v)}
                            className="text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            {posKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <CopyButton text={currentPosKey} copyKey="foodPosKey" />
                        </>
                      )}
                      <button
                        onClick={handleRotatePosKey}
                        disabled={rotatingPosKey}
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 transition-colors disabled:opacity-50"
                      >
                        {rotatingPosKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        <span>{currentPosKey ? t.adminWebhookRotateBtn : t.adminFoodPosKeyGenerateBtn}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {t.adminOrgWebhookEndpointsLabel}
              </Label>
              <ul className="space-y-1">
                {ENDPOINTS.map((ep) => (
                  <li key={ep}>
                    <code className="text-xs text-slate-600 bg-slate-50 rounded px-1.5 py-0.5">{ep}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
