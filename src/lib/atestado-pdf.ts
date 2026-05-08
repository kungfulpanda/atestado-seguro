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

function diasPorExtenso(n: number): string {
  const map = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez",
    "onze","doze","treze","quatorze","quinze","dezesseis","dezessete","dezoito","dezenove","vinte",
    "vinte e um","vinte e dois","vinte e três","vinte e quatro","vinte e cinco","vinte e seis",
    "vinte e sete","vinte e oito","vinte e nove","trinta"];
  return map[n] ?? String(n);
}

export async function generateAtestadoPdf(a: AtestadoData, validateUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Refined palette
  const ink = rgb(0.09, 0.12, 0.20);
  const muted = rgb(0.45, 0.50, 0.58);
  const line = rgb(0.82, 0.85, 0.90);
  const accent = rgb(0.06, 0.27, 0.55);
  const accentSoft = rgb(0.93, 0.96, 1.0);

  const margin = 56;

  // Decorative left bar
  page.drawRectangle({ x: 0, y: 0, width: 6, height, color: accent });

  // Header
  const headerH = 110;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: accentSoft });
  // Monogram
  page.drawRectangle({
    x: margin, y: height - headerH + 28, width: 54, height: 54, color: accent,
  });
  page.drawText("M", {
    x: margin + 17, y: height - headerH + 42, size: 28, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("MedAtesta", {
    x: margin + 70, y: height - 50, size: 18, font: bold, color: accent,
  });
  page.drawText("Atestado Médico Eletrônico", {
    x: margin + 70, y: height - 68, size: 10, font, color: muted,
  });
  page.drawText(`Nº ${a.id.slice(0, 8).toUpperCase()}`, {
    x: width - margin - 110, y: height - 50, size: 10, font: bold, color: ink,
  });
  page.drawText(`Emitido em ${new Date().toLocaleDateString("pt-BR")}`, {
    x: width - margin - 145, y: height - 65, size: 9, font, color: muted,
  });

  // Title
  let y = height - headerH - 50;
  const title = "ATESTADO MÉDICO";
  const titleSize = 20;
  const titleW = bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (width - titleW) / 2, y, size: titleSize, font: bold, color: ink,
  });
  y -= 8;
  page.drawLine({
    start: { x: (width - 60) / 2, y }, end: { x: (width + 60) / 2, y },
    thickness: 1.2, color: accent,
  });
  y -= 30;

  // Patient summary box
  const boxY = y - 70;
  page.drawRectangle({
    x: margin, y: boxY, width: width - margin * 2, height: 70,
    borderColor: line, borderWidth: 0.8, color: rgb(0.985, 0.99, 1),
  });
  const labelStyle = { size: 8, font: bold, color: muted };
  const valueStyle = { size: 11, font: bold, color: ink };

  page.drawText("PACIENTE", { x: margin + 14, y: boxY + 50, ...labelStyle });
  page.drawText(a.nome_paciente, { x: margin + 14, y: boxY + 32, ...valueStyle });

  page.drawText("DATA DO ATENDIMENTO", { x: margin + 14, y: boxY + 18, ...labelStyle });
  page.drawText(formatDateBR(a.data_atendimento), { x: margin + 14, y: boxY + 6, size: 10, font, color: ink });

  page.drawText("AFASTAMENTO", { x: width / 2 + 10, y: boxY + 18, ...labelStyle });
  page.drawText(`${a.dias} dia(s)`, { x: width / 2 + 10, y: boxY + 6, size: 10, font, color: ink });

  if (a.cid) {
    page.drawText("CID", { x: width - margin - 70, y: boxY + 50, ...labelStyle });
    page.drawText(a.cid, { x: width - margin - 70, y: boxY + 32, ...valueStyle });
  }

  y = boxY - 30;

  // Body
  const bodyText = `Atesto, para os devidos fins, que o(a) Sr.(a) ${a.nome_paciente} esteve sob meus cuidados médicos nesta data, necessitando de afastamento de suas atividades habituais por um período de ${a.dias} (${diasPorExtenso(a.dias)}) dia(s), a partir de ${formatDateBR(a.data_atendimento)}.`;
  for (const ln of wrap(bodyText, font, 11, width - margin * 2)) {
    page.drawText(ln, { x: margin, y, size: 11, font, color: ink });
    y -= 16;
  }

  if (a.observacao) {
    y -= 14;
    page.drawText("Observações clínicas", { x: margin, y, size: 10, font: bold, color: accent });
    y -= 14;
    for (const ln of wrap(a.observacao, font, 10.5, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 10.5, font, color: ink });
      y -= 14;
    }
  }

  // Signature
  const sigY = 230;
  page.drawLine({
    start: { x: margin + 30, y: sigY }, end: { x: margin + 280, y: sigY },
    thickness: 0.8, color: ink,
  });
  const sigName = `Dr(a). ${a.medico_nome}`;
  const sigW = bold.widthOfTextAtSize(sigName, 12);
  page.drawText(sigName, {
    x: margin + 30 + (250 - sigW) / 2, y: sigY - 16, size: 12, font: bold, color: ink,
  });
  const crmText = `CRM ${a.medico_crm}`;
  const crmW = font.widthOfTextAtSize(crmText, 10);
  page.drawText(crmText, {
    x: margin + 30 + (250 - crmW) / 2, y: sigY - 30, size: 10, font, color: muted,
  });
  const localData = `Emitido eletronicamente em ${new Date().toLocaleDateString("pt-BR")}`;
  const ldW = italic.widthOfTextAtSize(localData, 9);
  page.drawText(localData, {
    x: margin + 30 + (250 - ldW) / 2, y: sigY - 46, size: 9, font: italic, color: muted,
  });

  // QR Code panel
  const qrSize = 115;
  const qrX = width - margin - qrSize - 10;
  const qrY = sigY - 70;
  page.drawRectangle({
    x: qrX - 12, y: qrY - 28, width: qrSize + 24, height: qrSize + 50,
    borderColor: line, borderWidth: 0.8, color: rgb(1, 1, 1),
  });
  const qrDataUrl = await QRCode.toDataURL(validateUrl, { margin: 0, width: 240 });
  const qrPng = await pdf.embedPng(qrDataUrl);
  page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const qrLabel = "Verificar autenticidade";
  const qrLW = bold.widthOfTextAtSize(qrLabel, 9);
  page.drawText(qrLabel, {
    x: qrX + (qrSize - qrLW) / 2, y: qrY - 14, size: 9, font: bold, color: accent,
  });
  const qrSub = "Escaneie o QR Code";
  const qrSW = font.widthOfTextAtSize(qrSub, 8);
  page.drawText(qrSub, {
    x: qrX + (qrSize - qrSW) / 2, y: qrY - 24, size: 8, font, color: muted,
  });

  // Footer
  page.drawLine({
    start: { x: margin, y: 70 }, end: { x: width - margin, y: 70 },
    thickness: 0.5, color: line,
  });
  page.drawText(`ID do Atestado: ${a.id}`, { x: margin, y: 54, size: 8, font, color: muted });
  page.drawText(`Validação: ${validateUrl}`, { x: margin, y: 42, size: 7.5, font, color: muted });
  const stamp = "Documento gerado eletronicamente — sem rasuras ou alterações.";
  page.drawText(stamp, { x: margin, y: 30, size: 7.5, font: italic, color: muted });

  return await pdf.save();
}

function wrap(
  text: string,
  font: import("pdf-lib").PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
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
