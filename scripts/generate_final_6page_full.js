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
    children: [new TextRun({ text: text.toUpperCase(), font: "Arial", size: 28, bold: true, color: C.indigoDk })]
  });
}

function subHeader(text) {
  return new Paragraph({
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: C.slate })]
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.dark })]
  });
}

function bulletPoint(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 60, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: C.dark })]
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
    new Paragraph({ spacing: { before: 140, after: 100 }, children: [new TextRun({ text: title, font: "Arial", size: 22, bold: true, color: C.slate })] }),
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
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } 
      } 
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe - Full Strategic Business Case 2026", font: "Arial", size: 16, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Confidential Business Strategy - Page ", font: "Arial", size: 16, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1
      space(30),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 84, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 400 }, children: [new TextRun({ text: "Professional Meeting Intelligence and Automation", font: "Arial", size: 28, color: C.slate })] }),

      sectionHeader("Section 1: The AI Intervention Standard"),
      bodyText("MeetScribe is the ultimate intelligence layer for professional meetings in 2026. We provide a platform-agnostic bridge that turns complex conversations into actionable results. Through our silent browser interception and native language processing, we empower the modern workforce to focus on the conversation while we handle the complexity of organization and follow-up."),
      
      space(20),
      sectionHeader("Section 2: Market Intelligence and Opportunity"),
      ...barChart("2026 Opportunity in the Indian Market (Rupees Cr)", [
        { label: "AI Language Support", value: 12000 },
        { label: "Automated Workflows", value: 15000 },
        { label: "Security and Privacy", value: 8280 }
      ]),
      bodyText("The shift from simple transcription to active 'Intervention' represents a massive Rs. 15,000 Cr opportunity in the Indian tech sector alone, driven by a need for efficiency and professional conduct."),

      // PAGE 2
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 3: Comprehensive Comparison Matrix"),
      new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [hCell("Factors"), hCell("Zoom AI"), hCell("Teams"), hCell("Meet"), hCell("Bots"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Automation"), cell("Manual"), cell("Basic"), cell("None"), cell("Partial"), cell("Full Auto")] }),
          new TableRow({ children: [cell("Toxic Detection"), cell("None"), cell("None"), cell("None"), cell("None"), cell("Real-time")] }),
          new TableRow({ children: [cell("Latency"), cell("Batch"), cell("Batch"), cell("Batch"), cell("Slow"), cell("Live")] }),
          new TableRow({ children: [cell("Regional"), cell("Low"), cell("Low"), cell("Low"), cell("Partial"), cell("Full Support")] }),
          new TableRow({ children: [cell("Health Score"), cell("No"), cell("No"), cell("No"), cell("No"), cell("Yes")] }),
          new TableRow({ children: [cell("Security"), cell("Native"), cell("Native"), cell("Native"), cell("Blocked"), cell("Local Tab")] }),
        ]
      }),

      space(20),
      sectionHeader("Section 4: Why Our Strategy Leads the Market"),
      bulletPoint("Professional Decorum: Our toxic word detection ensures that corporate standards are maintained during intense discussions."),
      bulletPoint("Workflow Integration: We don't just take notes; we create Jira and Linear tickets based on the actual intent of the speaker."),
      bulletPoint("Deeper Precision: Our 98 percent speaker mapping accuracy handles overlapping voices in high-density office environments."),
      bulletPoint("Platform Freedom: We work across any tab, allowing teams to move between meeting sites without losing their transcript or history."),

      // PAGE 3
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 5: Automation and Intervention Examples"),
      subHeader("Case Study: Automated Workflow Execution"),
      bodyText("Example: A manager says, 'We need to fix the login bug by Friday'. MeetScribe instantly identifies the intent, creates a Jira ticket with the title 'Fix login bug' and sets the due date to Friday without any manual data entry."),
      
      subHeader("Case Study: Real-Time Conduct and Bad Word Warning"),
      bodyText("Example: During a heated debate, a participant uses unprofessional language. MeetScribe's AI identifies the toxic sentiment and sends a private, real-time warning to the speaker to maintain professional standards."),

      space(20),
      sectionHeader("Section 6: Topic Drift and Meeting Health Monitoring"),
      ...barChart("Productivity Gain (Hours Saved per Meeting)", [
        { label: "Manual Documentation", value: 1.5 },
        { label: "Native Platform Tools", value: 0.8 },
        { label: "MeetScribe Intelligence", value: 2.2 }
      ], C.teal),
      bodyText("By automating the post-meeting documentation process, MeetScribe saves every employee over 2 hours of manual work for every hour of meeting time."),

      // PAGE 4
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 7: Specialized Intelligence Factors"),
      subHeader("High Precision Speaker Diarization"),
      bodyText("We identify speakers with 98 percent accuracy even in noisy environments. This ensures that every decision and action item is correctly attributed, providing a legally defensible and accountable record of the conversation."),
      
      subHeader("Agenda and Topic Drift Alerts"),
      bodyText("MeetScribe monitors the meeting against its agenda. If the conversation goes off-topic for more than 3 minutes, the system sends an alert to the leader to steer the meeting back to its core goals, increasing efficiency."),

      space(20),
      sectionHeader("Section 8: Economic Scaling and Enterprise Value"),
      ...barChart("Monthly Cost Comparison (Rupees)", [
        { label: "Professional Scribe", value: 45000 },
        { label: "Transcriptionist", value: 25000 },
        { label: "MeetScribe Professional", value: 849 }
      ], C.slate),
      bodyText("MeetScribe reduces the cost of professional documentation by over 98 percent compared to traditional methods, while providing much deeper insights and integration."),

      // PAGE 5
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 9: Global Monetization and Pricing Plan"),
      new Table({
        width: { size: 9500, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [hCell("Tier"), hCell("Price per Month"), hCell("Strategic Value")] }),
          new TableRow({ children: [cell("Free Starter"), cell("Rs. 0"), cell("5 meetings and basic notes in English")] }),
          new TableRow({ children: [cell("Professional"), cell("Rs. 849"), cell("Unlimited meetings and Jira sync and Regional support")] }),
          new TableRow({ children: [cell("Enterprise"), cell("Rs. 1,249"), cell("Toxic alerts and Topic drift and Team dashboards")] }),
        ]
      }),

      space(20),
      sectionHeader("Section 10: Scaling Projection and Revenue Potential"),
      ...barChart("Revenue Growth Projection (Lakhs per Month)", [
        { label: "Q1 2026", value: 2.8 },
        { label: "Q2 2026", value: 18.5 },
        { label: "Q3 2026", value: 45.0 },
        { label: "Q4 2026", value: 92.5 }
      ]),
      bodyText("The inclusion of high-value intervention and automation tools justifies our pricing and increases our customer retention by over 60 percent compared to simple recording tools."),

      // PAGE 6
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 11: Strategic Roadmap and Future Proofing"),
      bulletPoint("Month 1 to 3: Launch Google Meet MVP and validate 'Silent Capture' for 1,000 early adopters."),
      bulletPoint("Month 4 to 6: Roll out Jira and Linear automation along with native Hindi and Kannada language support."),
      bulletPoint("Month 7 to 12: Launch real-time Toxic Word Detection and Topic Drift alerts for our Enterprise customers."),
      bulletPoint("Year 2: Launch 'Scout AI'—a live voice agent that can answer questions during the meeting based on past data."),

      space(20),
      sectionHeader("Section 12: Final Strategic Conclusion"),
      bodyText("MeetScribe is the only solution that combines silent browser-level access with advanced intervention intelligence. We have a clear and feasible path from a small MVP to becoming a scalable enterprise leader in the Indian AI market. By focusing on professional standards, privacy, and deep automation, we provide a complete platform for the 2026 workforce. Our economics are robust, our technology is validated, and our vision is to turn every conversation into actionable and measurable value."),
      
      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe - Turning Every Meeting Into Action", font: "Arial", size: 32, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Strategic Business Case and Roadmap - 2026", font: "Arial", size: 18, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Final_Full_6Page_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Final_Full_6Page_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
