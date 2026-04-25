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
const toINRShort = (usdM) => `Rs. ${Math.round(usdM * USD_TO_INR / 10).toLocaleString('en-IN')} Cr`;

// ─── HELPERS ────────────────────────────────────────────────────────────────
const border = (color="CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color="CCCCCC") => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });

const cell = (text, opts={}) => new TableCell({
  borders: borders(opts.borderColor || "DDDDDD"),
  shading: { fill: opts.fill || C.white, type: ShadingType.CLEAR },
  margins: { top: 100, bottom: 100, left: 140, right: 140 },
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
const space = (pt=8) => new Paragraph({ spacing: { before: 0, after: pt*20 }, children: [new TextRun("")] });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 180 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.indigo, space: 4 } },
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: C.indigoDk })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: C.slate })]
  });
}
function body(text, opts={}) {
  return new Paragraph({
    spacing: { before: 40, after: 120 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, font: "Arial", size: 22, color: opts.color || C.dark, bold: opts.bold || false })]
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
    const barWidth = Math.round(pct * 60); // max 6000 DXA
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
    new Paragraph({ spacing: { before: 100, after: 60 }, children: [new TextRun({ text: title, font: "Arial", size: 22, bold: true, color: C.slate })] }),
    new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2500, 6000, 860], rows }),
    space(6),
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
      { id: "Heading1", name: "Heading 1", run: { size: 36, bold: true, font: "Arial", color: C.indigoDk }, paragraph: { spacing: { before: 360, after: 180 } } },
      { id: "Heading2", name: "Heading 2", run: { size: 28, bold: true, font: "Arial", color: C.slate }, paragraph: { spacing: { before: 280, after: 120 } } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe — Scalable Growth Plan", font: "Arial", size: 17, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe AI  •  Page ", font: "Arial", size: 17, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1: THE VISION
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 80, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 }, children: [new TextRun({ text: "Simple, Feasible, and Scalable Meeting AI", font: "Arial", size: 36, color: C.slate })] }),

      h1("1. The Simple Goal"),
      body("MeetScribe helps busy teams turn long meetings into short, useful notes. Instead of writing notes manually, our Chrome extension does it automatically on any meeting site (Google Meet, Zoom, etc.)."),

      h2("Start Small: The MVP"),
      body("We begin with one simple tool: A Chrome Extension for Google Meet that creates a 1-page summary. This is easy to build, easy to use, and solves a big problem for millions of people today."),

      ...barChart("Goal: User Growth (Starting Small to Scaling Big)", [
        { label: "Phase 1: MVP", value: 500, unit: " users" },
        { label: "Phase 2: Growth", value: 5000, unit: " users" },
        { label: "Phase 3: Scale", value: 50000, unit: " users" }
      ]),

      // PAGE 2: WHY WE WIN
      new Paragraph({ children: [new PageBreak()] }),
      h1("2. Why This Works"),
      body("The 'Big Tech' companies (Google, Microsoft, Zoom) only work on their own sites. MeetScribe works everywhere. This is our biggest strength."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 3180, 3180],
        rows: [
          new TableRow({ children: [hCell("Feature"), hCell("Big Companies"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Works on All Sites"), cell("No (Only theirs)"), cell("Yes (Universal)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Local Languages"), cell("English Only"), cell("Hindi, Kannada, Telugu", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Privacy Control"), cell("Low (They own data)"), cell("High (You own data)", { bold: true, color: C.indigo })] }),
        ]
      }),

      h2("Scalable Advantage"),
      body("By focusing on the 'Any-Platform' browser extension, we avoid the heavy costs of building a full meeting app. We grow as the internet grows."),

      // PAGE 3: THE GROWTH STEPS
      new Paragraph({ children: [new PageBreak()] }),
      h1("3. Scalable Growth Plan"),
      body("We grow in three clear steps to keep costs low and profits high."),

      h2("Step 1: Free to Use (The Hook)"),
      body("A free tool that anyone can add to Chrome in 1 click. This brings in thousands of users for Rs. 0 cost."),

      h2("Step 2: Pro Features (The Revenue)"),
      body("Add features like Jira tickets and Indian languages for a small monthly fee. This converts free users into paying customers."),

      ...barChart("Projected Monthly Revenue (Scalable Model)", [
        { label: "Year 1", value: 3, unit: " Lakhs" },
        { label: "Year 2", value: 18, unit: " Lakhs" },
        { label: "Year 3", value: 75, unit: " Lakhs" }
      ]),

      h2("Step 3: Enterprise (The Profit)"),
      body("Sell to large companies that need privacy and security. This is our most profitable area."),

      // PAGE 4: HOW WE MAKE MONEY
      new Paragraph({ children: [new PageBreak()] }),
      h1("4. Simple Pricing (Monthly)"),
      body("Our pricing is simple and clear for everyone."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            cell("Free Plan", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("Pro Plan", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("Team Plan", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 28, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 28, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 28, bold: true, color: C.indigo })
          ]}),
          new TableRow({ children: [
            cell("5 Meetings / mo\nBasic Notes\nEnglish", { size: 18 }),
            cell("Unlimited Mtgs\nJira / Linear\nAll Languages", { size: 18 }),
            cell("Team Dashboard\nPrivacy Alerts\nAdmin Tools", { size: 18 })
          ]})
        ]
      }),

      h2("Why This Is Profitable"),
      body("Our costs are very low because we use smart AI models that don't cost much to run. For every Rs. 100 we make, our cost is only Rs. 12."),

      // PAGE 5: TECH & ROADMAP
      new Paragraph({ children: [new PageBreak()] }),
      h1("5. How It Works (Simply)"),
      bullet("Step 1: You start a meeting in your browser."),
      bullet("Step 2: MeetScribe catches the audio silently."),
      bullet("Step 3: AI turns audio into text and text into a summary."),
      bullet("Step 4: You get your notes in your dashboard instantly."),

      h2("Next 12 Months"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          new TableRow({ children: [hCell("Months"), hCell("What We Build")] }),
          new TableRow({ children: [cell("1-3"), cell("Launch MVP for Google Meet")] }),
          new TableRow({ children: [cell("4-6"), cell("Add Payments + Hindi Support")] }),
          new TableRow({ children: [cell("7-12"), cell("Add Teams/Zoom Support + Jira")] }),
        ]
      }),

      // PAGE 6: CONCLUSION
      new Paragraph({ children: [new PageBreak()] }),
      h1("6. Why MeetScribe Now?"),
      body("Meetings are not going away. Hybrid work is here to stay. MeetScribe is the simple solution that works for everyone, everywhere."),

      h2("Strategic Summary"),
      bullet("Feasible: Built as an extension, not a full meeting app."),
      bullet("Scalable: Thousands of users can join for low cost."),
      bullet("Profitable: High margins with automated AI tools."),

      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — Turning Every Meeting Into Action", font: "Arial", size: 30, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2026 Scalable Growth Document", font: "Arial", size: 18, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Simple_Scalable_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Simple_Scalable_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
