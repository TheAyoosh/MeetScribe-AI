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
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.dark })]
  });
}

function bulletPoint(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.dark })]
  });
}

function barChart(title, items) {
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
            columnWidths: [barWidth || 1, Math.max(5500 - barWidth, 1)],
            rows: [new TableRow({ children: [
              new TableCell({ shading: { fill: C.indigo, type: ShadingType.CLEAR }, width: { size: barWidth, type: WidthType.DXA }, children: [new Paragraph("")] }),
              new TableCell({ shading: { fill: C.grayLt, type: ShadingType.CLEAR }, width: { size: 5500-barWidth, type: WidthType.DXA }, children: [new Paragraph("")] }),
            ]})]
          })]
        }),
        cell(`${value.toLocaleString('en-IN')}${unit}`, { width: 1000, align: AlignmentType.RIGHT, bold: true, color: C.indigo }),
      ]
    });
  });
  return [
    new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: title, font: "Arial", size: 22, bold: true, color: C.slate })] }),
    new Table({ width: { size: 9000, type: WidthType.DXA }, columnWidths: [2500, 5500, 1000], rows }),
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
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // Proper 1-inch margins
      } 
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe — Strategic Briefing 2026", font: "Arial", size: 16, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Confidential Strategy Sheet  •  Page ", font: "Arial", size: 16, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 72, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 300 }, children: [new TextRun({ text: "Universal Meeting Intelligence", font: "Arial", size: 28, color: C.slate })] }),

      sectionHeader("Section 1: Executive Intelligence"),
      bodyText("MeetScribe is the first platform-agnostic intelligence layer for virtual meetings. It solves the fragmentation of 2026 by providing a single, private, and actionable record of every conversation across Zoom, Google Meet, and MS Teams. We empower the multilingual Indian workforce with native local language support and real-time intervention."),
      
      space(20),
      sectionHeader("Section 2: 2026 Market Dynamics"),
      ...barChart("India AI Meeting Market Growth (Rupees Cr)", [
        { label: "2024 Actual", value: 22000 },
        { label: "2025 Projected", value: 28500 },
        { label: "2026 Projected", value: 35280 }
      ]),
      bodyText("The shift from simple transcription to active 'Intervention' represents a Rs. 15,000 Cr opportunity in the Indian tech sector alone."),

      // PAGE 2
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 3: Competitive Battleground"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1860, 1500, 1500, 1500, 1500, 1500],
        rows: [
          new TableRow({ children: [hCell("Factor"), hCell("Zoom"), hCell("Teams"), hCell("Meet"), hCell("Bots"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Price"), cell("Rs. 1,350"), cell("Rs. 2,520"), cell("Rs. 1,680"), cell("Rs. 1,510"), cell("Rs. 849", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Scope"), cell("Single"), cell("Single"), cell("Single"), cell("Most"), cell("Any site", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Privacy"), cell("High"), cell("High"), cell("High"), cell("Low"), cell("High", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Regional"), cell("None"), cell("None"), cell("None"), cell("Partial"), cell("Full H/K/T", { bold: true, color: C.indigo })] }),
        ]
      }),

      space(20),
      sectionHeader("Section 4: Strategic Gaps Explained"),
      bulletPoint("Cost Factor: Native enterprise tools like MS Copilot are priced at nearly 3 times our Pro offering."),
      bulletPoint("Niche Dominance: No global giant provides the deep Kannada and Telugu processing required for the Indian IT sector."),
      bulletPoint("Security Edge: Bots are being blocked by security teams; our extension is silent and locally captured."),

      // PAGE 3
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 5: Strengths and Real Examples"),
      subHeader("The Cross-Platform Advantage"),
      bodyText("Example: A meeting starts on Google Meet and moves to a Zoom demo. MeetScribe captures the entire flow without splitting the transcript."),
      subHeader("Local Language Mastery"),
      bodyText("Example: A developer speaks in a Kannada and English mix. MeetScribe identifies the switch and provides a perfect translation where others fail."),

      space(20),
      sectionHeader("Section 6: Moderation and Intervention"),
      subHeader("Real-Time Intervention"),
      bodyText("Example: If a participant drifts off-topic for 3 minutes, MeetScribe sends a private alert to keep the discussion focused."),
      subHeader("Silent Presence"),
      bodyText("Example: High-security legal meetings that ban bots can still use MeetScribe because it is a silent browser tool."),

      // PAGE 4
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 7: Business Model and Pricing"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            cell("Free Plan", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("Pro Plan", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("Business Plan", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 30, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.indigo })
          ]}),
          new TableRow({ children: [
            cell("5 meetings a month and basic summaries", { size: 19 }),
            cell("Unlimited meetings and local languages", { size: 19 }),
            cell("Real-time alerts and team analytics", { size: 19 })
          ]})
        ]
      }),

      space(20),
      sectionHeader("Section 8: Economics and Scaling"),
      ...barChart("Projected Revenue (Lakhs per Month)", [
        { label: "Q1 2026", value: 2.8 },
        { label: "Q2 2026", value: 12.5 },
        { label: "Q3 2026", value: 34.0 },
        { label: "Q4 2026", value: 78.5 }
      ]),
      bodyText("Our scalable technology maintains an 88 percent gross margin as we grow from individual users to enterprise teams."),

      // PAGE 5
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 9: The Technology Edge"),
      subHeader("Silent Extension vs External Bots"),
      bodyText("MeetScribe uses browser-level audio interception to capture high-quality audio silently. This avoids the 'Bot Problem' where participants feel uncomfortable and security teams block external attendees."),
      
      space(20),
      sectionHeader("Section 10: 24-Month Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 7360],
        rows: [
          new TableRow({ children: [hCell("Phase"), hCell("Milestones and Goals")] }),
          new TableRow({ children: [cell("Phase 1"), cell("Launch Google Meet MVP and validate Indian language support.")] }),
          new TableRow({ children: [cell("Phase 2"), cell("Roll out Jira sync and launch the Pro subscription tier.")] }),
          new TableRow({ children: [cell("Phase 3"), cell("Full support for Zoom and Teams tabs and the Scout Agent.")] }),
          new TableRow({ children: [cell("Phase 4"), cell("Enterprise self-hosting and API for third-party developers.")] }),
        ]
      }),

      // PAGE 6
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 11: Growth and Channels"),
      bulletPoint("Chrome Store SEO: Targeting high-intent terms for meeting transcription."),
      bulletPoint("Open Source: Attracting developers and security teams through transparency."),
      bulletPoint("IT Partnerships: Direct outreach to Indian tech firms for regional support."),

      space(20),
      sectionHeader("Section 12: Final Strategic Position"),
      bodyText("MeetScribe is the default choice for the 2026 workforce. We provide a professional, feasible, and high-intervention alternative to the expensive and restrictive native platforms."),
      
      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — Turning Every Conversation Into Action", font: "Arial", size: 28, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Strategic Briefing Sheet  •  2026", font: "Arial", size: 18, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Strategic_Sheet_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Strategic_Sheet_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
