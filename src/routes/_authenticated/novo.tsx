import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Sparkles, Loader2, Eye } from "lucide-react";
import { toast } from "sonner";
import { generateAtestadoPdf, downloadPdf, openPdf, type AtestadoTemplate } from "@/lib/atestado-pdf";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/novo")({
  component: NovoAtestado,
});

function NovoAtestado() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [dias, setDias] = useState(1);
  const [nomePaciente, setNomePaciente] = useState("");
  const [dataAtendimento, setDataAtendimento] = useState(new Date().toISOString().slice(0, 10));
  const [cid, setCid] = useState("");
  const [omitirCrm, setOmitirCrm] = useState(false);
  const [template, setTemplate] = useState<AtestadoTemplate>("amorsaude");
  const [upaLocal, setUpaLocal] = useState("");
  const [upaBusy, setUpaBusy] = useState(false);
  const [upaNome, setUpaNome] = useState<string | null>(null);
  const [upaEndereco, setUpaEndereco] = useState<string | null>(null);
  const [upaCidade, setUpaCidade] = useState<string | null>(null);

  const isUpa = template === "upa";

  async function buscarUpa() {
    if (!upaLocal.trim()) return toast.error("Informe a cidade/UF");
    setUpaBusy(true);
    try {
      const res = await fetch("/api/upa-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localizacao: upaLocal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na busca");
      setUpaNome(data.nome ?? null);
      setUpaEndereco(data.endereco ?? null);
      setUpaCidade(data.cidade ?? upaLocal);
      toast.success(`UPA encontrada: ${data.nome ?? "—"}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUpaBusy(false);
    }
  }

  function clinicaNomeFinal() {
    return isUpa ? (upaNome ?? profile?.clinica_nome ?? null) : (profile?.clinica_nome ?? null);
  }
  function clinicaEnderecoFinal() {
    return isUpa ? (upaEndereco ?? profile?.clinica_endereco ?? null) : (profile?.clinica_endereco ?? null);
  }
  function cidadeFinal() {
    return isUpa ? (upaCidade ?? null) : null;
  }

  async function preview() {
    if (!profile) return toast.error("Perfil não carregado");
    if (!nomePaciente.trim()) return toast.error("Informe o nome do paciente");
    const fakeId = "preview-" + Math.random().toString(36).slice(2, 10);
    const bytes = await generateAtestadoPdf({
      id: fakeId,
      nome_paciente: nomePaciente,
      data_atendimento: dataAtendimento,
      dias,
      observacao: observacao.trim() || null,
      cid: cid.trim() || null,
      medico_nome: profile.nome,
      medico_crm: profile.crm,
      medico_especialidade: profile.especialidade ?? null,
      clinica_nome: clinicaNomeFinal(),
      clinica_endereco: clinicaEnderecoFinal(),
      cidade: cidadeFinal(),
      omitir_crm: omitirCrm,
      template,
    }, `${window.location.origin}/validar/${fakeId}`);
    openPdf(bytes);
  }

  async function gerarComIA() {
    if (!motivo.trim()) {
      toast.error("Digite um motivo (ex: diarreia, gripe, lombalgia)");
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, dias }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro na IA");
      setObservacao(data.text || "");
      toast.success("Observação gerada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

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
            const nome_paciente = nomePaciente.trim();
            const obs = observacao.trim() || null;
            const cidVal = cid.trim() || null;

            if (!nome_paciente) return toast.error("Nome obrigatório");
            if (!(dias > 0)) return toast.error("Dias deve ser maior que 0");

            setBusy(true);
            const { data, error } = await supabase
              .from("atestados")
              .insert({
                medico_id: user.id,
                medico_nome: profile.nome,
                medico_crm: profile.crm,
                nome_paciente, data_atendimento: dataAtendimento, dias, observacao: obs, cid: cidVal,
              })
              .select("*").single();
            if (error || !data) {
              setBusy(false);
              toast.error(error?.message ?? "Erro ao salvar");
              return;
            }
            const url = `${window.location.origin}/validar/${data.id}`;
            const bytes = await generateAtestadoPdf({
              ...data,
              medico_especialidade: profile.especialidade ?? null,
              clinica_nome: clinicaNomeFinal(),
              clinica_endereco: clinicaEnderecoFinal(),
              cidade: cidadeFinal(),
              omitir_crm: omitirCrm,
              template,
            }, url);
            downloadPdf(bytes, `atestado-${nome_paciente.replace(/\s+/g, "_")}.pdf`);
            toast.success("Atestado gerado!");
            nav({ to: "/dashboard" });
          }}
        >
          <div className="space-y-2">
            <Label>Nome do paciente *</Label>
            <Input value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data do atendimento *</Label>
              <Input type="date" required value={dataAtendimento} onChange={(e) => setDataAtendimento(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dias de afastamento *</Label>
              <Input
                type="number"
                min={1}
                required
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>CID (opcional)</Label>
            <Input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="Ex: J11" />
          </div>

          <div className="space-y-2">
            <Label>Modelo do atestado</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as AtestadoTemplate)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="amorsaude">AmorSaúde (clínica privada)</SelectItem>
                <SelectItem value="upa">UPA 24h / SUS (público)</SelectItem>
                <SelectItem value="moderno">Moderno — minimal azul</SelectItem>
                <SelectItem value="executivo">Executivo — premium navy &amp; gold</SelectItem>
                <SelectItem value="holistico">Holístico — wellness orgânico</SelectItem>
              </SelectContent>
          </Select>
          </div>

          {isUpa && (
            <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Buscar UPA 24h pela localização
              </Label>
              <p className="text-xs text-muted-foreground">
                Informe a cidade/UF (ex: <em>Campinas - SP</em>) para preencher automaticamente o nome e o endereço da UPA no atestado.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Cidade - UF"
                  value={upaLocal}
                  onChange={(e) => setUpaLocal(e.target.value)}
                  disabled={upaBusy}
                />
                <Button type="button" onClick={buscarUpa} disabled={upaBusy}>
                  {upaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="ml-1">Buscar</span>
                </Button>
              </div>
              {upaNome && (
                <div className="text-xs rounded bg-background/60 border p-2 space-y-0.5">
                  <div><strong>{upaNome}</strong></div>
                  {upaEndereco && <div className="text-muted-foreground">{upaEndereco}</div>}
                  {upaCidade && <div className="text-muted-foreground">Cidade: {upaCidade}</div>}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-sm">Omitir CRM no PDF</Label>
              <p className="text-xs text-muted-foreground">Quando ativo, o CRM não aparece abaixo da assinatura.</p>
            </div>
            <Switch checked={omitirCrm} onCheckedChange={setOmitirCrm} />
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Auto-preencher com IA
            </Label>
            <p className="text-xs text-muted-foreground">
              Digite um motivo curto (ex: <em>diarreia</em>, <em>gripe</em>, <em>lombalgia</em>) e a IA escreverá uma observação clínica formal.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Motivo / sintoma"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={aiBusy}
              />
              <Button type="button" onClick={gerarComIA} disabled={aiBusy}>
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span className="ml-1">Gerar</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea
              rows={5}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Texto que aparecerá no atestado. Pode ser editado livremente."
            />
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={preview}>
              <Eye className="h-4 w-4 mr-1" /> Pré-visualizar
            </Button>
            <Button type="submit" className="flex-1" disabled={busy}>
              {busy ? "Gerando..." : "Gerar Atestado"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
