import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/clinica")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { hint } = (await request.json()) as { hint?: string };
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "AI gateway não configurado" }), { status: 500 });
          }

          const system = `Você é um assistente que preenche um formulário com dados de um(a) médico(a) brasileiro(a) REAL e publicamente conhecido(a) — alguém cujo nome e CRM já apareceram em fontes públicas verificáveis (site do CFM/CRM estadual, imprensa, artigos científicos, sites institucionais de hospitais/universidades, currículo Lattes).

REGRAS IMPORTANTES:
- Use APENAS profissionais cujos dados são públicos e divulgados pelo próprio profissional ou instituição (ex: professores universitários, médicos com presença na mídia, autores de publicações, médicos com perfil institucional público).
- NÃO invente nem aproxime números de CRM. Se não tiver certeza absoluta de um CRM real, escolha outro profissional que você conheça com certeza.
- O nome deve ser o nome completo real (com "Dr." ou "Dra.").
- O CRM deve estar no formato "CRM-UF NNNNN" e corresponder ao profissional.
- A especialidade deve ser a real do profissional.
- clinica_nome e clinica_endereco podem ser do hospital/universidade/clínica pública onde atua. Se não souber endereço completo, use o endereço público da instituição.
- Use a dica para escolher um profissional adequado (especialidade/cidade).
- Responda APENAS com JSON válido (sem markdown).
- Campos: nome, crm, especialidade, clinica_nome, clinica_endereco.`;

          const userMsg = `Dica (opcional): ${hint?.trim() || "nenhuma"}\nRetorne os dados reais em JSON.`;

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "vercel-ai-sdk",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages: [
                { role: "system", content: system },
                { role: "user", content: userMsg },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (!res.ok) {
            const txt = await res.text();
            return new Response(JSON.stringify({ error: `AI error: ${res.status} ${txt}` }), { status: res.status });
          }
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";
          let parsed: Record<string, string> = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            const m = raw.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }
          return new Response(JSON.stringify(parsed), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
        }
      },
    },
  },
});
