import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import amorLogoUrl from "@/assets/templates/amorsaude-logo.jpg";
import unimedLogoUrl from "@/assets/templates/unimed-logo.jpg";
import upaSusUrl from "@/assets/templates/upa-sus.jpg";
import upa24Url from "@/assets/templates/upa-24h.jpg";

export type AtestadoTemplate = "amorsaude" | "unimed" | "upa";

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
    // try to find a city-like token (after dash) e.g. "Rua X - Bairro - Cidade - CEP ..."
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

interface Style { font: PDFFont; bold: PDFFont; italic: PDFFont; }

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  return new Uint8Array(await r.arrayBuffer());
}

async function embedJpg(pdf: PDFDocument, url: string): Promise<PDFImage> {
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
// Template 1: AmorSaúde
// =========================================================
async function renderAmorSaude(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.1, 0.12, 0.18);
  const teal = rgb(0.34, 0.75, 0.82); // amorsaude blue
  const muted = rgb(0.4, 0.45, 0.55);

  const margin = 42;

  // Logo top-left
  try {
    const logo = await embedJpg(pdf, amorLogoUrl);
    const lw = 180;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: margin, y: height - margin - lh, width: lw, height: lh });
  } catch { /* */ }

  // Title strip
  const stripY = height - margin - 100;
  page.drawRectangle({ x: margin, y: stripY, width: width - margin * 2, height: 36, color: teal });
  const title = "ATESTADO MÉDICO";
  const tW = bold.widthOfTextAtSize(title, 20);
  page.drawText(title, { x: (width - tW) / 2, y: stripY + 11, size: 20, font: bold, color: rgb(1,1,1) });

  // Body text
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

  // Right: city, date
  const rightX = width - margin - 200;
  const cidadeStr = `${extractCity(a)}, ${formatDateBR(a.data_atendimento)}`;
  page.drawText(cidadeStr, { x: rightX, y: 320, size: 12, font: bold, color: ink });

  // Signature
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

  // QR small
  await drawQR(pdf, page, validateUrl, width - margin - 80, 240, 70, muted);

  // Bottom address strip
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
// Template 2: Unimed-style
// =========================================================
async function renderUnimed(pdf: PDFDocument, a: AtestadoData, validateUrl: string) {
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.4, 0.45, 0.55);
  const line = rgb(0.5, 0.55, 0.6);

  const margin = 36;

  // Header table
  const headTop = height - margin;
  const rowH = 18;
  const rows = 4;
  const headH = rowH * rows;
  const headY = headTop - headH;
  page.drawRectangle({ x: margin, y: headY, width: width - margin * 2, height: headH, borderColor: line, borderWidth: 0.6, color: rgb(1,1,1) });
  for (let i = 1; i < rows; i++) {
    const yy = headY + i * rowH;
    page.drawLine({ start: { x: margin, y: yy }, end: { x: width - margin, y: yy }, thickness: 0.4, color: line });
  }

  // Logo cell
  const logoColW = 110;
  page.drawLine({ start: { x: margin + logoColW, y: headY }, end: { x: margin + logoColW, y: headY + headH }, thickness: 0.4, color: line });
  try {
    const logo = await embedJpg(pdf, unimedLogoUrl);
    const lw = 90;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: margin + (logoColW - lw) / 2, y: headY + headH - lh - 6, width: lw, height: lh });
  } catch { /* */ }

  // Top row text (clinic name + address)
  page.drawText((a.clinica_nome ?? "CLÍNICA").toUpperCase(), { x: margin + logoColW + 8, y: headY + headH - 14, size: 10, font: bold, color: ink });
  if (a.clinica_endereco) {
    page.drawText(a.clinica_endereco, { x: margin + logoColW + 8, y: headY + headH - 30, size: 8.5, font, color: muted });
  }

  // Cells
  const cell = (x: number, y: number, label: string, value: string) => {
    page.drawText(label, { x: x + 6, y: y + 5, size: 8, font, color: muted });
    page.drawText(value, { x: x + 6 + font.widthOfTextAtSize(label, 8) + 4, y: y + 5, size: 9, font: bold, color: ink });
  };
  // row 2: paciente | nº atend
  const splitX = margin + logoColW + (width - margin - (margin + logoColW)) * 0.65;
  page.drawLine({ start: { x: splitX, y: headY + rowH }, end: { x: splitX, y: headY + rowH * 2 }, thickness: 0.4, color: line });
  cell(margin, headY + rowH, "Nome do paciente:", a.nome_paciente);
  cell(splitX, headY + rowH, "Nº Atestado:", a.id.slice(0, 8).toUpperCase());

  // row 3: data atend | CID
  const splitX2 = margin + (width - margin * 2) * 0.5;
  page.drawLine({ start: { x: splitX2, y: headY }, end: { x: splitX2, y: headY + rowH }, thickness: 0.4, color: line });
  cell(margin, headY, "Data do atendimento:", formatDateBR(a.data_atendimento));
  cell(splitX2, headY, "CID:", a.cid ?? "—");

  // Title
  let y = headY - 50;
  const title = "ATESTADO MÉDICO";
  const tW = bold.widthOfTextAtSize(title, 16);
  page.drawText(title, { x: (width - tW) / 2, y, size: 16, font: bold, color: ink });
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.6, color: line });
  y -= 28;

  // Body
  const body = `Atesto que o(a) ${a.nome_paciente.toUpperCase()} necessita permanecer afastado de suas atividades laborativas por ${pad2(a.dias)} (${diasPorExtenso(a.dias)}) dia(s) a partir de ${formatDateBR(a.data_atendimento)} por razões médicas.`;
  for (const ln of wrap(body, font, 11, width - margin * 2)) {
    page.drawText(ln, { x: margin, y, size: 11, font, color: ink });
    y -= 16;
  }

  if (a.cid) {
    y -= 18;
    const consent = `Eu, ${a.nome_paciente.toUpperCase()}, autorizo a inclusão do CID no atestado médico.`;
    for (const ln of wrap(consent, font, 11, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 11, font, color: ink });
      y -= 16;
    }
    y -= 16;
    page.drawText(`CID: ${a.cid}`, { x: margin, y, size: 11, font: bold, color: ink });
  }

  if (a.observacao) {
    y -= 24;
    for (const ln of wrap(a.observacao, font, 10.5, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 10.5, font, color: ink });
      y -= 14;
    }
  }

  // Signature center-bottom
  const sigY = 230;
  const sigW = 360;
  const sigX = (width - sigW) / 2;
  await drawSignature(pdf, page, sigX + (sigW - 240) / 2, sigY + 4, 240, a.medico_nome);
  page.drawLine({ start: { x: sigX, y: sigY }, end: { x: sigX + sigW, y: sigY }, thickness: 0.7, color: ink });
  const dn = a.medico_nome.toUpperCase();
  const dnW = bold.widthOfTextAtSize(dn, 11);
  page.drawText(dn, { x: sigX + (sigW - dnW) / 2, y: sigY - 14, size: 11, font: bold, color: ink });
  if (!a.omitir_crm) {
    const crm = `${dn} - CRM ${a.medico_crm}`;
    const cw = font.widthOfTextAtSize(crm, 9.5);
    page.drawText(crm, { x: sigX + (sigW - cw) / 2, y: sigY - 26, size: 9.5, font, color: muted });
  }
  const carimbo = "Assinatura e Carimbo";
  const cw2 = font.widthOfTextAtSize(carimbo, 10);
  page.drawText(carimbo, { x: sigX + (sigW - cw2) / 2, y: sigY - 42, size: 10, font: italic, color: muted });

  // QR + footer block
  await drawQR(pdf, page, validateUrl, width - margin - 80, 90, 70, muted);
  page.drawText(`Código: ${a.id.slice(0, 8).toUpperCase()}`, { x: width - margin - 80, y: 78, size: 8, font, color: muted });

  // Bottom mini header (mirror)
  try {
    const logo = await embedJpg(pdf, unimedLogoUrl);
    const lw = 70;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: margin, y: 60, width: lw, height: lh });
  } catch { /* */ }
  page.drawText((a.clinica_nome ?? "CLÍNICA").toUpperCase(), { x: margin + 80, y: 80, size: 9, font: bold, color: ink });
  if (a.clinica_endereco) page.drawText(a.clinica_endereco, { x: margin + 80, y: 68, size: 8, font, color: muted });
  page.drawText(`ID: ${a.id}`, { x: margin, y: 30, size: 7, font: italic, color: muted });
}

// =========================================================
// Template 3: UPA / SUS
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

  // Header logos centered
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

  // Title
  let y = height - margin - 110;
  const title = "ATESTADO MÉDICO";
  const tW = bold.widthOfTextAtSize(title, 18);
  page.drawText(title, { x: (width - tW) / 2, y, size: 18, font: bold, color: ink });
  y -= 46;

  // Helper: filled blank with label below the line
  // segments: list of { kind: "text"|"blank", value, label? }
  type Seg = { kind: "text" | "blank"; value: string; label?: string; minW?: number };
  const drawRow = (segs: Seg[], yy: number, size = 11) => {
    let x = margin;
    const right = width - margin;
    // First pass: measure fixed text widths
    let fixedW = 0;
    let blankCount = 0;
    let blankFixed = 0;
    for (const s of segs) {
      if (s.kind === "text") fixedW += font.widthOfTextAtSize(s.value, size) + 4;
      else { blankCount++; blankFixed += s.minW ?? 0; }
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

  // Row 1: ATESTO PARA OS DEVIDOS FINS, A PEDIDO, QUE O(A) SR.(A) ____
  drawRow([
    { kind: "text", value: "ATESTO PARA OS DEVIDOS FINS, A PEDIDO, QUE O(A) SR.(A)" },
    { kind: "blank", value: a.nome_paciente, label: "NOME DO PACIENTE" },
  ], y);
  y -= 30;

  // Row 2: full blank for ID/RG (we don't store it)
  drawRow([
    { kind: "blank", value: "", label: "IDENTIDADE OU REGISTRO" },
  ], y);
  y -= 30;

  // Row 3: FOI ATENDIDO(A) NA ____ DO ____
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

  // Row 4: NO DIA ____ ÀS ____ HORAS, NECESSITANDO DE ____ (____) DIAS DE REPOUSO
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

  // City + date centered above signature
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
  const carimbo = "ASSINATURA DO MÉDICO / ODONTÓLOGO (CARIMBO CONTENDO";
  const c2 = "NOME COMPLETO E REGISTRO CRM / CRO)";
  page.drawText(carimbo, { x: sigX + (sigW - font.widthOfTextAtSize(carimbo, 8)) / 2, y: sigY - 40, size: 8, font, color: muted });
  page.drawText(c2, { x: sigX + (sigW - font.widthOfTextAtSize(c2, 8)) / 2, y: sigY - 50, size: 8, font, color: muted });

  // QR + nota
  await drawQR(pdf, page, validateUrl, width - margin - 70, 70, 60, muted);

  const nota = "NOTA: ESTE ATESTADO É VÁLIDO PARA FINALIDADES PREVISTAS NO ARTIGO 27 DE CLIPS, APROVADA PELO DECRETO Nº 89.312 DE 23/01/84.";
  let ny = 90;
  for (const ln of wrap(nota, italic, 8, width - margin * 2 - 90)) {
    page.drawText(ln, { x: margin, y: ny, size: 8, font: italic, color: muted });
    ny -= 10;
  }
  page.drawText(`ID: ${a.id}`, { x: margin, y: 30, size: 7, font: italic, color: muted });
}

export async function generateAtestadoPdf(a: AtestadoData, validateUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const tpl = a.template ?? "amorsaude";
  if (tpl === "unimed") await renderUnimed(pdf, a, validateUrl);
  else if (tpl === "upa") await renderUPA(pdf, a, validateUrl);
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
