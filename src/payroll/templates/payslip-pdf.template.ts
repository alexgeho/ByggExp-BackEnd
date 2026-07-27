export type PayslipLine = {
  name?: string;
  hours?: number;
  rate?: number;
  multiplier?: number;
  hourType?: string;
  amount?: number;
  tax?: number;
  net?: number;
};

export type PayslipData = {
  companyName?: string;
  orgNumber?: string;
  periodFrom?: string;
  periodTo?: string;
  taxRate?: number;
  employerRate?: number;
  line: PayslipLine;
};

function money(value?: number): string {
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function esc(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function buildPayslipHtml(data: PayslipData): string {
  const l = data.line;
  const employerCost = (Number(l.amount) || 0) * (1 + (Number(data.employerRate) || 0) / 100);

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Lönespecifikation</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1b2a3a; margin: 0; }
    .page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1b2a3a; padding-bottom: 12px; margin-bottom: 20px; }
    .title { font-size: 24px; font-weight: bold; }
    .muted { color: #64748b; font-size: 13px; }
    .who { font-size: 18px; font-weight: bold; margin: 0 0 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; border-bottom: 1.5px solid #1b2a3a; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
    .r { text-align: right; }
    .totals { margin-top: 18px; margin-left: auto; width: 55%; }
    .totals td { border: none; padding: 4px 8px; }
    .totals .grand td { border-top: 1.5px solid #1b2a3a; font-size: 18px; font-weight: bold; padding-top: 8px; }
    .foot { margin-top: 24px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <main class="page">
    <div class="head">
      <div>
        <div class="title">Lönespecifikation</div>
        <div class="muted">Period ${esc(data.periodFrom)} – ${esc(data.periodTo)}</div>
      </div>
      <div class="r">
        <div style="font-weight:bold">${esc(data.companyName)}</div>
        <div class="muted">Org.nr ${esc(data.orgNumber) || '—'}</div>
      </div>
    </div>

    <p class="who">${esc(l.name) || '—'}</p>

    <table>
      <thead>
        <tr><th>Beskrivning</th><th class="r">Timmar</th><th class="r">Timlön</th><th class="r">Faktor</th><th class="r">Belopp</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Arbetad tid${l.hourType && l.hourType !== 'normal' ? ` (${esc(l.hourType)})` : ''}</td>
          <td class="r">${money(l.hours)}</td>
          <td class="r">${money(l.rate)}</td>
          <td class="r">${money(l.multiplier)}</td>
          <td class="r">${money(l.amount)}</td>
        </tr>
      </tbody>
    </table>

    <table class="totals">
      <tr><td>Bruttolön</td><td class="r">${money(l.amount)} kr</td></tr>
      <tr><td>Preliminär skatt (${money(data.taxRate)}%)</td><td class="r">-${money(l.tax)} kr</td></tr>
      <tr class="grand"><td>Nettolön</td><td class="r">${money(l.net)} kr</td></tr>
    </table>

    <p class="foot">
      Arbetsgivaravgift (${money(data.employerRate)}%) tillkommer för arbetsgivaren.
      Total arbetsgivarkostnad för denna rad: ${money(employerCost)} kr.
      Skatten är en förenklad schablon — kontrollera mot Skatteverkets tabell.
    </p>
  </main>
</body>
</html>`;
}
