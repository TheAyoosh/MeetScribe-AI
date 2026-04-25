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
            columnWidths: [barWidth || 1, Math.max(5500 - barWidth, 1)],
            rows: [new TableRow({ children: [
              new TableCell({ shading: { fill: color, type: ShadingType.CLEAR }, width: { size: barWidth, type: WidthType.DXA }, children: [new Paragraph("")] }),
              new TableCell({ shading: { fill: C.grayLt, type: ShadingType.CLEAR }, width: { size: 5500-barWidth, type: WidthType.DXA }, children: [new Paragraph("")] }),
            ]})]
          })]
        }),
        cell(`${value.toLocaleString('en-IN')}${unit}`, { width: 1000, align: AlignmentType.RIGHT, bold: true, color }),
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
        margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } 
      } 
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe — Complete Strategic Blueprint 2026", font: "Arial", size: 16, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe Final Presentation  •  Page ", font: "Arial", size: 16, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1: LOGO & VISION
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: fs.readFileSync(LOGO_PATH),
            transformation: { width: 120, height: 120 }
          })
        ]
      }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 80, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 300 }, children: [new TextRun({ text: "Complete Strategic Intelligence for the 2026 Workforce", font: "Arial", size: 28, color: C.slate })] }),

      sectionHeader("Section 1: The Human and AI Partnership"),
      bodyText("MeetScribe is the ultimate intelligence layer that bridges the gap between human conversation and digital action. In 2026, we define the professional standard for virtual meetings through silent interception, real-time intervention, and native regional language processing. We empower teams to focus on the conversation while we handle the complexity of organization."),
      
      space(20),
      sectionHeader("Section 2: 2026 Market Dominance Chart"),
      ...barChart("Market Opportunity in Crore Rupees (2026)", [
        { label: "AI Translation", value: 12000 },
        { label: "Action Automation", value: 15000 },
        { label: "Security & Privacy", value: 8280 }
      ]),
      bodyText("MeetScribe captures the intersection of these three sectors, providing a unique value proposition that current market giants cannot provide due to their closed ecosystems."),

      // PAGE 2: COMPARISON MATRIX
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 3: Competitive Landscape Matrix"),
      new Table({
        width: { size: 10240, type: WidthType.DXA },
        columnWidths: [2200, 1600, 1600, 1600, 1600, 1640],
        rows: [
          new TableRow({ children: [hCell("Advanced Factor"), hCell("Zoom AI"), hCell("Teams"), hCell("Meet"), hCell("Bots"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Automation"), cell("Manual"), cell("Basic"), cell("None"), cell("Partial"), cell("Full and Auto", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Toxic Detection"), cell("None"), cell("None"), cell("None"), cell("None"), cell("Real-time", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Latency"), cell("Batch"), cell("Batch"), cell("Batch"), cell("Slow"), cell("Live (<500ms)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Regional Support"), cell("Low"), cell("Low"), cell("Low"), cell("Partial"), cell("Full H/K/T", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Health Score"), cell("No"), cell("No"), cell("No"), cell("No"), cell("Per Meeting", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("CRM Integration"), cell("None"), cell("Limited"), cell("None"), cell("Partial"), cell("Deep and Native", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Security"), cell("Native"), cell("Native"), cell("Native"), cell("Blocked"), cell("Extension-based", { bold: true, color: C.indigo })] }),
        ]
      }),

      space(20),
      sectionHeader("Section 4: Why Our Factors Lead the Industry"),
      bulletPoint("Latency Edge: Our sub-500ms latency allows for real-time intervention warnings, something batch processors like Zoom cannot do."),
      bulletPoint("Integration Depth: We offer native syncing with Jira, Linear, Slack, and Hubspot, making the meeting a true part of the tech stack."),
      bulletPoint("Privacy Control: By capturing audio at the browser level, we bypass the bot-blocking security rules that plague tools like Fireflies."),

      // PAGE 3: INTERVENTION & AUTOMATION
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 5: Intervention and Automation Case Studies"),
      subHeader("Automated Workflow Example"),
      bodyText("Scenario: During a sales call, a client expresses interest in a specific feature. MeetScribe identifies the 'Buying Intent', creates a deal in HubSpot, and assigns a follow-up task to the salesperson in Linear instantly."),
      
      subHeader("Bad Word and Conduct Warning"),
      bodyText("Scenario: An internal team meeting turns unprofessional. MeetScribe detects the toxic language patterns and immediately sends a private notification to the host: 'Professional Conduct Warning: Monitor the discussion'."),

      space(20),
      sectionHeader("Section 6: Topic Drift and Meeting Health"),
      ...barChart("Meeting Productivity Increase (Time Saved in Hours)", [
        { label: "Manual Notes", value: 1.5, unit: " hr" },
        { label: "Native Tools", value: 0.8, unit: " hr" },
        { label: "MeetScribe", value: 2.2, unit: " hr" }
      ], C.teal),
      bodyText("By automating the summary and ticket creation, MeetScribe saves every employee over 2 hours of post-meeting manual work per call."),

      // PAGE 4: SPECIALIZED INTELLIGENCE
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 7: Specialized Intelligence Factors"),
      subHeader("98% Accuracy Speaker Mapping"),
      bodyText("In crowded environments, identifying speakers is difficult. MeetScribe uses multi-layered diarization to ensure that every word is correctly attributed to the right person, providing a legally defensible record of every decision."),
      
      subHeader("Advanced Topic Monitoring"),
      bodyText("MeetScribe monitors the meeting against its set agenda. If the conversation moves into 'Flaw' areas—such as repetitive complaints or off-topic chatter—the system alerts the leader to steer the meeting back to the goals."),

      space(20),
      sectionHeader("Section 8: Cost Savings for Enterprise"),
      ...barChart("Cost Savings vs Traditional Methods (Rupees per Mo)", [
        { label: "Manual Scribe", value: 45000 },
        { label: "Transcriptionist", value: 25000 },
        { label: "MeetScribe Pro", value: 849 }
      ], C.amber),
      bodyText("MeetScribe reduces the cost of professional documentation by over 98 percent compared to human-based scribe services."),

      // PAGE 5: BUSINESS MODEL & SCALING
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 9: Complete Monetization Sheet"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            cell("Starter Tier", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("Professional Tier", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("Enterprise Tier", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 30, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.indigo })
          ]}),
          new TableRow({ children: [
            cell("5 meetings a month and basic AI summaries", { size: 18 }),
            cell("Unlimited meetings and Jira automation and H/K/T support", { size: 18 }),
            cell("Toxic word alerts and Topic drift and CRM auto-sync", { size: 18 })
          ]})
        ]
      }),

      space(20),
      sectionHeader("Section 10: Scaling and Revenue Projection"),
      ...barChart("Projected Revenue with Advanced Features (Lakhs)", [
        { label: "Q1 2026", value: 2.8 },
        { label: "Q2 2026", value: 18.5 },
        { label: "Q3 2026", value: 45.0 },
        { label: "Q4 2026", value: 92.5 }
      ]),
      bodyText("The inclusion of high-value intervention and automation tools justifies our Enterprise pricing and increases our customer retention by over 60 percent."),

      // PAGE 6: ROADMAP & CONCLUSION
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 11: The Strategic Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 7360],
        rows: [
          new TableRow({ children: [hCell("Timeline"), hCell("Major Milestone and Goal")] }),
          new TableRow({ children: [cell("Month 1 to 3"), cell("Launch Google Meet MVP and validate 'Silent Capture' for 1,000 users.")] }),
          new TableRow({ children: [cell("Month 4 to 6"), cell("Launch Jira and Linear automation and regional language support.")] }),
          new TableRow({ children: [cell("Month 7 to 12"), cell("Roll out 'Toxic Word Detection' and Topic Drift alerts for Enterprise.")] }),
        ]
      }),

      space(20),
      sectionHeader("Section 12: Final Strategic Conclusion"),
      bodyText("MeetScribe is the only solution that combines silent browser-level access with advanced intervention intelligence. We have a clear path from a small MVP to a scalable enterprise leader. By focusing on professional standards, privacy, and automation, we provide a complete platform for the 2026 workforce. Our economics are robust, our technology is feasible, and our vision is to turn every conversation into actionable value."),
      
      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — The Complete Intelligence Standard", font: "Arial", size: 28, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Final Strategic Blueprint  •  2026", font: "Arial", size: 18, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Complete_Strategic_Blueprint_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Complete_Strategic_Blueprint_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
