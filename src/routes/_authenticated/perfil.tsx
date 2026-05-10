import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Save, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [nome, setNome] = useState("");
  const [crm, setCrm] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [clinicaNome, setClinicaNome] = useState("");
  const [clinicaEndereco, setClinicaEndereco] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setNome(profile.nome ?? "");
      setCrm(profile.crm ?? "");
      setEspecialidade(profile.especialidade ?? "");
      setClinicaNome(profile.clinica_nome ?? "");
      setClinicaEndereco(profile.clinica_endereco ?? "");
    }
  }, [profile]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!nome.trim() || !crm.trim()) return toast.error("Nome e CRM são obrigatórios");
    setBusy(true);
    const { error } = await supabase.from("profiles").update({
      nome: nome.trim(),
      crm: crm.trim(),
      especialidade: especialidade.trim() || null,
      clinica_nome: clinicaNome.trim() || null,
      clinica_endereco: clinicaEndereco.trim() || null,
    }).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success("Perfil atualizado");
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-1">Dados do Médico</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Estas informações aparecerão no cabeçalho e na assinatura dos atestados.
        </p>
        <form className="space-y-4" onSubmit={salvar}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>CRM *</Label>
              <Input value={crm} onChange={(e) => setCrm(e.target.value)} placeholder="Ex: CRM-MG 12345" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Especialidade</Label>
            <Input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} placeholder="Ex: Clínica Geral" />
          </div>
          <div className="space-y-2">
            <Label>Nome da clínica / consultório</Label>
            <Input value={clinicaNome} onChange={(e) => setClinicaNome(e.target.value)} placeholder="Ex: Clínica Saúde Plena" />
          </div>
          <div className="space-y-2">
            <Label>Endereço da clínica</Label>
            <Textarea
              rows={2}
              value={clinicaEndereco}
              onChange={(e) => setClinicaEndereco(e.target.value)}
              placeholder="Ex: Rua das Flores, 123 - Centro, São Paulo - SP"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <Save className="h-4 w-4 mr-1" /> {busy ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
