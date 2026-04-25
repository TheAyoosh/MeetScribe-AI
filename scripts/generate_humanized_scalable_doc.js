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
function body(text, opts={}) {
  return new Paragraph({
    spacing: { before: 60, after: 140 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, font: "Arial", size: 23, color: opts.color || C.dark, bold: opts.bold || false, italics: opts.italic || false })]
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
        children: [new TextRun({ text: "MeetScribe — Turning Conversations into Action", font: "Arial", size: 18, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe Business Journey  •  Page ", font: "Arial", size: 18, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // PAGE 1: HUMAN VISION
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 84, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 400 }, children: [new TextRun({ text: "Smart Meetings for Real People", font: "Arial", size: 36, color: C.slate })] }),

      h1("Our Story and Mission"),
      body("Every day, millions of people sit through meetings and forget the most important parts. We built MeetScribe to fix this. Our goal is to make meetings useful again by giving everyone their own personal assistant that lives right in the browser."),

      h2("Starting with a Simple Foundation"),
      body("We aren't trying to replace your favorite meeting apps. Instead, we make them better. Our journey starts as a simple Chrome Extension that works with Google Meet to give you instant, human-like summaries without any effort."),

      ...barChart("Our Goal: Helping More People Every Month", [
        { label: "Phase 1: Starting Small", value: 500, unit: " users" },
        { label: "Phase 2: Growing Up", value: 5000, unit: " users" },
        { label: "Phase 3: Reaching Everyone", value: 50000, unit: " users" }
      ]),

      // PAGE 2: HUMAN COMPARISON
      new Paragraph({ children: [new PageBreak()] }),
      h1("Why People Choose MeetScribe"),
      body("Most big companies lock you into their own systems. We believe you should have the freedom to meet anywhere and still have great notes."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 3180, 3180],
        rows: [
          new TableRow({ children: [hCell("The Difference"), hCell("The Big Companies"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Where it works"), cell("Only on their own site"), cell("Everywhere you meet", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Languages"), cell("Mostly English"), cell("Hindi, Kannada, and Telugu", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Your Data"), cell("They own it"), cell("You keep it private", { bold: true, color: C.indigo })] }),
        ]
      }),

      h2("A Simple, Scalable Advantage"),
      body("Because we live in the browser, we don't have to build expensive servers for every call. This makes us faster, cheaper, and much easier to scale as more people join us."),

      // PAGE 3: THE JOURNEY
      new Paragraph({ children: [new PageBreak()] }),
      h1("Our Path to Growth"),
      body("We follow a natural path that focuses on making users happy first, then building a sustainable business."),

      h2("Step 1: Being Helpful First"),
      body("We offer a free version that anyone can use. This helps us learn what people really need and builds a community of fans without spending money on ads."),

      h2("Step 2: Adding Power Features"),
      body("Once people love the basics, we offer extra features like automatic Jira tickets and local language support for a small monthly subscription."),

      ...barChart("Growing Our Income (Steady and Scalable)", [
        { label: "First 12 Months", value: 3, unit: " Lakhs" },
        { label: "Next 12 Months", value: 18, unit: " Lakhs" },
        { label: "The Third Year", value: 75, unit: " Lakhs" }
      ]),

      h2("Step 3: Partnering with Teams"),
      body("Finally, we help whole companies stay organized with dashboards and team-wide summaries. This is where we see our biggest growth and impact."),

      // PAGE 4: HONEST PRICING
      new Paragraph({ children: [new PageBreak()] }),
      h1("Simple and Fair Pricing"),
      body("We believe in keeping things clear and honest. No hidden fees, just simple plans that grow with you."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
          new TableRow({ children: [
            cell("The Free Plan", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("The Pro Plan", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("The Team Plan", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 30, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 30, bold: true, color: C.indigo })
          ]}),
          new TableRow({ children: [
            cell("5 meetings every month and basic notes in English", { size: 20 }),
            cell("Unlimited meetings and Jira integration and local languages", { size: 20 }),
            cell("Team dashboard and privacy alerts and admin tools", { size: 20 })
          ]})
        ]
      }),

      h2("A Healthy Business"),
      body("Our business is very efficient. For every 100 Rupees we earn, we only spend about 12 Rupees on technology. This means we can reinvest more into making the product better for you."),

      // PAGE 5: THE EXPERIENCE
      new Paragraph({ children: [new PageBreak()] }),
      h1("A Human Experience"),
      body("Using MeetScribe feels natural. It stays in the background and only speaks up when you need it to."),

      bullet("You start your meeting just like you always do."),
      bullet("MeetScribe listens quietly and understands what is being said."),
      bullet("It identifies who is talking and what the key points are."),
      bullet("As soon as you finish, your summary is ready and waiting."),

      h2("What's Coming Next"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3000, 6360],
        rows: [
          new TableRow({ children: [hCell("Our Timeline"), hCell("What we are bringing to you")] }),
          new TableRow({ children: [cell("The First Quarter"), cell("Launching our core tool for Google Meet and basic notes")] }),
          new TableRow({ children: [cell("The Second Quarter"), cell("Adding payments and support for Hindi and other languages")] }),
          new TableRow({ children: [cell("The Third Quarter"), cell("Bringing MeetScribe to Zoom and Teams and adding Jira")] }),
        ]
      }),

      // PAGE 6: CONCLUSION
      new Paragraph({ children: [new PageBreak()] }),
      h1("Why We Are Doing This"),
      body("We want to live in a world where meetings lead to action, not just more meetings. MeetScribe is our way of making work more human, organized, and productive for everyone."),

      h2("The Bottom Line"),
      body("We have a plan that starts small, stays feasible, and scales with our users. By focusing on people and privacy, we are building a tool that will define the future of how we work together."),

      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe — Turning Conversations Into Action", font: "Arial", size: 34, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Our Humanized Strategic Path for 2026", font: "Arial", size: 20, color: C.gray, italics: true })] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Humanized_Scalable_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Humanized_Scalable_2026.docx created");
}).catch(err => { console.error(err); process.exit(1); });
