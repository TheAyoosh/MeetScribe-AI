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
        margin: { top: 1440, right: 1000, bottom: 1440, left: 1000 } 
      } 
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe — Advanced Strategy Briefing 2026", font: "Arial", size: 16, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Full Intelligence Report  •  Page ", font: "Arial", size: 16, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 72, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 300 }, children: [new TextRun({ text: "Next-Gen Intervention and Automation", font: "Arial", size: 28, color: C.slate })] }),

      sectionHeader("Section 1: The 2026 Intelligence Leap"),
      bodyText("MeetScribe is evolving from a transcription tool into an active 'Meeting Engine'. In 2026, our platform doesn't just listen; it intervenes. We have added advanced layers for professional conduct monitoring, automated task execution, and deep regional intelligence that the global tech giants cannot match."),
      
      space(20),
      sectionHeader("Section 2: Market Realities in India"),
      ...barChart("India AI Opportunity Growth (Rupees Cr)", [
        { label: "AI Transcription", value: 12000 },
        { label: "AI Intervention", value: 15000 },
        { label: "AI Automation", value: 8280 }
      ]),
      bodyText("The total opportunity of Rs. 35,280 Cr is now split between simple notes and advanced intervention services."),

      // PAGE 2: MASSIVE COMPARISON
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 3: Detailed Competitive Matrix"),
      new Table({
        width: { size: 10240, type: WidthType.DXA },
        columnWidths: [2200, 1600, 1600, 1600, 1600, 1640],
        rows: [
          new TableRow({ children: [hCell("Advanced Factor"), hCell("Zoom AI"), hCell("Teams"), hCell("Meet"), hCell("Bots"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Ticket Automation"), cell("Manual"), cell("Basic"), cell("None"), cell("Partial"), cell("Full and Auto", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Toxic Word Alert"), cell("None"), cell("None"), cell("None"), cell("None"), cell("Real-time", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Topic Drift Alert"), cell("No"), cell("No"), cell("No"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("CRM Auto-Sync"), cell("No"), cell("Yes"), cell("No"), cell("Partial"), cell("Native", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Speaker Mapping"), cell("90%"), cell("92%"), cell("88%"), cell("85%"), cell("98% Accuracy", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Health Score"), cell("No"), cell("No"), cell("No"), cell("No"), cell("Per Meeting", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Auto-Followup"), cell("Basic"), cell("Good"), cell("Basic"), cell("Good"), cell("Smart and Custom", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Price (mo)"), cell("Rs. 1,350"), cell("Rs. 2,520"), cell("Rs. 1,680"), cell("Rs. 1,510"), cell("Rs. 849", { bold: true, color: C.indigo })] }),
        ]
      }),

      space(20),
      sectionHeader("Section 4: Why Our Factors Win"),
      bulletPoint("Professional Guardrails: Our 'Bad Word' and 'Toxic Language' detection ensures professional conduct in corporate environments."),
      bulletPoint("Zero Manual Work: We don't just suggest tickets; we create them directly in Jira and Linear based on conversation intent."),
      bulletPoint("Deep Precision: Our 98 percent speaker mapping accuracy handles overlapping voices in crowded Indian offices."),

      // PAGE 3: EXAMPLES
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 5: Automation and Intervention Examples"),
      subHeader("Automated Ticket Creation"),
      bodyText("Example: A manager says, 'We need to fix the login bug by Friday'. MeetScribe instantly detects the intent, creates a Jira ticket with the title 'Fix login bug' and sets the due date to Friday without anyone touching a keyboard."),
      
      subHeader("Toxic and Flaw Word Detection"),
      bodyText("Example: During a heated debate, a participant uses unprofessional language. MeetScribe's AI identifies the toxic sentiment and sends a private, real-time warning to the speaker to maintain professional decorum."),

      space(20),
      sectionHeader("Section 6: Advanced Real-time Monitoring"),
      subHeader("Topic Drift Warning"),
      bodyText("Example: The meeting agenda is 'Q1 Goals', but the team starts talking about a weekend trip. After 3 minutes of drift, MeetScribe sends an alert: 'Agenda Drift Detected: Q1 Goals' to keep the meeting efficient."),
      subHeader("Meeting Health Scoring"),
      bodyText("Example: At the end of a call, MeetScribe gives a 'Health Score' of 85 percent, noting high participation and clear action items, or 40 percent if the meeting was mostly silence or repetitive talk."),

      // PAGE 4: SPECIALIZED FACTORS
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 7: Specialized Intelligence Factors"),
      subHeader("Speaker Diarization and Mapping"),
      bodyText("We use advanced voice-print technology to ensure that even in a room with 10 people, the transcript clearly shows who said what with 98 percent accuracy. This is critical for accountability and legal records."),
      
      subHeader("Smart Auto-Followup"),
      bodyText("Instead of just a transcript, MeetScribe sends a customized email to every attendee with their specific tasks and a summary of what they agreed to, increasing team productivity by 30 percent."),

      space(20),
      sectionHeader("Section 8: Regional and Cultural Nuance"),
      subHeader("Regional Intervention"),
      bodyText("Our AI understands the cultural context of Indian meetings, recognizing polite disagreements and identifying key decisions made in regional languages like Hindi and Kannada."),

      // PAGE 5: BUSINESS MODEL
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 9: Advanced Pricing Sheet"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            cell("Basic (Free)", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("Professional", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("Enterprise", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 30, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.indigo })
          ]}),
          new TableRow({ children: [
            cell("5 meetings a month and basic summaries", { size: 18 }),
            cell("Unlimited meetings and Ticket Automation and Languages", { size: 18 }),
            cell("Toxic word alerts and Topic drift and Admin analytics", { size: 18 })
          ]})
        ]
      }),

      space(20),
      sectionHeader("Section 10: Economic Growth Potential"),
      ...barChart("Revenue Potential with Advanced Features (Lakhs)", [
        { label: "Q1 2026", value: 2.8 },
        { label: "Q2 2026", value: 18.5 },
        { label: "Q3 2026", value: 45.0 },
        { label: "Q4 2026", value: 92.5 }
      ]),
      bodyText("By adding intervention and automation, we increase our 'Average Revenue Per User' by 40 percent compared to basic transcription tools."),

      // PAGE 6: CONCLUSION
      new Paragraph({ children: [new PageBreak()] }),
      sectionHeader("Section 11: Future Proof Roadmap"),
      bulletPoint("Next 3 Months: Launch bad word detection and automated Jira sync for early adopters."),
      bulletPoint("Next 6 Months: Launch Topic Drift monitoring and Indian language sentiment analysis."),
      bulletPoint("Next 12 Months: Launch 'Scout AI'—a voice agent that can answer questions live in the meeting."),

      space(20),
      sectionHeader("Section 12: Final Strategic Conclusion"),
      bodyText("MeetScribe is the only platform that offers a complete 'Meeting Governance' system. We are more than a tool; we are the professional standard for the 2026 workforce. Our feasibility, scalability, and deep feature set make us the clear leader in the Indian AI market."),
      
      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — The Professional Standard for Meetings", font: "Arial", size: 28, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Full Strategic Briefing  •  2026", font: "Arial", size: 18, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_FullFeature_Strategic_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_FullFeature_Strategic_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
