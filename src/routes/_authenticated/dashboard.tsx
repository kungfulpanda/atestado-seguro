import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Eye, Download, FileText } from "lucide-react";
import { generateAtestadoPdf, downloadPdf, openPdf, type AtestadoData } from "@/lib/atestado-pdf";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Row = AtestadoData & { created_at: string };

function Dashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase.from("atestados").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data ?? []) as Row[]);
      });
  }, []);

  async function handle(a: Row, action: "view" | "download") {
    const url = `${window.location.origin}/validar/${a.id}`;
    const bytes = await generateAtestadoPdf(a, url);
    if (action === "view") openPdf(bytes);
    else downloadPdf(bytes, `atestado-${a.nome_paciente.replace(/\s+/g, "_")}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Atestados</h1>
          <p className="text-sm text-muted-foreground">Gerencie e emita atestados médicos</p>
        </div>
        <Link to="/novo"><Button><Plus className="h-4 w-4 mr-1" /> Novo Atestado</Button></Link>
      </div>

      {rows === null ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Nenhum atestado emitido ainda</p>
          <p className="text-sm text-muted-foreground mb-4">Comece criando seu primeiro atestado.</p>
          <Link to="/novo"><Button>Emitir agora</Button></Link>
        </Card>
      ) : (
        <Card className="divide-y">
          {rows.map((a) => (
            <div key={a.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium truncate">{a.nome_paciente}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(a.data_atendimento + "T00:00").toLocaleDateString("pt-BR")} · {a.dias} dia(s)
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => handle(a, "view")}>
                  <Eye className="h-4 w-4 mr-1" /> Visualizar
                </Button>
                <Button size="sm" onClick={() => handle(a, "download")}>
                  <Download className="h-4 w-4 mr-1" /> Baixar
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
