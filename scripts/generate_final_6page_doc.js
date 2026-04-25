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
const toINRShort = (usdM) => `Rs. ${Math.round(usdM * USD_TO_INR / 10).toLocaleString('en-IN')} Cr`; // For millions to crores

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
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: C.indigo })]
  });
}
function body(text, opts={}) {
  return new Paragraph({
    spacing: { before: 40, after: 120 },
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
      { id: "Heading3", name: "Heading 3", run: { size: 24, bold: true, font: "Arial", color: C.indigo }, paragraph: { spacing: { before: 200, after: 80 } } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
    headers: {
      default: new Header({ children: [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.indigo, space: 4 } },
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "MeetScribe 2026 — Strategic Business & Competitive Intelligence  |  Confidential", font: "Arial", size: 17, color: C.gray, italics: true })]
      })]})
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.grayMd, space: 4 } },
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "MeetScribe AI  •  Strategic Analysis 2026  •  Page ", font: "Arial", size: 17, color: C.gray }), PageNumber.CURRENT]
      })]})
    },
    children: [
      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1: EXECUTIVE SUMMARY & 2026 MARKET
      // ═══════════════════════════════════════════════════════════════════════
      space(20),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "MeetScribe", font: "Arial", size: 80, bold: true, color: C.indigo })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "AI Meeting Intelligence & Intervention Platform", font: "Arial", size: 40, color: C.slate })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 600 }, children: [new TextRun({ text: "2026 Strategic Business Model & Competitive Research", font: "Arial", size: 24, color: C.gray, italics: true })] }),

      h1("1. Executive Summary"),
      body("In 2026, AI has moved beyond simple transcription into the era of 'Intervention'. MeetScribe is an AI-powered Chrome extension that provides a universal intelligence layer on top of every virtual meeting platform (Google Meet, Zoom, Teams, Webex). It solves the critical gap of platform-agnostic intelligence, real-time moderation, and native support for major Indian languages (Hindi, Kannada, Telugu)."),

      h2("The 2026 Market Opportunity"),
      body("The Global AI-Powered Meeting Assistant market is projected to reach Rs. 35,000 Cr ($4.2B) by the end of 2026, growing at a CAGR of 25%. India is the fastest-growing region, with over 75M knowledge workers now utilizing AI collaboration tools daily."),
      
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3500, 2000, 2000, 1860],
        rows: [
          new TableRow({ children: [hCell("Metric"), hCell("2024"), hCell("2026 Est."), hCell("CAGR")] }),
          new TableRow({ children: [cell("Global Market Size"), cell("Rs. 22,000 Cr"), cell("Rs. 35,000 Cr"), cell("25%")] }),
          new TableRow({ children: [cell("Indian Enterprise Adoption"), cell("18%"), cell("42%"), cell("35%")] }),
          new TableRow({ children: [cell("TAM for MeetScribe", { fill: C.indigoLt, bold: true }), cell("Rs. 6,000 Cr", { bold: true }), cell("Rs. 15,000 Cr", { bold: true }), cell("30%", { color: C.green })] }),
        ]
      }),
      space(10),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2: THE COMPETITION — DEEP DIVE
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("2. Competitive Landscape: 2026 Analysis"),
      body("MeetScribe competes with tech giants and specialized startups. Its core differentiator is 'The Intelligence Layer'—functioning where native tools cannot reach."),

      h2("Direct Competitor Analysis"),
      
      h3("Google Gemini & MS Teams Copilot"),
      bullet("Weakness: Walled Gardens. Copilot only works in Teams; Gemini only in Meet. Enterprises using both (hybrid stacks) suffer from fragmented data."),
      bullet("Pricing: Premium tiers (Rs. 2,500+/user/month) are prohibitively expensive for Indian SMBs."),
      bullet("Latency: Native tools often have a 5-10s delay in processing summaries."),

      h3("Zoom AI Companion"),
      bullet("Weakness: Zoom AI is highly integrated but lacks cross-platform utility. It cannot analyze a Webex or a Google Meet session."),
      bullet("Localization: Extremely poor support for Indian regional languages (Kannada, Telugu) in 2026."),

      h3("Fireflies.ai & Otter.ai (Bot-Based)"),
      bullet("Privacy: Bot-based tools are being banned by 40% of Fortune 500 companies in 2026 due to data security concerns. They require an visible AI participant."),
      bullet("MeetScribe Advantage: As a browser extension, MeetScribe is 'Silent' and captures audio locally, satisfying security audits that bots fail."),

      h2("Platform Uniqueness Matrix"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2800, 2186, 2186, 2188],
        rows: [
          new TableRow({ children: [hCell("Platform Type"), hCell("Native (Teams/Meet)"), hCell("Bots (Fireflies)"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Deployment"), cell("Integrated"), cell("External Bot"), cell("Extension (Silent)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Privacy"), cell("High"), cell("Low (Bot Visible)"), cell("High (Local Capture)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Multi-Platform"), cell("No"), cell("Partial"), cell("Yes (Universal)", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Regional Languages"), cell("None/Poor"), cell("Partial"), cell("Full (H/K/T Support)", { bold: true, color: C.indigo })] }),
        ]
      }),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 3: STRATEGIC STRENGTHS & UNIQUE POSITIONING
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("3. Columnar Comparison & Uniqueness"),
      body("A feature-by-feature comparison demonstrating MeetScribe's dominance in the 'Intervention' category."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2500, 1715, 1715, 1715, 1715],
        rows: [
          new TableRow({ children: [hCell("Capability"), hCell("MS Copilot"), hCell("Google Gemini"), hCell("Otter.ai"), hCell("MeetScribe")] }),
          new TableRow({ children: [cell("Cross-Tab Capture"), cell("No"), cell("No"), cell("Partial"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Real-time Moderation"), cell("No"), cell("No"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Sub-500ms Latency"), cell("No"), cell("No"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Jira Auto-Tickets"), cell("No"), cell("No"), cell("Yes"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Hindi/Kannada/Telugu"), cell("No"), cell("No"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Open Source Core"), cell("No"), cell("No"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
          new TableRow({ children: [cell("Silent Recording"), cell("Yes"), cell("Yes"), cell("No"), cell("Yes", { bold: true, color: C.indigo })] }),
        ]
      }),

      h2("The MeetScribe Differentiators"),
      
      h3("1. Real-time Intervention Engine"),
      body("Powered by Groq and Llama 3.3, MeetScribe analyzes speech in real-time. If a speaker uses unprofessional language or deviates from the agenda, a private alert is triggered within 2 seconds. No native platform offers this proactive moderation."),

      h3("2. Native Indian Language Processing"),
      body("MeetScribe uses fine-tuned Whisper models to handle the unique phonetics of Hindi, Kannada, and Telugu. It identifies code-switching (mixing English with local languages) seamlessly, a major pain point for Indian IT teams."),

      h3("3. One-Click Jira/Linear Actionability"),
      body("MeetScribe doesn't just summarize; it acts. It automatically maps identified action items into properly formatted Jira or Linear tickets, reducing post-meeting admin time by 90%."),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 4: BUSINESS MODEL — MVP TO MONETIZATION
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("4. Business Model: The Path to Revenue"),
      body("MeetScribe follows a tiered SaaS model optimized for rapid MVP validation and high-scale enterprise conversion."),

      h2("Phase 1: MVP Strategy"),
      bullet("Focus: Single platform (Google Meet) + English transcription + Basic Summary."),
      bullet("Goal: Validate core audio capture and diarization stability with 500 early-adopters."),
      bullet("Channel: Chrome Web Store organic search + developer communities."),

      h2("Revenue Tiers (Monthly Pricing)"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({ children: [
            cell("Free Tier", { fill: C.grayLt, bold: true, align: AlignmentType.CENTER }),
            cell("Pro Tier", { fill: C.tealLt, bold: true, align: AlignmentType.CENTER }),
            cell("Business Tier", { fill: C.indigoLt, bold: true, align: AlignmentType.CENTER }),
            cell("Enterprise", { fill: C.slateLt, bold: true, align: AlignmentType.CENTER })
          ]}),
          new TableRow({ children: [
            cell("Rs. 0", { align: AlignmentType.CENTER, size: 24, bold: true }),
            cell(toINR(9.99), { align: AlignmentType.CENTER, size: 24, bold: true, color: C.teal }),
            cell(toINR(14.99), { align: AlignmentType.CENTER, size: 24, bold: true, color: C.indigo }),
            cell("Custom", { align: AlignmentType.CENTER, size: 24, bold: true })
          ]}),
          new TableRow({ children: [
            cell("5 Mtgs/mo\n1 Language\nBasic Summary", { size: 18 }),
            cell("Unlimited Mtgs\nAll Languages\nJira Integration", { size: 18 }),
            cell("Real-time Moderation\nVoice Agent (Scout)\nTeam Analytics", { size: 18 }),
            cell("Self-Hosting\nSSO / Security\nDedicated Support", { size: 18 })
          ]})
        ]
      }),

      h2("Ancillary Revenue Streams"),
      bullet("API Access: Developer tier for companies wanting to integrate MeetScribe's low-latency diarization into their own apps."),
      bullet("Partner Referrals: Revenue share from Jira/Linear marketplace integrations."),
      bullet("Consulting: Implementation fees for self-hosted Enterprise deployments."),

      h2("Unit Economics (Projected 2026)"),
      bullet("CAC (Customer Acquisition Cost): Rs. 1,500 (Pro) | Rs. 5,500 (Business)"),
      bullet("LTV (Lifetime Value): Rs. 20,000 (Pro) | Rs. 30,000 (Business)"),
      bullet("Gross Margin: ~88% (Optimized via Groq serverless inference)"),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 5: ARCHITECTURE & ROADMAP
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("5. Technology & 2026-2027 Roadmap"),
      body("MeetScribe is built for speed, privacy, and scale. Our architecture avoids the 'Bot Problem' that plagues the industry."),

      h2("The Technical Edge"),
      bullet("Browser-Level Audio Interception: Captures system audio from any tab without requiring host permissions or bots."),
      bullet("Hybrid Inference: Fast transcription locally or via Groq; heavy processing on private Cloud GPUs."),
      bullet("Sub-500ms Pipeline: Real-time feedback loop enabled by WebSocket architecture."),

      h2("Phased Roadmap"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [1800, 4560, 3000],
        rows: [
          new TableRow({ children: [hCell("Timeline"), hCell("Key Milestones"), hCell("Success Metric")] }),
          new TableRow({ children: [cell("Q1 2026"), cell("MVP Launch: Chrome Extension for Google Meet + Core Summaries."), cell("500 Active Users")] }),
          new TableRow({ children: [cell("Q2 2026"), cell("Multi-Platform: Support for Zoom/Teams tabs + Jira auto-tickets."), cell("Rs. 2.5L MRR")] }),
          new TableRow({ children: [cell("Q3 2026"), cell("Regional Push: Hindi/Kannada/Telugu launch + AI Moderation."), cell("Rs. 15L MRR")] }),
          new TableRow({ children: [cell("Q4 2026"), cell("Scout Agent: Autonomous voice agent attending meetings."), cell("Series A Ready")] }),
          new TableRow({ children: [cell("2027"), cell("Enterprise Suite: Self-hosting, SSO, and CRM deep-integration."), cell("Rs. 60L MRR")] }),
        ]
      }),

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 6: STRATEGY, RISK & CONCLUSION
      // ═══════════════════════════════════════════════════════════════════════
      new Paragraph({ children: [new PageBreak()] }),
      h1("6. Strategy, Risks & Conclusion"),
      body("Our path to market leadership relies on rapid product iterations and a focus on the underserved 'High-Intervention' segment."),

      h2("Go-To-Market Strategy"),
      bullet("Phase 1: Product-Led Growth (PLG) via Chrome Web Store and Open Source community."),
      bullet("Phase 2: Targeted Outreach to Indian IT Services companies (TCS, Infosys, HCL) for regional language support."),
      bullet("Phase 3: Integration-led growth via Jira and Linear marketplace listings."),

      h2("Risk Mitigation Matrix"),
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2200, 1500, 5660],
        rows: [
          new TableRow({ children: [hCell("Risk"), hCell("Impact"), hCell("Mitigation")] }),
          new TableRow({ children: [cell("Native Competition"), cell("High"), cell("Maintain lead in cross-platform interoperability and regional niche.")] }),
          new TableRow({ children: [cell("Chrome API Changes"), cell("Medium"), cell("Track Manifest V4 proposals and build Firefox/Edge versions.")] }),
          new TableRow({ children: [cell("Data Regulation"), cell("High"), cell("Compliance with India's DPDP Act and GDPR; offer self-hosting.")] }),
        ]
      }),

      h1("Conclusion"),
      body("MeetScribe is the first platform to bridge the gap between simple note-taking and real-time meeting intelligence. By 2026, our positioning as a universal, privacy-first, and intervention-capable tool will allow us to capture a significant share of the Rs. 35,000 Cr market, starting with India's high-growth tech sector."),

      space(40),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", font: "Arial", size: 22, color: C.grayMd })] }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 80 },
        children: [new TextRun({ text: "MeetScribe — Turning Every Meeting Into Action", font: "Arial", size: 30, bold: true, color: C.indigo })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: "Business Intelligence Report  •  2026  •  Confidential", font: "Arial", size: 19, color: C.gray, italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("MeetScribe_Business_Strategic_2026.docx", buffer);
  console.log("SUCCESS: MeetScribe_Business_Strategic_2026.docx created (6-page Strategic Version)");
}).catch(err => { console.error(err); process.exit(1); });
