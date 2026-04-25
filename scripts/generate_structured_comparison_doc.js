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
      size: opts.size || 21,
      font: "Arial"
    })]
  })]
});

const hCell = (text, fill=C.indigoDk) => cell(text, { fill, bold: true, color: C.white, size: 21 });
const space = (pt=10) => new Paragraph({ spacing: { before: 0, after: pt*20 }, children: [new TextRun("")] });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.indigo, space: 4 } },
    children: [new TextRun({ text, font: "Arial", size: 38, bold: true, color: C.indigoDk })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, font: "Arial", size: 30, bold: true, color: C.slate })]
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 50, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 23, color: C.dark })]
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
        cell(`${value}${unit}`, { width: 860, align: AlignmentType.RIGHT, bold: true, color: C.indigo }),
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
    default: { document: { run: { font: "Arial", size: 23 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", run: { size: 38, bold: true, font: "Arial", color: C.indigoDk }, paragraph: { spacing: { before: 400, after: 200 } } },
      { id: "Heading2", name: "Heading 2", run: { size: 30, bold: true, font: "Arial", color: C.slate }, paragraph: { spacing: { before: 300, after: 150 } } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe — Strategic Growth and Comparison", font: "Arial", size: 18, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe Business Summary  •  Page ", font: "Arial", size: 18, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1: CORE VISION
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 84, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 }, children: [new TextRun({ text: "The Future of Smart and Actionable Meetings", font: "Arial", size: 36, color: C.slate })] }),

      h1("1. Key Vision and 2026 Market"),
      bullet("Smart Assistant: We turn long meetings into short and useful actions."),
      bullet("Any Platform: Our tool works everywhere you meet, from Google Meet to Zoom."),
      bullet("Local First: We natively support Hindi, Kannada, and Telugu languages."),
      bullet("Privacy Driven: We capture audio locally so your data stays safe and private."),

      ...barChart("Market Growth in 2026 (Indian Market)", [
        { label: "Market Size", value: 15000, unit: " Cr" },
        { label: "Adoption Rate", value: 42, unit: "%" },
        { label: "MeetScribe Target", value: 500, unit: " Cr" }
      ]),

      // PAGE 2: DEEP COMPARISON
      new Paragraph({ children: [new PageBreak()] }),
      h1("2. MeetScribe versus The Giants"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({ children: [hCell("Factor"), hCell("Big Tech (Zoom/MS)"), hCell("Bots (Fireflies)"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Site Access"), cell("Only their own"), cell("Most sites"), cell("Any site and tab", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Privacy"), cell("High control"), cell("Low (Bot is visible)"), cell("High (Local capture)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Regional"), cell("No support"), cell("Partial support"), cell("Full and Native", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Moderation"), cell("No"), cell("No"), cell("Real-time alerts", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Jira Sync"), cell("None"), cell("Yes"), cell("Auto and Deep", { bold: true, color: C.indigo })] }),
        ]
      }),

      h2("Why We Lead in 2026"),
      bullet("We are an extension, not a bot. This makes us silent and professional."),
      bullet("We work on top of your existing tools, not instead of them."),
      bullet("We understand how Indians talk, mixing English and local languages."),

      // PAGE 3: STRENGTH FACTORS
      new Paragraph({ children: [new PageBreak()] }),
      h1("3. Strategic Strength Factors"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2500, 3430, 3430],
        rows: [
          new TableRow({ children: [hCell("Factor"), hCell("Why Others Fail"), hCell("MeetScribe Win")] }),
          new TableRow({ children: [cell("Freedom"), cell("They lock you in."), cell("We give you choice.")] }),
          new TableRow({ children: [cell("Speed"), cell("Slow summaries."), cell("Instant and Live.")] }),
          new TableRow({ children: [cell("Focus"), cell("Meetings drift."), cell("AI keeps you on track.")] }),
          new TableRow({ children: [cell("Setup"), cell("Complex apps."), cell("1-click Chrome tool.")] }),
        ]
      }),

      h2("Feasible Scalability"),
      bullet("Low Cost: We don't need huge servers for every call."),
      bullet("High Reach: Every Chrome user is a potential customer."),
      bullet("Easy Entry: Free to start and paid to grow."),

      // PAGE 4: BUSINESS MODEL
      new Paragraph({ children: [new PageBreak()] }),
      h1("4. Simple and Scalable Business Model"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            cell("The Free Tier", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("The Pro Tier", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("The Team Tier", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 30, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.indigo })
          ]}),
          new TableRow({ children: [
            cell("Basic summaries and 5 meetings a month", { size: 20 }),
            cell("Unlimited meetings and local languages", { size: 20 }),
            cell("Team analytics and privacy alerts", { size: 20 })
          ]})
        ]
      }),

      h2("Steps to Growth"),
      bullet("Launch MVP: Start with Google Meet and early fans."),
      bullet("Add Value: Bring in Jira and Linear for power users."),
      bullet("Go Regional: Dominate the Indian market with Hindi and others."),
      bullet("Partner Up: List on the Jira and Slack marketplaces."),

      // PAGE 5: TECH AND ROADMAP
      new Paragraph({ children: [new PageBreak()] }),
      h1("5. How It Works and Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 7560],
        rows: [
          new TableRow({ children: [hCell("Step"), hCell("Process")] }),
          new TableRow({ children: [cell("1"), cell("Extension captures meeting audio from your browser tab.")] }),
          new TableRow({ children: [cell("2"), cell("AI identifies speakers and transcribes them instantly.")] }),
          new TableRow({ children: [cell("3"), cell("Key actions and notes are generated and filed for you.")] }),
        ]
      }),

      h2("12-Month Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          new TableRow({ children: [hCell("Months"), hCell("Building Value")] }),
          new TableRow({ children: [cell("1 to 3"), cell("Google Meet MVP launch and basic summaries.")] }),
          new TableRow({ children: [cell("4 to 6"), cell("Payments and Hindi support and Jira sync.")] }),
          new TableRow({ children: [cell("7 to 12"), cell("Zoom and Teams support and Team dashboards.")] }),
        ]
      }),

      // PAGE 6: SUCCESS STRATEGY
      new Paragraph({ children: [new PageBreak()] }),
      h1("6. Success Strategy and Conclusion"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [hCell("Strengths"), hCell("Weaknesses"), hCell("Risks")] }),
          new TableRow({ children: [cell("Universal reach and Local support"), cell("New brand and Chrome only"), cell("Platform changes and Data rules")] }),
        ]
      }),

      h2("Strategic Conclusion"),
      bullet("We have a plan that is simple to start and easy to scale."),
      bullet("By focusing on people and privacy, we stand out from the giants."),
      bullet("Our tech is feasible and ready for the 2026 market."),

      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — Turning Every Meeting Into Action", font: "Arial", size: 34, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2026 Strategic Business Plan", font: "Arial", size: 20, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Structured_Comparison_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Structured_Comparison_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
