import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export interface AtestadoData {
  id: string;
  nome_paciente: string;
  data_atendimento: string; // YYYY-MM-DD
  dias: number;
  observacao?: string | null;
  cid?: string | null;
  medico_nome: string;
  medico_crm: string;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function generateAtestadoPdf(a: AtestadoData, validateUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.08, 0.1, 0.18);
  const muted = rgb(0.45, 0.48, 0.55);
  const accent = rgb(0.13, 0.36, 0.68);

  // Header bar
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: accent });
  page.drawText("ATESTADO MÉDICO", {
    x: 50, y: height - 55, size: 22, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("Documento gerado eletronicamente", {
    x: 50, y: height - 78, size: 10, font, color: rgb(0.85, 0.9, 1),
  });

  // Body
  const text = `Declaro, para os devidos fins, que o(a) paciente ${a.nome_paciente} foi atendido(a) nesta data e necessita de ${a.dias} dia(s) de afastamento de suas atividades habituais.`;

  let y = height - 150;
  const lines = wrap(text, 90);
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font, color: ink });
    y -= 18;
  }

  y -= 20;
  if (a.observacao) {
    page.drawText("Observação:", { x: 50, y, size: 11, font: bold, color: ink });
    y -= 16;
    for (const line of wrap(a.observacao, 90)) {
      page.drawText(line, { x: 50, y, size: 11, font, color: ink });
      y -= 15;
    }
    y -= 10;
  }

  if (a.cid) {
    page.drawText(`CID: ${a.cid}`, { x: 50, y, size: 11, font: bold, color: ink });
    y -= 20;
  }

  page.drawText(`Data do atendimento: ${formatDateBR(a.data_atendimento)}`, {
    x: 50, y, size: 11, font, color: ink,
  });

  // Signature
  const sigY = 240;
  page.drawLine({
    start: { x: 50, y: sigY }, end: { x: 350, y: sigY },
    thickness: 0.8, color: ink,
  });
  page.drawText(`Dr(a). ${a.medico_nome}`, { x: 50, y: sigY - 18, size: 12, font: bold, color: ink });
  page.drawText(`CRM: ${a.medico_crm}`, { x: 50, y: sigY - 34, size: 11, font, color: muted });

  // QR Code
  const qrDataUrl = await QRCode.toDataURL(validateUrl, { margin: 0, width: 220 });
  const qrPng = await pdf.embedPng(qrDataUrl);
  const qrSize = 110;
  page.drawImage(qrPng, { x: width - 50 - qrSize, y: 110, width: qrSize, height: qrSize });
  page.drawText("Escaneie para validar", {
    x: width - 50 - qrSize, y: 95, size: 9, font, color: muted,
  });

  // Footer
  page.drawLine({
    start: { x: 50, y: 75 }, end: { x: width - 50, y: 75 },
    thickness: 0.5, color: muted,
  });
  page.drawText(`ID do Atestado: ${a.id}`, { x: 50, y: 58, size: 9, font, color: muted });
  page.drawText(`Verificação: ${validateUrl}`, { x: 50, y: 45, size: 8, font, color: muted });

  return await pdf.save();
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + " " : "") + w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  // Copy to a fresh ArrayBuffer to satisfy BlobPart typing
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openPdf(bytes: Uint8Array) {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
