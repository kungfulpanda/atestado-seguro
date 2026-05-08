import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Stethoscope } from "lucide-react";

export const Route = createFileRoute("/validar/$id")({
  component: Validar,
  head: () => ({
    meta: [
      { title: "Validar Atestado — MedAtesta" },
      { name: "description", content: "Validação pública de atestado médico." },
    ],
  }),
});

type A = {
  id: string;
  nome_paciente: string;
  data_atendimento: string;
  dias: number;
  medico_nome: string;
  medico_crm: string;
  created_at: string;
};

function Validar() {
  const { id } = Route.useParams();
  const [state, setState] = useState<{ loading: boolean; data: A | null }>({ loading: true, data: null });

  useEffect(() => {
    supabase.from("atestados")
      .select("id,nome_paciente,data_atendimento,dias,medico_nome,medico_crm,created_at")
      .eq("id", id).maybeSingle()
      .then(({ data }) => setState({ loading: false, data: data as A | null }));
  }, [id]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary flex items-center justify-center p-4">
      <Card className="w-full max-w-lg p-8 shadow-2xl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Stethoscope className="h-4 w-4" /> MedAtesta · Validação
        </div>

        {state.loading ? (
          <p className="text-muted-foreground">Verificando autenticidade...</p>
        ) : !state.data ? (
          <div className="text-center py-6">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-3" />
            <h1 className="text-xl font-bold mb-1">Atestado inválido</h1>
            <p className="text-muted-foreground">Atestado não encontrado ou inválido.</p>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-3" />
              <h1 className="text-xl font-bold">Atestado válido</h1>
              <p className="text-sm text-muted-foreground">Documento autêntico emitido pelo sistema.</p>
            </div>
            <dl className="space-y-3 border-t pt-4">
              <Field label="Paciente" value={state.data.nome_paciente} />
              <Field label="Data do atendimento" value={new Date(state.data.data_atendimento + "T00:00").toLocaleDateString("pt-BR")} />
              <Field label="Dias de afastamento" value={`${state.data.dias} dia(s)`} />
              <Field label="Médico" value={`Dr(a). ${state.data.medico_nome}`} />
              <Field label="CRM" value={state.data.medico_crm} />
              <Field label="Emitido em" value={new Date(state.data.created_at).toLocaleString("pt-BR")} />
              <Field label="ID" value={state.data.id} mono />
            </dl>
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm font-medium text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
