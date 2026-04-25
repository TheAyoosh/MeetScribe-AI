const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak, VerticalAlign, PageNumber, Footer, Header
} = require('docx');
const fs = require('fs');

// ─── COLORS ─────────────────────────────────────────────────────────────────
const C = {
  indigo:   "4F46E5",
  indigoDk: "3730A3",
  indigoLt: "EEF2FF",
  teal:     "0D9488",
  tealLt:   "CCFBF1",
  amber:    "D97706",
  amberLt:  "FEF3C7",
  red:      "DC2626",
  redLt:    "FEE2E2",
  green:    "059669",
  greenLt:  "D1FAE5",
  gray:     "6B7280",
  grayLt:   "F9FAFB",
  grayMd:   "E5E7EB",
  dark:     "111827",
  white:    "FFFFFF",
  slate:    "1E293B",
  slateLt:  "F1F5F9",
};

// ─── CONVERSION ─────────────────────────────────────────────────────────────
const USD_TO_INR = 84; 
const toINR = (usd) => `Rs. ${Math.round(usd * USD_TO_INR).toLocaleString('en-IN')}`;

// ─── HELPERS ────────────────────────────────────────────────────────────────
const border = (color="CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color="CCCCCC") => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

const cell = (text, opts={}) => new TableCell({
  borders: borders(opts.borderColor || "DDDDDD"),
  shading: { fill: opts.fill || C.white, type: ShadingType.CLEAR },
  margins: { top: 120, bottom: 120, left: 160, right: 160 },
  verticalAlign: VerticalAlign.CENTER,
  width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  columnSpan: opts.span,
  children: [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text: String(text),
      bold: opts.bold || false,
      color: opts.color || C.dark,
      size: opts.size || 20,
      font: "Arial"
    })]
  })]
});

const hCell = (text, fill=C.indigoDk) => cell(text, { fill, bold: true, color: C.white, size: 20 });
const space = (pt=10) => new Paragraph({ spacing: { before: 0, after: pt*20 }, children: [new TextRun("")] });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.indigo, space: 4 } },
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: C.indigoDk })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: C.slate })]
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: C.indigo })]
  });
}
function body(text, opts={}) {
  return new Paragraph({
    spacing: { before: 60, after: 140 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, font: "Arial", size: 22, color: opts.color || C.dark, bold: opts.bold || false, italics: opts.italic || false })]
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.dark })]
  });
}

// ─── GRAPH HELPER ───────────────────────────────────────────────────────────
function barChart(title, items) {
  const maxVal = Math.max(...items.map(i=>i.value));
  const rows = items.map(({ label, value, unit="" }) => {
    const pct = Math.round((value / maxVal) * 100);
    const barWidth = Math.round(pct * 60); 
    return new TableRow({
      children: [
        cell(label, { width: 2500, bold: true }),
        new TableCell({
          width: { size: 6000, type: WidthType.DXA },
          children: [new Table({
            width: { size: 6000, type: WidthType.DXA },
            columnWidths: [barWidth || 1, Math.max(6000 - barWidth, 1)],
            rows: [new TableRow({ children: [
              new TableCell({ shading: { fill: C.indigo, type: ShadingType.CLEAR }, width: { size: barWidth, type: WidthType.DXA }, children: [new Paragraph("")] }),
              new TableCell({ shading: { fill: C.grayLt, type: ShadingType.CLEAR }, width: { size: 6000-barWidth, type: WidthType.DXA }, children: [new Paragraph("")] }),
            ]})]
          })]
        }),
        cell(`${value.toLocaleString('en-IN')}${unit}`, { width: 860, align: AlignmentType.RIGHT, bold: true, color: C.indigo }),
      ]
    });
  });
  return [
    new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: title, font: "Arial", size: 24, bold: true, color: C.slate })] }),
    new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2500, 6000, 860], rows }),
    space(8),
  ];
}

// ─── DOCUMENT BUILD ──────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", run: { size: 36, bold: true, font: "Arial", color: C.indigoDk }, paragraph: { spacing: { before: 400, after: 200 } } },
      { id: "Heading2", name: "Heading 2", run: { size: 28, bold: true, font: "Arial", color: C.slate }, paragraph: { spacing: { before: 300, after: 150 } } },
      { id: "Heading3", name: "Heading 3", run: { size: 24, bold: true, font: "Arial", color: C.indigo }, paragraph: { spacing: { before: 200, after: 100 } } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe 2026 — Deep Dive Business Strategy  |  Confidential", font: "Arial", size: 17, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe Strategic Analysis  •  Page ", font: "Arial", size: 17, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1: 2026 MARKET INTEL
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 80, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 }, children: [new TextRun({ text: "Strategic Deep Dive and Market Comparison 2026", font: "Arial", size: 30, color: C.slate })] }),

      h1("1. Executive Market Intelligence"),
      body("As of early 2026, the demand for AI in meetings has shifted from simple 'recording' to 'intelligent action'. Enterprises no longer want just a transcript; they want a tool that understands context, handles local Indian languages, and integrates with their workflow automatically."),

      ...barChart("Indian AI Meeting Market Growth (In Crore Rupees)", [
        { label: "2024 Actual", value: 22000, unit: "" },
        { label: "2025 Projected", value: 28500, unit: "" },
        { label: "2026 Projected", value: 35280, unit: "" }
      ]),

      h2("Key Market Shifts in 2026"),
      bullet("Privacy Mandates: Over 45 percent of companies now block external bots from joining meetings. MeetScribe wins here as a silent browser extension."),
      bullet("Multilingual Workforce: 70 percent of Indian knowledge workers mix English with local languages. MeetScribe handles this native code-switching."),
      bullet("Actionable AI: Meetings are now viewed as data sources for Jira and Linear tickets."),

      // PAGE 2: THE 5-PLATFORM MATRIX
      new Paragraph({ children: [new PageBreak()] }),
      h1("2. Multi-Platform Comparison Matrix"),
      body("A detailed breakdown of how MeetScribe stands against the four industry leaders across critical business factors."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 1465, 1465, 1465, 1465, 1500],
        rows: [
          new TableRow({ children: [hCell("Feature"), hCell("Zoom AI"), hCell("MS Teams"), hCell("Google Meet"), hCell("Fireflies"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Price (mo)"), cell("Rs. 1,350"), cell("Rs. 2,520"), cell("Rs. 1,680"), cell("Rs. 1,510"), cell("Rs. 849", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Site Reach"), cell("Only Zoom"), cell("Only Teams"), cell("Only Meet"), cell("Most sites"), cell("Any site", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Bot Needed"), cell("No"), cell("No"), cell("No"), cell("Yes (Bot)"), cell("No (Silent)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Languages"), cell("English"), cell("English"), cell("English"), cell("Partial"), cell("Full H/K/T", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Moderation"), cell("No"), cell("No"), cell("No"), cell("No"), cell("Live Alerts", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Action Items"), cell("Basic"), cell("Good"), cell("Limited"), cell("Very Good"), cell("Auto-Jira", { bold: true, color: C.indigo })] }),
        ]
      }),

      h3("Explaining the Gaps"),
      bullet("Cost: MS Teams Copilot is nearly 3 times more expensive than MeetScribe Pro."),
      bullet("Freedom: Native tools lock you into their ecosystem. MeetScribe works across all tabs."),
      bullet("Indian Market: None of the giants natively support the Kannada and Telugu nuances we provide."),

      // PAGE 3: DIFFERENTIATORS EXPLAINED
      new Paragraph({ children: [new PageBreak()] }),
      h1("3. Strategic Strengths and Examples"),
      body("To understand our value, we must look at real-world scenarios where the giants fail and MeetScribe excels."),

      h2("Platform Freedom (Cross-Platform)"),
      body("Example: An agency starts a client pitch on Google Meet, but the client asks to move to a Zoom link for a demo. With native tools, the transcription is lost or split. MeetScribe continues capturing seamlessly across tabs, keeping the entire conversation in one record."),

      h2("Local Language Mastery (H/K/T Support)"),
      body("Example: A developer in Bangalore says, 'I have finished the sprint and eegiga deploy maadthiddini'. Native tools will fail on the Kannada portion. MeetScribe identifies the language switch and transcribes the full meaning: 'I have finished the sprint and am deploying it now'."),

      h2("Real-Time Moderation and Intervention"),
      body("Example: During a high-stress project meeting, a participant starts using unprofessional language or goes completely off-topic for more than 3 minutes. MeetScribe's AI detects this and sends a private alert to the speaker or moderator, keeping the meeting on track and professional."),

      h2("Silent and Private Capture"),
      body("Example: A sensitive legal meeting does not allow 'Fireflies AI' bots to join for security reasons. MeetScribe, being a browser extension, works silently in the background without needing an external bot to join the call, satisfying enterprise security protocols."),

      // PAGE 4: BUSINESS MODEL AND SCALING
      new Paragraph({ children: [new PageBreak()] }),
      h1("4. Business Model and Economics"),
      body("We follow a high-margin scalable path that starts with user value and moves into enterprise profit."),

      h2("MVP and Scalability"),
      body("Our MVP focuses on the Google Meet community—the largest segment of the Indian remote workforce. By starting here, we validate our tech with low risk before scaling to Zoom and Teams."),

      ...barChart("Projected Revenue Scalability (In Lakhs per Month)", [
        { label: "Q1 2026", value: 2.8, unit: " L" },
        { label: "Q2 2026", value: 12.5, unit: " L" },
        { label: "Q3 2026", value: 34.0, unit: " L" },
        { label: "Q4 2026", value: 78.5, unit: " L" }
      ]),

      h2("Unit Economics: Why it Scales"),
      bullet("Gross Margin: 88 percent. We use serverless AI inference which keeps costs tied directly to usage."),
      bullet("LTV/CAC: 8.5x. Our organic growth through the Chrome store keeps marketing costs very low."),
      bullet("Payback Period: Less than 3 months. A Pro user pays for their acquisition cost within their first quarter."),

      // PAGE 5: TECH AND ROADMAP
      new Paragraph({ children: [new PageBreak()] }),
      h1("5. Technical Feasibility and Roadmap"),
      body("Our technology is built to avoid the 'Bot Problem' that prevents 3rd party tools from entering large enterprises."),

      h3("Extension vs. Bot Technology"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [hCell("Factor"), hCell("Bot Technology"), hCell("MeetScribe Extension")] }),
          new TableRow({ children: [cell("Security"), cell("High risk (External)"), cell("Safe (Local tab access)")] }),
          new TableRow({ children: [cell("Visibility"), cell("Visible to everyone"), cell("Silent and Private")] }),
          new TableRow({ children: [cell("Setup"), cell("Invite to meeting"), cell("1-Click from Chrome Store")] }),
        ]
      }),

      h2("Strategic 24-Month Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 7560],
        rows: [
          new TableRow({ children: [hCell("Phase"), hCell("Goal and Outcome")] }),
          new TableRow({ children: [cell("Phase 1"), cell("Launch Google Meet MVP and validate Indian language diarization for 1,000 users.")] }),
          new TableRow({ children: [cell("Phase 2"), cell("Roll out Jira and Linear sync and launch the Pro subscription tier.")] }),
          new TableRow({ children: [cell("Phase 3"), cell("Full support for Zoom and Teams tabs and launch the Scout Voice Agent.")] }),
          new TableRow({ children: [cell("Phase 4"), cell("Enterprise self-hosted version and API for third-party developers.")] }),
        ]
      }),

      // PAGE 6: CONCLUSION
      new Paragraph({ children: [new PageBreak()] }),
      h1("6. Strategy and Final Conclusion"),
      body("MeetScribe is not just another transcription tool. It is the intelligence layer for the modern, multilingual, and cross-platform workforce of 2026."),

      h2("Go-To-Market Pillars"),
      bullet("Chrome Store SEO: Targeting terms like 'Zoom notes' and 'Google Meet transcription'."),
      bullet("Open Source Credibility: Attracting developers through our core transparency."),
      bullet("Niche Dominance: Winning the Indian IT sector through superior local language support."),

      h2("Final Strategic Position"),
      body("By 2026, we aim to be the default choice for the Rs. 35,000 Cr market, providing a professional and feasible alternative to the restrictive and expensive 'Big Tech' offerings."),

      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — Turning Every Conversation Into Action", font: "Arial", size: 34, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2026 Deep Dive Strategic Document", font: "Arial", size: 20, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_DeepDive_Comparison_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_DeepDive_Comparison_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
