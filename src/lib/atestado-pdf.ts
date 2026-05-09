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

  // Signature block (centered, lower)
  const sigY = 230;
  const sigStartX = (width - 320) / 2;
  page.drawLine({
    start: { x: sigStartX, y: sigY }, end: { x: sigStartX + 320, y: sigY },
    thickness: 0.7, color: ink,
  });
  const docName = a.medico_nome.toUpperCase();
  const docW = bold.widthOfTextAtSize(docName, 11);
  page.drawText(docName, { x: (width - docW) / 2, y: sigY - 14, size: 11, font: bold, color: ink });
  const crmStr = `CRM ${a.medico_crm}${a.medico_especialidade ? " — " + a.medico_especialidade : ""}`;
  const crmW = font.widthOfTextAtSize(crmStr, 10);
  page.drawText(crmStr, { x: (width - crmW) / 2, y: sigY - 28, size: 10, font, color: muted });
  const carimbo = "Assinatura e Carimbo";
  const cW = font.widthOfTextAtSize(carimbo, 10);
  page.drawText(carimbo, { x: (width - cW) / 2, y: sigY - 46, size: 10, font: italic, color: muted });

  // Footer
  page.drawLine({
    start: { x: margin, y: 70 }, end: { x: width - margin, y: 70 },
    thickness: 0.5, color: lineCol,
  });
  page.drawText(`Documento eletrônico gerado em ${new Date().toLocaleString("pt-BR")}`, {
    x: margin, y: 56, size: 8, font, color: muted,
  });
  page.drawText(`ID: ${a.id}`, { x: margin, y: 44, size: 8, font, color: muted });
  const pgNum = "Página 1 de 2";
  page.drawText(pgNum, { x: width - margin - font.widthOfTextAtSize(pgNum, 8), y: 44, size: 8, font, color: muted });

  // ============ Page 2 (validation) ============
  const p2 = pdf.addPage([595, 842]);
  drawHeader(p2, a, s, width, height, margin);
  let y2 = height - margin - 130;
  const t2 = "Validação do Documento";
  const t2W = bold.widthOfTextAtSize(t2, 18);
  p2.drawText(t2, { x: (width - t2W) / 2, y: y2, size: 18, font: bold, color: ink });
  y2 -= 28;
  const intro = "A validação do documento poderá ser realizada através do QR Code ou do link abaixo.";
  for (const ln of wrap(intro, font, 11, width - margin * 2)) {
    const w = font.widthOfTextAtSize(ln, 11);
    p2.drawText(ln, { x: (width - w) / 2, y: y2, size: 11, font, color: ink });
    y2 -= 16;
  }
  y2 -= 20;

  // QR
  const qrSize = 200;
  const qrX = (width - qrSize) / 2;
  const qrY = y2 - qrSize;
  p2.drawRectangle({
    x: qrX - 14, y: qrY - 14, width: qrSize + 28, height: qrSize + 28,
    borderColor: lineCol, borderWidth: 0.6, color: rgb(1, 1, 1),
  });
  const qrDataUrl = await QRCode.toDataURL(validateUrl, { margin: 0, width: 480 });
  const qrPng = await pdf.embedPng(qrDataUrl);
  p2.drawImage(qrPng, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  let y3 = qrY - 36;
  const apt = "Aponte a câmera do celular ou leitor de QR Code, ou visite:";
  const aptW = font.widthOfTextAtSize(apt, 10);
  p2.drawText(apt, { x: (width - aptW) / 2, y: y3, size: 10, font, color: muted });
  y3 -= 14;
  const linkW = bold.widthOfTextAtSize(validateUrl, 10);
  p2.drawText(validateUrl, { x: (width - linkW) / 2, y: y3, size: 10, font: bold, color: accent });
  y3 -= 22;
  const codigo = `CÓDIGO: ${a.id.slice(0, 8).toUpperCase()}`;
  const codW = bold.widthOfTextAtSize(codigo, 11);
  p2.drawText(codigo, { x: (width - codW) / 2, y: y3, size: 11, font: bold, color: ink });

  // Legal text
  const legal = "Documento assinado eletronicamente. A autenticidade pode ser verificada pelo QR Code ou pelo link acima. Este atestado não pode ser alterado após a emissão e fica armazenado em sistema seguro de registro médico eletrônico, em conformidade com as resoluções do Conselho Federal de Medicina e a legislação aplicável.";
  let yL = 170;
  p2.drawLine({ start: { x: margin, y: yL + 20 }, end: { x: width - margin, y: yL + 20 }, thickness: 0.5, color: lineCol });
  for (const ln of wrap(legal, italic, 9, width - margin * 2)) {
    p2.drawText(ln, { x: margin, y: yL, size: 9, font: italic, color: muted });
    yL -= 12;
  }

  // Footer
  p2.drawLine({ start: { x: margin, y: 70 }, end: { x: width - margin, y: 70 }, thickness: 0.5, color: lineCol });
  p2.drawText(`ID: ${a.id}`, { x: margin, y: 56, size: 8, font, color: muted });
  p2.drawText(`CONFIDENCIAL — uso restrito do paciente e empregador`, {
    x: margin, y: 44, size: 8, font: italic, color: muted,
  });
  const pn2 = "Página 2 de 2";
  p2.drawText(pn2, { x: width - margin - font.widthOfTextAtSize(pn2, 8), y: 44, size: 8, font, color: muted });

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
