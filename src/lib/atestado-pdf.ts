import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import amorLogoUrl from "@/assets/templates/amorsaude-logo.jpg";
import upaSusUrl from "@/assets/templates/upa-sus.jpg";
import upa24Url from "@/assets/templates/upa-24h.jpg";

export type AtestadoTemplate = "amorsaude" | "upa" | "moderno" | "executivo" | "holistico";

export interface AtestadoData {
  id: string;
  nome_paciente: string;
  data_atendimento: string; // YYYY-MM-DD
  dias: number;
  observacao?: string | null;
  cid?: string | null;
  medico_nome: string;
  medico_crm: string;
  medico_especialidade?: string | null;
  clinica_nome?: string | null;
  clinica_endereco?: string | null;
  cidade?: string | null;
  omitir_crm?: boolean;
  template?: AtestadoTemplate;
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function diasPorExtenso(n: number): string {
  const map = ["zero","Um","Dois","Três","Quatro","Cinco","Seis","Sete","Oito","Nove","Dez",
    "Onze","Doze","Treze","Quatorze","Quinze","Dezesseis","Dezessete","Dezoito","Dezenove","Vinte",
    "Vinte e um","Vinte e dois","Vinte e três","Vinte e quatro","Vinte e cinco","Vinte e seis",
    "Vinte e sete","Vinte e oito","Vinte e nove","Trinta"];
  return map[n] ?? String(n);
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

function extractCity(a: AtestadoData): string {
  if (a.cidade) return a.cidade;
  if (a.clinica_endereco) {
    const parts = a.clinica_endereco.split(/[-,]/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (/cep/i.test(p)) continue;
      if (/^\d/.test(p)) continue;
      if (p.length > 2 && p.length < 40) return p;
    }
  }
  return "—";
}

function renderCursiveSignature(name: string): Uint8Array | null {
  if (typeof document === "undefined") return null;
  const w = 700, h = 200;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a1a3a";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = 'italic 78px "Brush Script MT","Lucida Handwriting","Segoe Script","Comic Sans MS",cursive';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.04);
  ctx.fillText(name, 0, 0);
  ctx.strokeStyle = "#0a1a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const tw = ctx.measureText(name).width;
  ctx.moveTo(-tw / 2 - 10, 50);
  ctx.bezierCurveTo(-tw / 4, 70, tw / 4, 30, tw / 2 + 20, 55);
  ctx.stroke();
  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (cur) out.push(cur);
        cur = w;
      } else cur = test;
    }
    out.push(cur);
  }
  return out;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  return new Uint8Array(await r.arrayBuffer());
}

async function embedJpg(pdf: PDFDocument, url: string) {
  return pdf.embedJpg(await fetchBytes(url));
}

async function drawSignature(pdf: PDFDocument, page: PDFPage, x: number, y: number, w: number, name: string) {
  const bytes = renderCursiveSignature(name);
  if (!bytes) return;
  try {
    const img = await pdf.embedPng(bytes);
    const imgW = w;
    const imgH = (img.height / img.width) * imgW;
    page.drawImage(img, { x, y, width: imgW, height: imgH });
  } catch { /* ignore */ }
}

async function drawQR(pdf: PDFDocument, page: PDFPage, url: string, x: number, y: number, size: number, accent = rgb(0.1,0.1,0.1)) {
  const dataUrl = await QRCode.toDataURL(url, { margin: 0, width: 320 });
  const img = await pdf.embedPng(dataUrl);
  page.drawImage(img, { x, y, width: size, height: size });
  const f = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Verificar autenticidade", { x, y: y - 10, size: 7, font: f, color: accent });
}

// =========================================================
// Template 1: AmorSaúde (kept)
// =========================================================
async function renderAmorSaude(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.1, 0.12, 0.18);
  const teal = rgb(0.34, 0.75, 0.82);
  const muted = rgb(0.4, 0.45, 0.55);

  const margin = 42;

  try {
    const logo = await embedJpg(pdf, amorLogoUrl);
    const lw = 180;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: margin, y: height - margin - lh, width: lw, height: lh });
  } catch { /* */ }

  const stripY = height - margin - 100;
  page.drawRectangle({ x: margin, y: stripY, width: width - margin * 2, height: 36, color: teal });
  const title = "ATESTADO MÉDICO";
  const tW = bold.widthOfTextAtSize(title, 20);
  page.drawText(title, { x: (width - tW) / 2, y: stripY + 11, size: 20, font: bold, color: rgb(1,1,1) });

  let y = stripY - 60;
  const body = `Atesto que o(a) Sr(a) ${a.nome_paciente}, necessita de ${pad2(a.dias)} (${diasPorExtenso(a.dias)}) dia(s) de afastamento do trabalho a partir da data ${formatDateBR(a.data_atendimento)} por motivo de doença.`;
  for (const ln of wrap(body, font, 13, width - margin * 2)) {
    page.drawText(ln, { x: margin, y, size: 13, font, color: ink });
    y -= 20;
  }

  if (a.cid) {
    y -= 14;
    page.drawText(`CID: ${a.cid}`, { x: margin, y, size: 13, font: bold, color: ink });
    y -= 20;
  }

  if (a.observacao) {
    y -= 6;
    for (const ln of wrap(a.observacao, font, 11.5, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 11.5, font, color: ink });
      y -= 16;
    }
  }

  const rightX = width - margin - 200;
  const cidadeStr = `${extractCity(a)}, ${formatDateBR(a.data_atendimento)}`;
  page.drawText(cidadeStr, { x: rightX, y: 320, size: 12, font: bold, color: ink });
  if (a.medico_especialidade) {
    page.drawText(`Especialidade: ${a.medico_especialidade}`, { x: rightX, y: 304, size: 10, font, color: muted });
  }

  const sigW = 280;
  const sigX = margin + 30;
  const sigY = 250;
  await drawSignature(pdf, page, sigX + (sigW - 220) / 2, sigY + 5, 220, a.medico_nome);
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 0.7, color: ink });
  const docName = a.medico_nome.toUpperCase();
  const dnW = bold.widthOfTextAtSize(docName, 12);
  page.drawText(docName, { x: sigX + (sigW - dnW) / 2, y: sigY - 14, size: 12, font: bold, color: ink });
  if (!a.omitir_crm) {
    const crmStr = `CRM ${a.medico_crm}`;
    const cw = font.widthOfTextAtSize(crmStr, 11);
    page.drawText(crmStr, { x: sigX + (sigW - cw) / 2, y: sigY - 28, size: 11, font, color: ink });
  }

  await drawQR(pdf, page, validateUrl, width - margin - 80, 240, 70, muted);

  if (a.clinica_endereco || a.clinica_nome) {
    const stripH = 60;
    page.drawRectangle({ x: margin, y: 40, width: width - margin * 2, height: stripH, color: teal, opacity: 0.4 });
    page.drawText("Endereço", { x: margin + 10, y: 40 + stripH - 16, size: 10, font: bold, color: ink });
    const addr = a.clinica_endereco ?? "";
    let ay = 40 + stripH - 30;
    for (const ln of wrap(addr, font, 9.5, (width - margin * 2) / 2 - 20).slice(0, 2)) {
      page.drawText(ln, { x: margin + 10, y: ay, size: 9.5, font, color: ink });
      ay -= 12;
    }
    page.drawText(a.clinica_nome ?? "", { x: width / 2 + 10, y: 40 + stripH - 16, size: 10, font: bold, color: ink });
  }

  page.drawText(`ID: ${a.id}`, { x: margin, y: 22, size: 7, font: italic, color: muted });
}

// =========================================================
// Template 2: UPA / SUS (kept)
// =========================================================
async function renderUPA(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.45, 0.45, 0.45);
  const margin = 60;

  try {
    const sus = await embedJpg(pdf, upaSusUrl);
    const upa = await embedJpg(pdf, upa24Url);
    const susW = 220, susH = (sus.height / sus.width) * susW;
    const upaW = 130, upaH = (upa.height / upa.width) * upaW;
    const totalW = susW + 16 + upaW;
    const sx = (width - totalW) / 2;
    const top = height - margin;
    const maxH = Math.max(susH, upaH);
    page.drawImage(sus, { x: sx, y: top - maxH + (maxH - susH) / 2, width: susW, height: susH });
    page.drawImage(upa, { x: sx + susW + 16, y: top - maxH + (maxH - upaH) / 2, width: upaW, height: upaH });
  } catch { /* */ }

  let y = height - margin - 110;
  const title = "ATESTADO MÉDICO";
  const tW = bold.widthOfTextAtSize(title, 18);
  page.drawText(title, { x: (width - tW) / 2, y, size: 18, font: bold, color: ink });
  y -= 46;

  type Seg = { kind: "text" | "blank"; value: string; label?: string; minW?: number };
  const drawRow = (segs: Seg[], yy: number, size = 11) => {
    let x = margin;
    const right = width - margin;
    let fixedW = 0;
    let blankFixed = 0;
    for (const s of segs) {
      if (s.kind === "text") fixedW += font.widthOfTextAtSize(s.value, size) + 4;
      else { blankFixed += s.minW ?? 0; }
    }
    const remaining = Math.max(0, right - margin - fixedW - blankFixed);
    const flexBlanks = segs.filter(s => s.kind === "blank" && !s.minW).length;
    const flexW = flexBlanks > 0 ? remaining / flexBlanks : 0;
    for (const s of segs) {
      if (s.kind === "text") {
        page.drawText(s.value, { x, y: yy, size, font, color: ink });
        x += font.widthOfTextAtSize(s.value, size) + 4;
      } else {
        const w = s.minW ?? flexW;
        page.drawLine({ start: { x, y: yy - 3 }, end: { x: x + w, y: yy - 3 }, thickness: 0.6, color: ink });
        const vW = font.widthOfTextAtSize(s.value, size);
        page.drawText(s.value, { x: x + Math.max(2, (w - vW) / 2), y: yy + 1, size, font, color: ink });
        if (s.label) {
          const lW = font.widthOfTextAtSize(s.label, 7.5);
          page.drawText(s.label, { x: x + Math.max(0, (w - lW) / 2), y: yy - 14, size: 7.5, font, color: muted });
        }
        x += w;
      }
    }
  };

  drawRow([
    { kind: "text", value: "ATESTO PARA OS DEVIDOS FINS, A PEDIDO, QUE O(A) SR.(A)" },
    { kind: "blank", value: a.nome_paciente, label: "NOME DO PACIENTE" },
  ], y);
  y -= 30;

  drawRow([
    { kind: "blank", value: "", label: "IDENTIDADE OU REGISTRO" },
  ], y);
  y -= 30;

  drawRow([
    { kind: "text", value: "FOI ATENDIDO(A) NA" },
    { kind: "blank", value: a.medico_especialidade ?? "CLÍNICA MÉDICA", label: "CLÍNICA OU SERVIÇO" },
  ], y);
  y -= 30;
  drawRow([
    { kind: "text", value: "DO" },
    { kind: "blank", value: a.clinica_nome ?? "—", label: "HOSPITAL / AMBULATÓRIO" },
  ], y);
  y -= 30;

  const horaStr = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  drawRow([
    { kind: "text", value: "NO DIA" },
    { kind: "blank", value: formatDateBR(a.data_atendimento), label: "DATA", minW: 90 },
    { kind: "text", value: ", ÀS" },
    { kind: "blank", value: horaStr, label: "HORA", minW: 55 },
    { kind: "text", value: "HORAS," },
  ], y);
  y -= 30;
  drawRow([
    { kind: "text", value: "NECESSITANDO DE" },
    { kind: "blank", value: pad2(a.dias), label: "DIAS", minW: 40 },
    { kind: "text", value: "(" },
    { kind: "blank", value: diasPorExtenso(a.dias).toUpperCase(), label: "POR EXTENSO" },
    { kind: "text", value: ")" },
  ], y);
  y -= 24;
  page.drawText("DIAS DE REPOUSO POR MOTIVO DE DOENÇA.", { x: margin, y, size: 11, font, color: ink });
  y -= 28;

  if (a.cid) {
    drawRow([
      { kind: "text", value: "CID:" },
      { kind: "blank", value: a.cid, label: "CÓDIGO CID-10", minW: 160 },
    ], y);
    y -= 30;
  }

  if (a.observacao) {
    y -= 8;
    for (const ln of wrap(a.observacao, font, 10.5, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 10.5, font, color: ink });
      y -= 14;
    }
  }

  const sigY = 200;
  const cidadeStr = `${extractCity(a)} - ${formatDateBR(a.data_atendimento)}`;
  const csW = font.widthOfTextAtSize(cidadeStr, 11);
  page.drawText(cidadeStr, { x: (width - csW) / 2, y: sigY + 60, size: 11, font, color: ink });

  const sigW = 320;
  const sigX = (width - sigW) / 2;
  await drawSignature(pdf, page, sigX + (sigW - 220) / 2, sigY + 8, 220, a.medico_nome);
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 0.5, color: ink });
  const localLbl = "LOCAL E DATA";
  const llW = font.widthOfTextAtSize(localLbl, 8);
  page.drawText(localLbl, { x: sigX + (sigW - llW) / 2, y: sigY + 44, size: 8, font, color: muted });

  const dnTxt = a.medico_nome.toUpperCase();
  const dntW = bold.widthOfTextAtSize(dnTxt, 11);
  page.drawText(dnTxt, { x: sigX + (sigW - dntW) / 2, y: sigY - 14, size: 11, font: bold, color: ink });
  if (!a.omitir_crm) {
    const crm = `CRM ${a.medico_crm}`;
    const cw = font.widthOfTextAtSize(crm, 10);
    page.drawText(crm, { x: sigX + (sigW - cw) / 2, y: sigY - 26, size: 10, font, color: ink });
  }

  await drawQR(pdf, page, validateUrl, width - margin - 70, 70, 60, muted);

  const nota = "NOTA: ESTE ATESTADO É VÁLIDO PARA FINALIDADES PREVISTAS NO ARTIGO 27 DE CLIPS, APROVADA PELO DECRETO Nº 89.312 DE 23/01/84.";
  let ny = 90;
  for (const ln of wrap(nota, italic, 8, width - margin * 2 - 90)) {
    page.drawText(ln, { x: margin, y: ny, size: 8, font: italic, color: muted });
    ny -= 10;
  }
  page.drawText(`ID: ${a.id}`, { x: margin, y: 30, size: 7, font: italic, color: muted });
}

// =========================================================
// Template 3: MODERNO — minimal sidebar accent + sans
// =========================================================
async function renderModerno(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.08, 0.09, 0.12);
  const muted = rgb(0.42, 0.46, 0.52);
  const accent = rgb(0.15, 0.55, 0.85); // electric blue
  const soft = rgb(0.96, 0.97, 0.99);

  // Left sidebar
  const sbW = 8;
  page.drawRectangle({ x: 0, y: 0, width: sbW, height, color: accent });

  // Soft top band
  page.drawRectangle({ x: sbW, y: height - 130, width: width - sbW, height: 130, color: soft });

  const margin = 56;
  // Eyebrow
  page.drawText("DOCUMENTO MÉDICO", { x: margin, y: height - 60, size: 9, font: bold, color: accent });
  // Big title
  page.drawText("Atestado", { x: margin, y: height - 100, size: 38, font: bold, color: ink });
  page.drawText("Médico", { x: margin + bold.widthOfTextAtSize("Atestado ", 38), y: height - 100, size: 38, font, color: muted });

  // Right meta column
  const metaX = width - margin - 160;
  const issued = new Date();
  const metaPairs: Array<[string, string]> = [
    ["EMITIDO EM", `${pad2(issued.getDate())}/${pad2(issued.getMonth()+1)}/${issued.getFullYear()}`],
    ["PROTOCOLO", a.id.slice(0,8).toUpperCase()],
  ];
  let my = height - 60;
  for (const [k, v] of metaPairs) {
    page.drawText(k, { x: metaX, y: my, size: 7.5, font: bold, color: muted });
    page.drawText(v, { x: metaX, y: my - 12, size: 11, font: bold, color: ink });
    my -= 32;
  }

  // Patient card
  let y = height - 180;
  page.drawRectangle({ x: margin, y: y - 70, width: width - margin*2, height: 70, borderColor: rgb(0.88,0.89,0.92), borderWidth: 0.8, color: rgb(1,1,1) });
  page.drawRectangle({ x: margin, y: y - 70, width: 4, height: 70, color: accent });
  page.drawText("PACIENTE", { x: margin + 16, y: y - 18, size: 8, font: bold, color: muted });
  page.drawText(a.nome_paciente, { x: margin + 16, y: y - 36, size: 16, font: bold, color: ink });
  page.drawText(`Atendimento em ${formatDateBR(a.data_atendimento)}`, { x: margin + 16, y: y - 56, size: 10, font, color: muted });

  y -= 100;

  // Body
  const body = `Atesto, para os devidos fins, que o(a) paciente acima identificado(a) necessita de afastamento de suas atividades laborais por ${pad2(a.dias)} (${diasPorExtenso(a.dias).toLowerCase()}) dia(s), a contar de ${formatDateBR(a.data_atendimento)}, por motivo de saúde.`;
  for (const ln of wrap(body, font, 12, width - margin*2)) {
    page.drawText(ln, { x: margin, y, size: 12, font, color: ink });
    y -= 18;
  }

  // CID chip
  if (a.cid) {
    y -= 10;
    const chip = `CID: ${a.cid}`;
    const cw = bold.widthOfTextAtSize(chip, 10) + 18;
    page.drawRectangle({ x: margin, y: y - 6, width: cw, height: 22, color: accent });
    page.drawText(chip, { x: margin + 9, y: y, size: 10, font: bold, color: rgb(1,1,1) });
    y -= 24;
  }

  if (a.observacao) {
    y -= 14;
    page.drawText("OBSERVAÇÕES", { x: margin, y, size: 8, font: bold, color: muted });
    y -= 14;
    for (const ln of wrap(a.observacao, font, 11, width - margin*2)) {
      page.drawText(ln, { x: margin, y, size: 11, font, color: ink });
      y -= 15;
    }
  }

  // Signature
  const sigY = 230;
  const sigW = 280;
  const sigX = margin;
  await drawSignature(pdf, page, sigX + (sigW - 220) / 2, sigY + 6, 220, a.medico_nome);
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 0.6, color: ink });
  page.drawText(a.medico_nome, { x: sigX, y: sigY - 14, size: 11, font: bold, color: ink });
  if (!a.omitir_crm) {
    page.drawText(`CRM ${a.medico_crm}`, { x: sigX, y: sigY - 28, size: 10, font, color: muted });
  }
  if (a.medico_especialidade) {
    page.drawText(a.medico_especialidade, { x: sigX, y: sigY - 42, size: 10, font: italic, color: muted });
  }

  // City + date right
  const cidadeStr = `${extractCity(a)}, ${formatDateBR(a.data_atendimento)}`;
  const cW = font.widthOfTextAtSize(cidadeStr, 11);
  page.drawText(cidadeStr, { x: width - margin - cW, y: sigY + 60, size: 11, font, color: ink });

  // QR
  await drawQR(pdf, page, validateUrl, width - margin - 80, sigY - 30, 70, muted);

  // Footer
  page.drawLine({ start: { x: margin, y: 60 }, end: { x: width - margin, y: 60 }, thickness: 0.4, color: rgb(0.85,0.87,0.9) });
  if (a.clinica_nome) page.drawText(a.clinica_nome, { x: margin, y: 44, size: 9, font: bold, color: ink });
  if (a.clinica_endereco) page.drawText(a.clinica_endereco, { x: margin, y: 32, size: 8.5, font, color: muted });
  page.drawText(`ID ${a.id}`, { x: width - margin - font.widthOfTextAtSize(`ID ${a.id}`, 7), y: 32, size: 7, font: italic, color: muted });
}

// =========================================================
// Template 4: EXECUTIVO — premium dark serif, gold accent
// =========================================================
async function renderExecutivo(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifI = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const navy = rgb(0.06, 0.10, 0.20);
  const gold = rgb(0.74, 0.60, 0.26);
  const ink = rgb(0.10, 0.11, 0.14);
  const muted = rgb(0.45, 0.46, 0.50);
  const cream = rgb(0.99, 0.98, 0.95);

  // Cream background
  page.drawRectangle({ x: 0, y: 0, width, height, color: cream });
  // Top navy band
  const bandH = 110;
  page.drawRectangle({ x: 0, y: height - bandH, width, height: bandH, color: navy });
  // Gold rule
  page.drawRectangle({ x: 0, y: height - bandH - 4, width, height: 4, color: gold });

  const margin = 56;

  // Monogram
  page.drawRectangle({ x: margin, y: height - 80, width: 44, height: 44, borderColor: gold, borderWidth: 1.2, color: navy });
  const initials = (a.medico_nome.split(/\s+/).map(s => s[0]).slice(0,2).join("") || "MD").toUpperCase();
  const iw = serifB.widthOfTextAtSize(initials, 18);
  page.drawText(initials, { x: margin + (44 - iw)/2, y: height - 65, size: 18, font: serifB, color: gold });

  // Title
  page.drawText("ATESTADO MÉDICO", { x: margin + 60, y: height - 60, size: 18, font: serifB, color: rgb(1,1,1) });
  page.drawText("Documento oficial · Confidencial", { x: margin + 60, y: height - 78, size: 9, font: serifI, color: gold });

  // Right protocol
  const issued = new Date();
  const proto = `Protocolo Nº ${a.id.slice(0,8).toUpperCase()}`;
  const dateStr = `Emitido em ${pad2(issued.getDate())}/${pad2(issued.getMonth()+1)}/${issued.getFullYear()}`;
  page.drawText(proto, { x: width - margin - sans.widthOfTextAtSize(proto, 9), y: height - 60, size: 9, font: sans, color: rgb(1,1,1) });
  page.drawText(dateStr, { x: width - margin - sans.widthOfTextAtSize(dateStr, 8.5), y: height - 75, size: 8.5, font: sans, color: gold });

  // Decorative ornament under band
  let y = height - bandH - 50;
  const ornY = y + 20;
  page.drawLine({ start: { x: margin, y: ornY }, end: { x: width/2 - 20, y: ornY }, thickness: 0.5, color: gold });
  page.drawCircle({ x: width/2, y: ornY, size: 3, color: gold });
  page.drawLine({ start: { x: width/2 + 20, y: ornY }, end: { x: width - margin, y: ornY }, thickness: 0.5, color: gold });

  // Patient label
  y -= 10;
  page.drawText("Atesto, sob as penas da lei, para os devidos fins de direito,", { x: margin, y, size: 12, font: serifI, color: muted });
  y -= 22;
  page.drawText("que o(a) paciente", { x: margin, y, size: 13, font: serif, color: ink });
  // Patient name big
  y -= 30;
  page.drawText(a.nome_paciente, { x: margin, y, size: 22, font: serifB, color: navy });
  page.drawLine({ start: { x: margin, y: y - 6 }, end: { x: margin + serifB.widthOfTextAtSize(a.nome_paciente, 22) + 20, y: y - 6 }, thickness: 0.6, color: gold });

  y -= 40;
  const body =
    `esteve sob avaliação médica em ${formatDateBR(a.data_atendimento)}, devendo permanecer afastado(a) ` +
    `de suas atividades laborais e/ou escolares pelo período de ${pad2(a.dias)} (${diasPorExtenso(a.dias).toLowerCase()}) dia(s), ` +
    `a contar da referida data, por motivo de ordem médica.`;
  for (const ln of wrap(body, serif, 12.5, width - margin * 2)) {
    page.drawText(ln, { x: margin, y, size: 12.5, font: serif, color: ink });
    y -= 19;
  }

  if (a.cid) {
    y -= 10;
    page.drawText(`CID-10: ${a.cid}`, { x: margin, y, size: 12, font: serifB, color: navy });
  }

  if (a.observacao) {
    y -= 22;
    page.drawText("Observações clínicas", { x: margin, y, size: 9.5, font: serifB, color: gold });
    y -= 14;
    for (const ln of wrap(a.observacao, serifI, 11, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 11, font: serifI, color: ink });
      y -= 15;
    }
  }

  // City right
  const cidadeStr = `${extractCity(a)}, ${formatDateBR(a.data_atendimento)}.`;
  const cW = serif.widthOfTextAtSize(cidadeStr, 12);
  page.drawText(cidadeStr, { x: width - margin - cW, y: 280, size: 12, font: serif, color: ink });

  // Signature centered
  const sigY = 200;
  const sigW = 320;
  const sigX = (width - sigW) / 2;
  await drawSignature(pdf, page, sigX + (sigW - 240)/2, sigY + 6, 240, a.medico_nome);
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 0.7, color: navy });
  const dn = a.medico_nome;
  const dnW = serifB.widthOfTextAtSize(dn, 12);
  page.drawText(dn, { x: sigX + (sigW - dnW)/2, y: sigY - 16, size: 12, font: serifB, color: navy });
  if (!a.omitir_crm) {
    const crm = `CRM ${a.medico_crm}`;
    const cw = serif.widthOfTextAtSize(crm, 10.5);
    page.drawText(crm, { x: sigX + (sigW - cw)/2, y: sigY - 30, size: 10.5, font: serif, color: muted });
  }
  if (a.medico_especialidade) {
    const esp = a.medico_especialidade;
    const ew = serifI.widthOfTextAtSize(esp, 10.5);
    page.drawText(esp, { x: sigX + (sigW - ew)/2, y: sigY - 44, size: 10.5, font: serifI, color: gold });
  }

  // QR bottom-right
  await drawQR(pdf, page, validateUrl, width - margin - 70, 80, 60, muted);

  // Bottom navy footer
  page.drawRectangle({ x: 0, y: 0, width, height: 36, color: navy });
  page.drawRectangle({ x: 0, y: 36, width, height: 2, color: gold });
  if (a.clinica_nome) page.drawText(a.clinica_nome, { x: margin, y: 18, size: 9, font: serifB, color: rgb(1,1,1) });
  if (a.clinica_endereco) page.drawText(a.clinica_endereco, { x: margin, y: 7, size: 7.5, font: sans, color: gold });
  const idTxt = `ID ${a.id}`;
  page.drawText(idTxt, { x: width - margin - sans.widthOfTextAtSize(idTxt, 7), y: 12, size: 7, font: sans, color: gold });
}

// =========================================================
// Template 5: HOLÍSTICO — warm wellness, organic shapes, soft serif
// =========================================================
async function renderHolistico(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifI = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bg = rgb(0.98, 0.96, 0.92); // warm cream
  const sage = rgb(0.42, 0.55, 0.43);
  const clay = rgb(0.78, 0.45, 0.32);
  const ink = rgb(0.18, 0.16, 0.14);
  const muted = rgb(0.50, 0.46, 0.40);

  page.drawRectangle({ x: 0, y: 0, width, height, color: bg });
  // Organic top circles
  page.drawCircle({ x: -30, y: height + 20, size: 160, color: sage, opacity: 0.18 });
  page.drawCircle({ x: width + 40, y: height - 60, size: 120, color: clay, opacity: 0.20 });
  // Bottom blob
  page.drawCircle({ x: width - 80, y: -40, size: 180, color: sage, opacity: 0.14 });

  const margin = 60;

  // Wordmark
  page.drawText("be ⋅ well", { x: margin, y: height - 60, size: 22, font: serifI, color: sage });
  page.drawLine({ start: { x: margin, y: height - 68 }, end: { x: margin + 80, y: height - 68 }, thickness: 0.6, color: clay });
  page.drawText("CUIDADO INTEGRATIVO", { x: margin, y: height - 82, size: 7.5, font: sansB, color: muted });

  // Right small pill
  const pill = "Atestado · Confidencial";
  const pw = sans.widthOfTextAtSize(pill, 9) + 22;
  page.drawRectangle({ x: width - margin - pw, y: height - 70, width: pw, height: 22, color: sage, opacity: 0.85 });
  page.drawText(pill, { x: width - margin - pw + 11, y: height - 64, size: 9, font: sans, color: rgb(1,1,1) });

  // Big serif title
  let y = height - 150;
  page.drawText("Atestado", { x: margin, y, size: 56, font: serifI, color: ink });
  page.drawText("de afastamento", { x: margin, y: y - 36, size: 18, font: serif, color: clay });

  y -= 90;

  // Patient row
  page.drawText("Para", { x: margin, y, size: 9, font: sansB, color: muted });
  page.drawText(a.nome_paciente, { x: margin + 36, y, size: 16, font: serif, color: ink });
  page.drawLine({ start: { x: margin + 36, y: y - 4 }, end: { x: width - margin, y: y - 4 }, thickness: 0.4, color: muted });

  y -= 36;

  // Body
  const body =
    `Com cuidado e atenção, atesto que o(a) paciente acima esteve sob avaliação clínica em ${formatDateBR(a.data_atendimento)}, ` +
    `e necessita de um período de descanso e recuperação de ${pad2(a.dias)} (${diasPorExtenso(a.dias).toLowerCase()}) dia(s), ` +
    `a contar da referida data, para a restauração plena de sua saúde.`;
  for (const ln of wrap(body, serif, 12, width - margin*2)) {
    page.drawText(ln, { x: margin, y, size: 12, font: serif, color: ink });
    y -= 18;
  }

  if (a.cid) {
    y -= 12;
    const chip = `CID ${a.cid}`;
    const cw = sansB.widthOfTextAtSize(chip, 9) + 18;
    page.drawRectangle({ x: margin, y: y - 5, width: cw, height: 20, borderColor: clay, borderWidth: 0.8, color: rgb(1,1,1) });
    page.drawText(chip, { x: margin + 9, y: y, size: 9, font: sansB, color: clay });
    y -= 22;
  }

  if (a.observacao) {
    y -= 16;
    page.drawText("Notas do(a) profissional", { x: margin, y, size: 8.5, font: sansB, color: sage });
    y -= 14;
    for (const ln of wrap(a.observacao, serifI, 11, width - margin*2)) {
      page.drawText(ln, { x: margin, y, size: 11, font: serifI, color: ink });
      y -= 15;
    }
  }

  // City + date
  const cidadeStr = `${extractCity(a)} · ${formatDateBR(a.data_atendimento)}`;
  page.drawText(cidadeStr, { x: margin, y: 270, size: 11, font: serifI, color: muted });

  // Signature on the right
  const sigY = 210;
  const sigW = 260;
  const sigX = width - margin - sigW;
  await drawSignature(pdf, page, sigX + (sigW - 220)/2, sigY + 8, 220, a.medico_nome);
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 0.5, color: ink });
  const dn = a.medico_nome;
  const dnW = serif.widthOfTextAtSize(dn, 12);
  page.drawText(dn, { x: sigX + (sigW - dnW)/2, y: sigY - 14, size: 12, font: serif, color: ink });
  if (!a.omitir_crm) {
    const crm = `CRM ${a.medico_crm}`;
    const cw = sans.widthOfTextAtSize(crm, 9.5);
    page.drawText(crm, { x: sigX + (sigW - cw)/2, y: sigY - 26, size: 9.5, font: sans, color: muted });
  }
  if (a.medico_especialidade) {
    const esp = a.medico_especialidade;
    const ew = serifI.widthOfTextAtSize(esp, 10);
    page.drawText(esp, { x: sigX + (sigW - ew)/2, y: sigY - 40, size: 10, font: serifI, color: sage });
  }

  // QR bottom-left
  await drawQR(pdf, page, validateUrl, margin, 80, 60, muted);

  // Footer
  if (a.clinica_nome) page.drawText(a.clinica_nome, { x: margin + 80, y: 100, size: 10, font: sansB, color: ink });
  if (a.clinica_endereco) {
    for (const ln of wrap(a.clinica_endereco, sans, 8.5, width - margin - 160).slice(0,2)) {
      page.drawText(ln, { x: margin + 80, y: 86, size: 8.5, font: sans, color: muted });
    }
  }
  page.drawText(`ID ${a.id}`, { x: width - margin - sans.widthOfTextAtSize(`ID ${a.id}`, 7), y: 30, size: 7, font: serifI, color: muted });
}

export async function generateAtestadoPdf(a: AtestadoData, validateUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const tpl = a.template ?? "amorsaude";
  if (tpl === "upa") await renderUPA(pdf, a, validateUrl);
  else if (tpl === "moderno") await renderModerno(pdf, a, validateUrl);
  else if (tpl === "executivo") await renderExecutivo(pdf, a, validateUrl);
  else if (tpl === "holistico") await renderHolistico(pdf, a, validateUrl);
  else await renderAmorSaude(pdf, a, validateUrl);
  return await pdf.save();
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
