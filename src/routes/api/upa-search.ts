import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/upa-search")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const { localizacao } = (await request.json()) as { localizacao?: string };
          if (!localizacao || !localizacao.trim()) {
            return new Response(JSON.stringify({ error: "Informe a localização (cidade/UF)" }), { status: 400 });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "AI gateway não configurado" }), { status: 500 });
          }

          const system = `Você é um assistente que retorna dados REAIS e verificáveis de uma Unidade de Pronto Atendimento (UPA 24h) brasileira do SUS, localizada na cidade/UF informada pelo usuário.

REGRAS:
- Retorne APENAS uma UPA 24h REAL, existente, gerida por prefeitura municipal ou Estado, do SUS.
- Use o NOME OFICIAL da unidade (ex: "UPA 24h Vila Maria", "UPA Dr. José Maria de Magalhães Netto").
- Endereço completo: rua, número, bairro, cidade - UF, CEP (se souber).
- Telefone se conhecido (formato (DD) NNNN-NNNN), senão deixe string vazia.
- Se NÃO souber uma UPA real específica daquela cidade com certeza, retorne uma UPA 24h real da capital ou cidade grande mais próxima e indique no campo "cidade" a cidade real da unidade.
- NÃO INVENTE endereços ou nomes. Use somente dados publicamente conhecidos.
- Responda APENAS com JSON válido (sem markdown, sem comentários).
- Campos obrigatórios: nome, endereco, cidade, telefone.`;

          const user = `Localização informada: ${localizacao.trim()}\nRetorne uma UPA 24h real dessa cidade em JSON.`;

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
                { role: "user", content: user },
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
