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
const toINRShort = (usdK) => `Rs. ${Math.round(usdK * USD_TO_INR / 100).toLocaleString('en-IN')}L`;

// ─── HELPERS ────────────────────────────────────────────────────────────────
const border = (color="CCCCCC") => ({ style: BorderStyle.SINGLE, size: 1, color });
const borders = (color="CCCCCC") => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });
const cell = (text, opts={}) => new TableCell({
  borders: borders(opts.borderColor || "DDDDDD"),
  shading: { fill: opts.fill || C.white, type: ShadingType.CLEAR },
  margins: { top: 80, bottom: 80, left: 100, right: 100 },
  verticalAlign: VerticalAlign.CENTER,
  width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
  columnSpan: opts.span,
  children: [new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    children: [new TextRun({
      text: String(text),
      bold: opts.bold || false,
      color: opts.color || C.dark,
      size: opts.size || 19,
      font: "Arial"
    })]
  })]
});

const hCell = (text, fill=C.indigoDk) => cell(text, { fill, bold: true, color: C.white, size: 19 });
const space = (pt=6) => new Paragraph({ spacing: { before: 0, after: pt*20 }, children: [new TextRun("")] });

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.indigo, space: 4 } },
    children: [new TextRun({ text, font: "Arial", size: 32, bold: true, color: C.indigoDk })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 26, bold: true, color: C.slate })]
  });
}
function body(text, opts={}) {
  return new Paragraph({
    spacing: { before: 40, after: 80 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, font: "Arial", size: 20, color: opts.color || C.dark, bold: opts.bold || false })]
  });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 30, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 20, color: C.dark })]
  });
}

// ─── DOCUMENT BUILD ──────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 450, hanging: 250 } } } }] }]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", run: { size: 32, bold: true, font: "Arial", color: C.indigoDk }, paragraph: { spacing: { before: 240, after: 120 } } },
      { id: "Heading2", name: "Heading 2", run: { size: 26, bold: true, font: "Arial", color: C.slate }, paragraph: { spacing: { before: 200, after: 100 } } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe — Business Strategy & Market Summary", font: "Arial", size: 16, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe AI  •  Confidential Business Document  •  Page ", font: "Arial", size: 16, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: EXECUTIVE SUMMARY & MARKET
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 100 }, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 64, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 }, children: [new TextRun({ text: "AI Meeting Intelligence Platform — Strategic Overview", font: "Arial", size: 28, color: C.slate })] }),

      h1("Executive Summary"),
      body("MeetScribe is a universal AI intelligence layer delivered via Chrome extension. It transforms virtual meetings (Google Meet, Teams, Zoom) into searchable, actionable records. Unlike competitors, it offers real-time content moderation, multi-platform support, and native integration for Indian languages (Hindi, Kannada, Telugu)."),
      
      h2("Key Problems & Solutions"),
      bullet("Loss of Context: Teams waste 6 hours weekly on manual notes. MeetScribe automates MoMs."),
      bullet("Platform Silos: Existing tools work on one platform. MeetScribe works on all."),
      bullet("Multilingual Gap: Poor support for Indian languages. MeetScribe natively detects and transcribes Hindi, Kannada, and Telugu."),
      bullet("Focus Drift: No real-time feedback. AI moderation flags off-topic talk within 2 seconds."),

      h2("Market Opportunity (India Focus)"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 2120, 2120, 2120],
        rows: [
          new TableRow({ children: [hCell("Segment"), hCell("2025 (Est)"), hCell("2030 (Proj)"), hCell("CAGR")] }),
          new TableRow({ children: [cell("AI Meeting Assistants"), cell("Rs. 25,000 Cr"), cell("Rs. 95,000 Cr"), cell("29.5%")] }),
          new TableRow({ children: [cell("Transcription Tools"), cell("Rs. 28,000 Cr"), cell("Rs. 75,000 Cr"), cell("22.1%")] }),
          new TableRow({ children: [cell("Total Addressable Market", { bold: true, fill: C.indigoLt }), cell(toINRShort(11400), { bold: true }), cell(toINRShort(28800), { bold: true }), cell("20.4%", { color: C.green })] }),
        ]
      }),
      space(10),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: COMPETITION & ROADMAP
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("Competitive Landscape"),
      body("MeetScribe differentiates itself through 'any-platform' accessibility and real-time intervention."),
      
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3360, 2000, 2000, 2000],
        rows: [
          new TableRow({ children: [hCell("Feature"), hCell("Standard Tools"), hCell("Fireflies/Otter"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Cross-Platform Use"), cell("Limited"), cell("Partial"), cell("Full (Extension)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Content Moderation"), cell("No"), cell("No"), cell("Real-time", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Hindi/Local Support"), cell("None"), cell("Poor"), cell("Native", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Auto Jira Tickets"), cell("No"), cell("Partial"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Voice Agent (Scout)"), cell("No"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
        ]
      }),

      h2("Unique Differentiators"),
      bullet("Platform Agnostic: Works via browser audio capture, avoiding restrictive API limitations."),
      bullet("Real-time Moderation: Instant alerts for topic drift or unprofessional language."),
      bullet("Integrated Workflow: Direct meeting-to-ticket conversion for Jira/Linear."),
      bullet("Privacy First: Open-source core allows enterprise self-hosting."),

      h2("Product Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 4360, 3000],
        rows: [
          new TableRow({ children: [hCell("Phase"), hCell("Key Milestones"), hCell("Target")] }),
          new TableRow({ children: [cell("1: MVP"), cell("Chrome Extension + Core Transcription + Summaries"), cell("100 Users")] }),
          new TableRow({ children: [cell("2: Growth"), cell("Hindi/Local Languages + Jira + Pro Plan"), cell(toINRShort(2.87)+"/mo")] }),
          new TableRow({ children: [cell("3: Scale"), cell("Scout Voice Agent + Teams/Zoom + API Access"), cell(toINRShort(18.6)+"/mo")] }),
        ]
      }),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 3: MONETIZATION & PROJECTIONS
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("Business Model & Monetization"),
      body("Tiered SaaS model with specialized enterprise and API revenue streams."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({ children: [
            cell("Free", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("Pro", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("Business", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER }),
            cell("Enterprise", { fill: C.slateLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 24, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 24, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 24, bold: true, color: C.indigo }),
            cell("Custom", { align: AlignmentType.CENTER, size: 24, bold: true })
          ]}),
          new TableRow({ children: [
            cell("5 Meetings/mo\n3 Speakers\nBasic AI", { size: 18 }),
            cell("Unlimited Mtgs\nLocal Languages\nJira Integration", { size: 18 }),
            cell("Voice Agent\nModeration\nTeam Analytics", { size: 18 }),
            cell("Self-Hosting\nSSO / Security\nDedicated SLA", { size: 18 })
          ]})
        ]
      }),

      h2("Financial Projections (ARR)"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 2080, 2080, 2080],
        rows: [
          new TableRow({ children: [hCell("Metric"), hCell("Year 1"), hCell("Year 2"), hCell("Year 3")] }),
          new TableRow({ children: [cell("Total Users"), cell("2,500"), cell("12,000"), cell("45,000")] }),
          new TableRow({ children: [cell("Paid Subscribers"), cell("150"), cell("1,020"), cell("4,300")] }),
          new TableRow({ children: [cell("Annual Revenue", { bold: true }), cell(toINRShort(34.4), { bold: true }), cell(toINRShort(223.2), { bold: true }), cell(toINRShort(880.8), { bold: true })] }),
        ]
      }),

      h2("Unit Economics"),
      bullet("Gross Margin: ~88% (High efficiency through Groq/Open-Source models)."),
      bullet("LTV:CAC Ratio: 5.5x - 13.3x (Industry benchmark is 3x)."),
      bullet("Payback Period: 2 - 5 months per acquired user."),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 4: STRATEGY & CONCLUSION
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("Growth & Risk Management"),

      h2("Go-To-Market Strategy"),
      bullet("Organic: Chrome Web Store SEO for high-intent search terms."),
      bullet("Open Source: GitHub-led growth targeting engineering managers."),
      bullet("Partnerships: Integration listings on Jira and Slack marketplaces."),
      bullet("Target Segments: Indian IT Services (TCS, Infosys), Remote Startups, Legal Firms."),

      h2("Risk Analysis"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2500, 1500, 5360],
        rows: [
          new TableRow({ children: [hCell("Risk"), hCell("Impact"), hCell("Mitigation Strategy")] }),
          new TableRow({ children: [cell("Platform Competition"), cell("High"), cell("Focus on cross-platform utility and local Indian languages.")] }),
          new TableRow({ children: [cell("Privacy Regulations"), cell("High"), cell("Offer self-hosted Enterprise version for complete data control.")] }),
          new TableRow({ children: [cell("Audio Capture Blocks"), cell("Medium"), cell("Maintain Firefox extension and potential desktop app fallback.")] }),
        ]
      }),

      h1("Conclusion"),
      body("MeetScribe is positioned to capture the underserved Indian multilingual market while providing a superior 'all-platform' experience for global teams. With high margins and a clear path to profitability, it represents a high-leverage opportunity in the AI productivity space."),
      
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — Turning Every Meeting Into Action", font: "Arial", size: 24, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "2025 Strategy Document", font: "Arial", size: 18, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Business_Short.docx", buffer);
  console.log("SUCCESS: MeetScribe_Business_Short.docx created (Concise 4-page version)");
}).catch(err => { console.error(err); process.exit(1); });
