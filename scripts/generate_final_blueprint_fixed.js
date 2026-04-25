const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageBreak, VerticalAlign, PageNumber, Footer, Header,
  ImageRun
} = require('docx');
const fs = require('fs');

// ─── ASSETS ─────────────────────────────────────────────────────────────────
const LOGO_PATH = "C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\87cbc918-f5b6-4acd-a890-2801e8d5c590\\meetscribe_logo_professional_1776953205642.png";

// ─── COLORS ─────────────────────────────────────────────────────────────────
const C = {
  indigo:   "4F46E5",
  indigoDk: "3730A3",
  indigoLt: "EEF2FF",
  teal:     "0D9488",
  tealLt:   "CCFBF1",
  slate:    "1E293B",
  gray:     "6B7280",
  grayLt:   "F9FAFB",
  dark:     "111827",
  white:    "FFFFFF",
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
  children: [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text: String(text).replace(/[^\x20-\x7E\n]/g, ""), // Sanitize text
      bold: opts.bold || false,
      color: opts.color || C.dark,
      size: opts.size || 19,
      font: "Arial"
    })]
  })]
});

const hCell = (text, fill=C.indigoDk) => cell(text, { fill, bold: true, color: C.white, size: 19 });
const space = (pt=10) => new Paragraph({ spacing: { before: 0, after: pt*20 }, children: [new TextRun("")] });

function sectionHeader(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.indigo, space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), font: "Arial", size: 26, bold: true, color: C.indigoDk })]
  });
}

function subHeader(text) {
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: C.slate })]
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { before: 60, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 21, color: C.dark })]
  });
}

function bulletPoint(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 21, color: C.dark })]
  });
}

function barChart(title, items, color=C.indigo) {
  const maxVal = Math.max(...items.map(i=>i.value));
  const rows = items.map(({ label, value, unit="" }) => {
    const pct = Math.round((value / maxVal) * 100);
    const barWidth = Math.round(pct * 55); 
    return new TableRow({
      children: [
        cell(label, { width: 2500, bold: true }),
        new TableCell({
          width: { size: 5500, type: WidthType.DXA },
          children: [new Table({
            width: { size: 5500, type: WidthType.DXA },
            rows: [new TableRow({ children: [
              new TableCell({ shading: { fill: color, type: ShadingType.CLEAR }, width: { size: barWidth || 1, type: WidthType.DXA }, children: [new Paragraph("")] }),
              new TableCell({ shading: { fill: C.grayLt, type: ShadingType.CLEAR }, width: { size: (5500-barWidth) || 1, type: WidthType.DXA }, children: [new Paragraph("")] }),
            ]})]
          })]
        }),
        cell(`${value.toLocaleString('en-IN')}${unit}`, { width: 1000, align: AlignmentType.RIGHT, bold: true, color }),
      ]
    });
  });
  return [
    new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: title, font: "Arial", size: 22, bold: true, color: C.slate })] }),
    new Table({ width: { size: 9000, type: WidthType.DXA }, rows }),
  ];
}

// ─── DOCUMENT BUILD ──────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }]
  },
  sections: [{
    properties: { 
      page: { 
        size: { width: 12240, height: 15840 }, 
        margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } 
      } 
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe - Strategic Blueprint 2026", font: "Arial", size: 16, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe Final Presentation - Page ", font: "Arial", size: 16, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1: LOGO & VISION
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: fs.readFileSync(LOGO_PATH),
            transformation: { width: 100, height: 100 }
          })
        ]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 72, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 300 }, children: [new TextRun({ text: "Strategic Intelligence for the 2026 Workforce", font: "Arial", size: 26, color: C.slate })] }),

      sectionHeader("Section 1: The Human and AI Partnership"),
      bodyText("MeetScribe is the intelligence layer that bridges human conversation and digital action. In 2026, we define the professional standard for meetings through silent interception and native language processing."),
      
      space(10),
      sectionHeader("Section 2: 2026 Market Dominance"),
      ...barChart("Market Opportunity (Rupees Cr)", [
        { label: "AI Translation", value: 12000 },
        { label: "Action Automation", value: 15000 },
        { label: "Security", value: 8280 }
      ]),

      // PAGE 2: COMPARISON
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 3: Competitive Matrix"),
      new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [hCell("Factor"), hCell("Zoom AI"), hCell("Teams"), hCell("Meet"), hCell("Bots"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Automation"), cell("Manual"), cell("Basic"), cell("None"), cell("Partial"), cell("Full and Auto")] }),
          new TableRow({ children: [cell("Toxic Detection"), cell("None"), cell("None"), cell("None"), cell("None"), cell("Real-time")] }),
          new TableRow({ children: [cell("Latency"), cell("Batch"), cell("Batch"), cell("Batch"), cell("Slow"), cell("Live")] }),
          new TableRow({ children: [cell("Regional"), cell("Low"), cell("Low"), cell("Low"), cell("Partial"), cell("Full H/K/T")] }),
          new TableRow({ children: [cell("Health Score"), cell("No"), cell("No"), cell("No"), cell("No"), cell("Per Meeting")] }),
          new TableRow({ children: [cell("CRM Sync"), cell("None"), cell("Limited"), cell("None"), cell("Partial"), cell("Native")] }),
        ]
      }),

      space(10),
      sectionHeader("Section 4: Why We Lead"),
      bulletPoint("Latency: Our sub-500ms speed allows for real-time warnings."),
      bulletPoint("Integration: Native syncing with Jira and Slack."),
      bulletPoint("Privacy: Browser interception bypasses bot blocks."),

      // PAGE 3: CASE STUDIES
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 5: Automation Case Studies"),
      subHeader("Automated Workflow"),
      bodyText("Example: A manager says, 'Fix the login bug by Friday'. MeetScribe creates a Jira ticket automatically."),
      subHeader("Bad Word Detection"),
      bodyText("Example: Unprofessional language detected and private warning sent to host."),

      space(10),
      sectionHeader("Section 6: Topic Drift"),
      ...barChart("Time Saved (Hours per call)", [
        { label: "Manual Notes", value: 1.5 },
        { label: "Native Tools", value: 0.8 },
        { label: "MeetScribe", value: 2.2 }
      ], C.teal),

      // PAGE 4: SPECIALIZED
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 7: Specialized Factors"),
      subHeader("98% Speaker Accuracy"),
      bodyText("Precision mapping ensures every word is attributed to the right person."),
      subHeader("Agenda Monitoring"),
      bodyText("AI alerts leaders when the conversation drifts away from the agenda."),

      space(10),
      sectionHeader("Section 8: Cost Savings"),
      ...barChart("Monthly Cost Comparison (Rs)", [
        { label: "Human Scribe", value: 45000 },
        { label: "Transcriptionist", value: 25000 },
        { label: "MeetScribe Pro", value: 849 }
      ], C.slate),

      // PAGE 5: BUSINESS MODEL
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 9: Monetization"),
      new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [cell("Starter", {bold:true}), cell("Professional", {bold:true}), cell("Enterprise", {bold:true})] }),
          new TableRow({ children: [cell("Rs. 0"), cell(toINR(9.99)), cell(toINR(14.99))] }),
          new TableRow({ children: [cell("Basic notes"), cell("Unlimited + Jira"), cell("Alerts + Admin")] }),
        ]
      }),

      space(10),
      sectionHeader("Section 10: Scaling Projection"),
      ...barChart("Revenue Forecast (Lakhs)", [
        { label: "Q1 2026", value: 2.8 },
        { label: "Q2 2026", value: 18.5 },
        { label: "Q3 2026", value: 45.0 },
        { label: "Q4 2026", value: 92.5 }
      ]),

      // PAGE 6: ROADMAP
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 11: Strategic Roadmap"),
      new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [hCell("Time"), hCell("Milestone")] }),
          new TableRow({ children: [cell("Q1"), cell("Launch Google Meet MVP.")] }),
          new TableRow({ children: [cell("Q2"), cell("Launch Jira and Linear automation.")] }),
          new TableRow({ children: [cell("Q3"), cell("Roll out Toxic Word Detection.")] }),
        ]
      }),

      space(10),
      sectionHeader("Section 12: Conclusion"),
      bodyText("MeetScribe is the only solution combining silent access with intervention intelligence. We have a clear path to enterprise leadership in 2026."),
      
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe - Actionable Intelligence", font: "Arial", size: 28, bold: true, color: C.indigo })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Complete_Strategic_Blueprint_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Complete_Strategic_Blueprint_2026.docx fixed");
}).catch(err => { console.error(err); process.exit(1); });
