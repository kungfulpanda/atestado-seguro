import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
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
  medico_especialidade?: string | null;
  clinica_nome?: string | null;
  clinica_endereco?: string | null;
  omitir_crm?: boolean;
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

function pad2(n: number) { return n.toString().padStart(2, "0"); }

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
  // Pick a cursive font available on most systems
  ctx.font = 'italic 78px "Brush Script MT","Lucida Handwriting","Segoe Script","Comic Sans MS",cursive';
  // Slight rotation for handwriting feel
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.04);
  ctx.fillText(name, 0, 0);
  // Underline flourish
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

function drawHeader(page: PDFPage, a: AtestadoData, s: Style, width: number, height: number, margin: number) {
  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.4, 0.45, 0.55);
  const accent = rgb(0.0, 0.4, 0.25); // green like unimed
  const line = rgb(0.55, 0.6, 0.68);

  // Top brand strip
  const top = height - margin;
  // Logo block (monogram)
  const logoW = 110, logoH = 48;
  page.drawRectangle({ x: margin, y: top - logoH, width: logoW, height: logoH, color: accent });
  page.drawText("MedAtesta", { x: margin + 10, y: top - 30, size: 18, font: s.bold, color: rgb(1,1,1) });

  // Clinic info next to logo
  const clinicX = margin + logoW + 14;
  const nomeClinica = a.clinica_nome?.toUpperCase() || "CONSULTÓRIO MÉDICO";
  page.drawText(nomeClinica, { x: clinicX, y: top - 14, size: 11, font: s.bold, color: ink });
  if (a.clinica_endereco) {
    const lines = wrap(a.clinica_endereco, s.font, 9, width - margin - clinicX);
    let yy = top - 28;
    for (const ln of lines.slice(0, 2)) {
      page.drawText(ln, { x: clinicX, y: yy, size: 9, font: s.font, color: muted });
      yy -= 11;
    }
  } else {
    page.drawText("Documento médico digital", { x: clinicX, y: top - 28, size: 9, font: s.font, color: muted });
  }

  // Info box (table-like)
  const boxTop = top - logoH - 6;
  const rowH = 18;
  const rows = 3;
  const boxH = rowH * rows;
  const boxY = boxTop - boxH;
  page.drawRectangle({
    x: margin, y: boxY, width: width - margin * 2, height: boxH,
    borderColor: line, borderWidth: 0.6, color: rgb(1,1,1),
  });
  // Horizontal lines
  for (let i = 1; i < rows; i++) {
    const yy = boxY + i * rowH;
    page.drawLine({ start: { x: margin, y: yy }, end: { x: width - margin, y: yy }, thickness: 0.4, color: line });
  }

  // Helper to draw label/value cell
  const drawCell = (x: number, y: number, label: string, value: string) => {
    page.drawText(label, { x: x + 6, y: y + 5, size: 8.5, font: s.font, color: muted });
    page.drawText(value, { x: x + 6 + s.font.widthOfTextAtSize(label, 8.5) + 6, y: y + 5, size: 9.5, font: s.bold, color: ink });
  };

  // Row 1: Nome do paciente | Nº Atestado
  const splitX = margin + (width - margin * 2) * 0.62;
  page.drawLine({ start: { x: splitX, y: boxY + rowH * 2 }, end: { x: splitX, y: boxY + boxH }, thickness: 0.4, color: line });
  drawCell(margin, boxY + rowH * 2, "Nome do paciente:", a.nome_paciente);
  drawCell(splitX, boxY + rowH * 2, "Nº Atestado:", a.id.slice(0, 8).toUpperCase());

  // Row 2: Data atendimento | Dias afastamento | CID
  const c2 = margin + (width - margin * 2) * 0.4;
  const c3 = margin + (width - margin * 2) * 0.72;
  page.drawLine({ start: { x: c2, y: boxY + rowH }, end: { x: c2, y: boxY + rowH * 2 }, thickness: 0.4, color: line });
  page.drawLine({ start: { x: c3, y: boxY + rowH }, end: { x: c3, y: boxY + rowH * 2 }, thickness: 0.4, color: line });
  drawCell(margin, boxY + rowH, "Data do atendimento:", formatDateBR(a.data_atendimento));
  drawCell(c2, boxY + rowH, "Dias de afastamento:", `${pad2(a.dias)} (${diasPorExtenso(a.dias)})`);
  drawCell(c3, boxY + rowH, "CID:", a.cid ?? "—");

  // Row 3: Profissional | Data emissão
  page.drawLine({ start: { x: splitX, y: boxY }, end: { x: splitX, y: boxY + rowH }, thickness: 0.4, color: line });
  const profStr = a.medico_especialidade ? `${a.medico_nome} — ${a.medico_especialidade}` : a.medico_nome;
  drawCell(margin, boxY, "Profissional:", profStr);
  const now = new Date();
  drawCell(splitX, boxY, "Data Assinatura:", `${now.toLocaleDateString("pt-BR")} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`);

  return boxY;
}

export async function generateAtestadoPdf(a: AtestadoData, validateUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const s: Style = { font, bold, italic };

  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.4, 0.45, 0.55);
  const lineCol = rgb(0.55, 0.6, 0.68);
  const accent = rgb(0.0, 0.4, 0.25);

  // ============ Page 1 ============
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 42;

  const boxBottom = drawHeader(page, a, s, width, height, margin);

  // Title
  let y = boxBottom - 60;
  const title = "ATESTADO MÉDICO";
  const tSize = 22;
  const tW = bold.widthOfTextAtSize(title, tSize);
  page.drawText(title, { x: (width - tW) / 2, y, size: tSize, font: bold, color: ink });
  y -= 10;
  page.drawLine({
    start: { x: margin, y }, end: { x: width - margin, y },
    thickness: 0.8, color: lineCol,
  });
  y -= 30;

  // Body
  const body = `Atesto que o(a) ${a.nome_paciente.toUpperCase()} necessita permanecer afastado(a) de suas atividades laborativas por ${pad2(a.dias)} (${diasPorExtenso(a.dias)}) dia(s) a partir de ${formatDateBR(a.data_atendimento)} por razões médicas.`;
  for (const ln of wrap(body, font, 11.5, width - margin * 2)) {
    page.drawText(ln, { x: margin, y, size: 11.5, font, color: ink });
    y -= 17;
  }

  // CID consent line
  y -= 14;
  if (a.cid) {
    const consent = `Eu, ${a.nome_paciente.toUpperCase()}, autorizo a inclusão do CID no atestado médico.`;
    for (const ln of wrap(consent, font, 11, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 11, font, color: ink });
      y -= 16;
    }
    y -= 18;
    page.drawText(`CID: ${a.cid}`, { x: margin, y, size: 11.5, font: bold, color: ink });
    y -= 16;
  }

  // Observação
  if (a.observacao) {
    y -= 14;
    page.drawText("Observações:", { x: margin, y, size: 10.5, font: bold, color: accent });
    y -= 14;
    for (const ln of wrap(a.observacao, font, 10.5, width - margin * 2)) {
      page.drawText(ln, { x: margin, y, size: 10.5, font, color: ink });
      y -= 14;
    }
  }

  // Signature + QR row (lower part of the page)
  const sigBaseY = 215;
  const sigLineW = 280;
  const sigStartX = margin + 30;

  // Cursive signature image above the line
  const sigBytes = renderCursiveSignature(a.medico_nome);
  if (sigBytes) {
    try {
      const sigImg = await pdf.embedPng(sigBytes);
      const sigImgW = 220;
      const sigImgH = (sigImg.height / sigImg.width) * sigImgW;
      page.drawImage(sigImg, {
        x: sigStartX + (sigLineW - sigImgW) / 2,
        y: sigBaseY + 4,
        width: sigImgW,
        height: sigImgH,
      });
    } catch { /* ignore */ }
  }

  page.drawLine({
    start: { x: sigStartX, y: sigBaseY }, end: { x: sigStartX + sigLineW, y: sigBaseY },
    thickness: 0.7, color: ink,
  });
  const docName = a.medico_nome.toUpperCase();
  const docW = bold.widthOfTextAtSize(docName, 11);
  page.drawText(docName, { x: sigStartX + (sigLineW - docW) / 2, y: sigBaseY - 14, size: 11, font: bold, color: ink });
  const crmStr = `CRM ${a.medico_crm}${a.medico_especialidade ? " — " + a.medico_especialidade : ""}`;
  const crmW = font.widthOfTextAtSize(crmStr, 10);
  page.drawText(crmStr, { x: sigStartX + (sigLineW - crmW) / 2, y: sigBaseY - 28, size: 10, font, color: muted });
  const carimbo = "Assinatura do Médico";
  const cW = font.widthOfTextAtSize(carimbo, 9);
  page.drawText(carimbo, { x: sigStartX + (sigLineW - cW) / 2, y: sigBaseY - 42, size: 9, font: italic, color: muted });

  // QR panel on the right of the signature
  const qrSize = 110;
  const qrX = width - margin - qrSize - 6;
  const qrY = sigBaseY - 30;
  page.drawRectangle({
    x: qrX - 10, y: qrY - 28, width: qrSize + 20, height: qrSize + 48,
    borderColor: lineCol, borderWidth: 0.6, color: rgb(1, 1, 1),
  });
  const qrDataUrl = await QRCode.toDataURL(validateUrl, { margin: 0, width: 320 });
  const qrPng = await pdf.embedPng(qrDataUrl);
  page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const qrLabel = "Verificar autenticidade";
  const qrLW = bold.widthOfTextAtSize(qrLabel, 8.5);
  page.drawText(qrLabel, { x: qrX + (qrSize - qrLW) / 2, y: qrY + qrSize + 8, size: 8.5, font: bold, color: accent });
  const codigo = `Código: ${a.id.slice(0, 8).toUpperCase()}`;
  const codW = font.widthOfTextAtSize(codigo, 8);
  page.drawText(codigo, { x: qrX + (qrSize - codW) / 2, y: qrY - 14, size: 8, font, color: muted });

  // Footer
  page.drawLine({
    start: { x: margin, y: 70 }, end: { x: width - margin, y: 70 },
    thickness: 0.5, color: lineCol,
  });
  const legal = "Documento médico assinado e armazenado em sistema seguro. A autenticidade pode ser verificada pelo QR Code acima.";
  let yL = 56;
  for (const ln of wrap(legal, italic, 8, width - margin * 2)) {
    page.drawText(ln, { x: margin, y: yL, size: 8, font: italic, color: muted });
    yL -= 10;
  }
  page.drawText(`ID: ${a.id}`, { x: margin, y: 30, size: 7.5, font, color: muted });

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
