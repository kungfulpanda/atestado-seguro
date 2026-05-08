import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/describe")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { motivo, dias } = (await request.json()) as { motivo?: string; dias?: number };
          if (!motivo || !motivo.trim()) {
            return new Response(JSON.stringify({ error: "Motivo é obrigatório" }), { status: 400 });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "AI gateway não configurado" }), { status: 500 });
          }

          const system = `Você é um assistente médico. Dado um sintoma/motivo curto informado pelo médico, gere uma observação clínica formal e concisa (2 a 4 frases) para constar em atestado médico em português do Brasil.
Regras:
- Tom formal, impessoal, profissional.
- Não invente diagnóstico definitivo; descreva quadro clínico compatível.
- Mencione necessidade de repouso/afastamento quando pertinente, citando os dias informados.
- Não inclua nome do paciente, do médico, CRM, datas, assinaturas ou cabeçalhos.
- Não use markdown nem listas. Responda apenas com o texto da observação.`;

          const user = `Motivo: ${motivo.trim()}\nDias de afastamento: ${dias ?? "não informado"}`;

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "vercel-ai-sdk",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
          });

          if (!res.ok) {
            const txt = await res.text();
            return new Response(JSON.stringify({ error: `AI error: ${res.status} ${txt}` }), { status: res.status });
          }
          const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = data.choices?.[0]?.message?.content?.trim() ?? "";
          return new Response(JSON.stringify({ text }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
        }
      },
    },
  },
});
