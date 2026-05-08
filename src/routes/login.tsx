import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Stethoscope } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, signIn, signUp, loading } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-secondary p-4">
      <Card className="w-full max-w-md p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-primary text-primary-foreground rounded-full p-3 mb-3">
            <Stethoscope className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">MedAtesta</h1>
          <p className="text-sm text-muted-foreground mt-1">Atestados com validação por QR Code</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Cadastrar</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form
              className="space-y-4 mt-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setBusy(true);
                const { error } = await signIn(String(fd.get("email")), String(fd.get("password")));
                setBusy(false);
                if (error) toast.error(error);
                else nav({ to: "/dashboard" });
              }}
            >
              <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" required /></div>
              <div className="space-y-2"><Label>Senha</Label><Input name="password" type="password" required /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form
              className="space-y-4 mt-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setBusy(true);
                const { error } = await signUp(
                  String(fd.get("email")),
                  String(fd.get("password")),
                  String(fd.get("nome")),
                  String(fd.get("crm")),
                );
                setBusy(false);
                if (error) toast.error(error);
                else toast.success("Cadastro realizado! Verifique seu email para confirmar.");
              }}
            >
              <div className="space-y-2"><Label>Nome completo</Label><Input name="nome" required /></div>
              <div className="space-y-2"><Label>CRM</Label><Input name="crm" required placeholder="123456/SP" /></div>
              <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" required /></div>
              <div className="space-y-2"><Label>Senha</Label><Input name="password" type="password" required minLength={6} /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
