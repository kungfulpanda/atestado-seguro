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

          const system = `Você gera dados FICTÍCIOS e plausíveis de um(a) médico(a) brasileiro(a) e sua clínica para preencher um formulário de demonstração.
Regras:
- Responda APENAS com JSON válido, sem markdown, sem comentários.
- Campos: nome, crm, especialidade, clinica_nome, clinica_endereco.
- nome: nome completo brasileiro realista, com prefixo "Dr." ou "Dra.".
- crm: formato "CRM-UF NNNNN" (ex: "CRM-SP 123456"). UF brasileira válida.
- especialidade: especialidade médica reconhecida (ex: "Clínica Geral", "Cardiologia", "Pediatria").
- clinica_nome: nome plausível de clínica/consultório.
- clinica_endereco: endereço brasileiro completo (rua, número, bairro, cidade - UF, CEP).
- Use a dica do usuário se fornecida para enviesar especialidade/cidade/estilo.`;

          const userMsg = `Dica (opcional): ${hint?.trim() || "nenhuma"}\nGere o JSON.`;

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
