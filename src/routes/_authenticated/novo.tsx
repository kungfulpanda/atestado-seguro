import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { generateAtestadoPdf, downloadPdf } from "@/lib/atestado-pdf";

export const Route = createFileRoute("/_authenticated/novo")({
  component: NovoAtestado,
});

function NovoAtestado() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4 max-w-2xl">
      <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Link>
      <Card className="p-6">
        <h1 className="text-2xl font-bold mb-1">Novo Atestado</h1>
        <p className="text-sm text-muted-foreground mb-6">Preencha os dados para gerar o atestado.</p>

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!user || !profile) { toast.error("Perfil não carregado"); return; }
            const fd = new FormData(e.currentTarget);
            const nome_paciente = String(fd.get("nome_paciente")).trim();
            const data_atendimento = String(fd.get("data_atendimento"));
            const dias = Number(fd.get("dias"));
            const observacao = String(fd.get("observacao") || "").trim() || null;
            const cid = String(fd.get("cid") || "").trim() || null;

            if (!nome_paciente) return toast.error("Nome obrigatório");
            if (!(dias > 0)) return toast.error("Dias deve ser maior que 0");

            setBusy(true);
            const { data, error } = await supabase
              .from("atestados")
              .insert({
                medico_id: user.id,
                medico_nome: profile.nome,
                medico_crm: profile.crm,
                nome_paciente, data_atendimento, dias, observacao, cid,
              })
              .select("*").single();
            if (error || !data) {
              setBusy(false);
              toast.error(error?.message ?? "Erro ao salvar");
              return;
            }
            const url = `${window.location.origin}/validar/${data.id}`;
            const bytes = await generateAtestadoPdf(data, url);
            downloadPdf(bytes, `atestado-${nome_paciente.replace(/\s+/g, "_")}.pdf`);
            toast.success("Atestado gerado!");
            nav({ to: "/dashboard" });
          }}
        >
          <div className="space-y-2">
            <Label>Nome do paciente *</Label>
            <Input name="nome_paciente" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data do atendimento *</Label>
              <Input name="data_atendimento" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-2">
              <Label>Dias de afastamento *</Label>
              <Input name="dias" type="number" min={1} required defaultValue={1} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>CID (opcional)</Label>
            <Input name="cid" placeholder="Ex: J11" />
          </div>
          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea name="observacao" rows={4} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Gerando..." : "Gerar Atestado"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
