"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, KeyRound, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requestPasswordReset } from "@/actions/password-reset";

const schema = z.object({ email: z.string().email("Email inválido") });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      await requestPasswordReset(data.email);
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <Card className="w-full max-w-sm shadow-2xl border-0">
      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 shadow-lg">
          <KeyRound className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
        <CardDescription>
          {sent
            ? "Revisa tu correo para continuar"
            : "Te enviaremos un enlace para restablecerla"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="text-sm text-slate-500">
              Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="tu@empresa.com" {...register("email")} autoFocus />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar enlace
            </Button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        >
          <ArrowLeft className="h-3 w-3" /> Volver a iniciar sesión
        </Link>
      </CardContent>
    </Card>
  );
}
