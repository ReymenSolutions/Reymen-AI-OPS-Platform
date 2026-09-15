"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { start2FAEnrollment, confirm2FAEnrollment, disable2FA } from "@/actions/two-factor";

type Step = "idle" | "enrolling" | "backup-codes";

export function TwoFactorSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [step, setStep] = useState<Step>("idle");
  const [loading, setLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState("");

  async function handleStart() {
    setLoading(true);
    try {
      const result = await start2FAEnrollment();
      setQrCodeDataUrl(result.qrCodeDataUrl);
      setManualSecret(result.secret);
      setStep("enrolling");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al iniciar la configuración");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const result = await confirm2FAEnrollment(code);
      setBackupCodes(result.backupCodes);
      setStep("backup-codes");
      setEnabled(true);
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Código inválido");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisable() {
    setLoading(true);
    try {
      await disable2FA(password);
      setEnabled(false);
      setDisableOpen(false);
      setPassword("");
      toast.success("2FA desactivado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al desactivar");
    } finally {
      setLoading(false);
    }
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (step === "backup-codes") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">Guarda tus códigos de respaldo</p>
          <p className="mt-1 text-xs text-amber-700">
            Úsalos si pierdes acceso a tu app autenticadora. Cada uno funciona una sola vez y no volverán a mostrarse.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-4 font-mono text-sm text-slate-100">
          {backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyBackupCodes} className="flex-1">
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar códigos"}
          </Button>
          <Button onClick={() => setStep("idle")} className="flex-1">Ya los guardé</Button>
        </div>
      </div>
    );
  }

  if (step === "enrolling") {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          {qrCodeDataUrl && (
            <Image src={qrCodeDataUrl} alt="Código QR para 2FA" width={180} height={180} unoptimized className="rounded-lg border border-slate-200" />
          )}
          <div className="w-full space-y-1.5">
            <Label className="text-xs">¿No puedes escanear? Ingresa esta clave manualmente</Label>
            <Input readOnly value={manualSecret} className="font-mono text-xs" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="totp-confirm">Código de tu app autenticadora</Label>
          <Input
            id="totp-confirm"
            inputMode="numeric"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep("idle")} className="flex-1">Cancelar</Button>
          <Button onClick={handleConfirm} disabled={loading || code.length !== 6} className="flex-1">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verificar y activar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {enabled ? (
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
        ) : (
          <ShieldOff className="h-8 w-8 text-slate-300" />
        )}
        <div>
          <p className="text-sm font-medium text-slate-900">
            {enabled ? "2FA activado" : "2FA desactivado"}
          </p>
          <p className="text-xs text-slate-500">
            {enabled
              ? "Tu cuenta requiere un código de tu app autenticadora al iniciar sesión."
              : "Añade una capa extra de seguridad a tu cuenta de administrador."}
          </p>
        </div>
      </div>

      {enabled ? (
        <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDisableOpen(true)}>
          Desactivar
        </Button>
      ) : (
        <Button onClick={handleStart} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Activar 2FA
        </Button>
      )}

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar 2FA</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="disable-password">Confirma tu contraseña</Label>
            <Input
              id="disable-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>Cancelar</Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleDisable}
              disabled={loading || !password}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Desactivar 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
