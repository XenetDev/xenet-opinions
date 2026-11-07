import type { ReportSummary } from '@xo/engine/parts'
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { GROUP_COLUMNS, NO_GROUPS, NONE_RAISED, type ReportDocument, reportDocument, SECTION_TITLES } from './content'
import type { Block, Span } from './markdown'
import { type ExportMeta, MIME_TYPES } from './meta'

const FONT = 'Calibri'
const INK = '111827'
const MUTED = '6B7280'
const LINE = 'E5E7EB'
const PANEL = 'F9FAFB'
const SPLIT_COLOURS = { positive: '16A34A', neutral: '9CA3AF', negative: 'DC2626' } as const
const GROUP_WIDTHS = [19, 9, 12, 17, 43]
const groupWidth = (i: number) => GROUP_WIDTHS[i] ?? 0
const NUMBERED = 'numbered'
const PAGE = { width: 11906, height: 16838, margin: 1134 }
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin
const dxa = (percent: number) => Math.round((CONTENT_WIDTH * percent) / 100)
const fullWidth = { size: CONTENT_WIDTH, type: WidthType.DXA }
const FIXED = TableLayoutType.FIXED
const HEADINGS = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4] as const

const run = (text: string, options: { bold?: boolean; italics?: boolean; muted?: boolean; size?: number } = {}) =>
  new TextRun({
    text,
    bold: options.bold,
    italics: options.italics,
    size: options.size,
    color: options.muted ? MUTED : undefined,
  })

const spans = (items: Span[]) => items.map((span) => run(span.text, { bold: span.bold, italics: span.italic }))

const heading = (text: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [run(text)] })

const muted = (text: string) => new Paragraph({ children: [run(text, { muted: true })] })

const bullet = (children: TextRun[]) => new Paragraph({ bullet: { level: 0 }, children })

const quote = (children: TextRun[]) =>
  new Paragraph({
    indent: { left: 360 },
    spacing: { before: 60, after: 120 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'D1D5DB', space: 8 } },
    children,
  })

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE }
const borders = {
  top: border,
  bottom: border,
  left: border,
  right: border,
  insideHorizontal: border,
  insideVertical: border,
}
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none }
const cellMargins = { top: 80, bottom: 80, left: 100, right: 100 }

const cell = (children: Paragraph[], width: number, fill?: string) =>
  new TableCell({
    children,
    width: { size: dxa(width), type: WidthType.DXA },
    margins: cellMargins,
    shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  })

function headlineTable(doc: ReportDocument) {
  return new Table({
    width: fullWidth,
    layout: FIXED,
    columnWidths: doc.headline.map(() => dxa(25)),
    borders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: doc.headline.map((tile) =>
          cell(
            [
              new Paragraph({ children: [run(tile.label, { muted: true, size: 18 })] }),
              new Paragraph({ children: [run(tile.value, { bold: true, size: 28 })] }),
              ...(tile.note ? [new Paragraph({ children: [run(tile.note, { muted: true, size: 18 })] })] : []),
            ],
            25,
          ),
        ),
      }),
    ],
  })
}

function splitBlock(doc: ReportDocument) {
  if (!doc.split.total) return [muted(doc.split.label)]
  const segments = doc.split.segments.filter((seg) => seg.count > 0)
  return [
    new Table({
      width: fullWidth,
      layout: FIXED,
      columnWidths: segments.map((seg) => dxa(seg.share * 100)),
      borders: noBorders,
      rows: [
        new TableRow({
          height: { value: 160, rule: 'exact' },
          children: segments.map(
            (seg) =>
              new TableCell({
                width: { size: dxa(seg.share * 100), type: WidthType.DXA },
                shading: { fill: SPLIT_COLOURS[seg.key], type: ShadingType.CLEAR, color: 'auto' },
                children: [new Paragraph({ children: [run('', { size: 2 })] })],
              }),
          ),
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 80 },
      children: doc.split.segments.flatMap((seg, i) => [
        new TextRun({ text: `${i ? '     ' : ''}■ `, color: SPLIT_COLOURS[seg.key] }),
        run(seg.legend, { muted: true }),
      ]),
    }),
  ]
}

function groupsTable(doc: ReportDocument) {
  if (!doc.groups.length) return [muted(NO_GROUPS)]
  return [
    new Table({
      width: fullWidth,
      layout: FIXED,
      columnWidths: GROUP_WIDTHS.map((width) => dxa(width)),
      borders,
      rows: [
        new TableRow({
          tableHeader: true,
          children: GROUP_COLUMNS.map((column, i) =>
            cell(
              [new Paragraph({ children: [run(column, { bold: true, muted: true, size: 18 })] })],
              groupWidth(i),
              PANEL,
            ),
          ),
        }),
        ...doc.groups.map(
          (group) =>
            new TableRow({
              cantSplit: true,
              children: group.cells.map((text, i) =>
                cell([new Paragraph({ children: [run(text, { bold: i === 0, muted: i === 4 })] })], groupWidth(i)),
              ),
            }),
        ),
      ],
    }),
  ]
}

function markdownTable(header: Span[][], rows: Span[][][]) {
  const width = 100 / Math.max(header.length, 1)
  const tableRow = (cells: Span[][], head: boolean) =>
    new TableRow({
      tableHeader: head,
      children: header.map((_, i) =>
        cell(
          [
            new Paragraph({
              children: (cells[i] ?? []).map((span) =>
                run(span.text, { bold: head || span.bold, italics: span.italic }),
              ),
            }),
          ],
          width,
          head ? PANEL : undefined,
        ),
      ),
    })
  return new Table({
    width: fullWidth,
    layout: FIXED,
    columnWidths: header.map(() => dxa(width)),
    borders,
    rows: [tableRow(header, true), ...rows.map((row) => tableRow(row, false))],
  })
}

function markdown(blocks: Block[]) {
  return blocks.flatMap((block): (Paragraph | Table)[] => {
    if (block.type === 'table') return [markdownTable(block.header, block.rows), new Paragraph({ children: [] })]
    if (block.type === 'code')
      return [
        new Paragraph({
          shading: { fill: PANEL, type: ShadingType.CLEAR, color: 'auto' },
          children: block.lines.map((line, i) => new TextRun({ text: line, break: i ? 1 : 0, size: 19 })),
        }),
      ]
    if (block.type === 'heading')
      return [new Paragraph({ heading: HEADINGS[block.level - 1], keepNext: true, children: spans(block.inline) })]
    if (block.type === 'quote')
      return [quote(block.inline.map((span) => run(span.text, { bold: span.bold, italics: span.italic, muted: true })))]
    if (block.type === 'list')
      return block.items.map((item, n) =>
        block.ordered
          ? new Paragraph({
              indent: { left: 360, hanging: 360 },
              children: [run(`${block.start + n}.\t`), ...spans(item)],
              tabStops: [{ type: 'left', position: 360 }],
            })
          : bullet(spans(item)),
      )
    return [new Paragraph({ children: spans(block.inline) })]
  })
}

function body(doc: ReportDocument) {
  return [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [run(doc.title)] }),
    new Paragraph({ spacing: { after: 240 }, children: [run(doc.metaLine, { muted: true, size: 18 })] }),

    heading(SECTION_TITLES.verdict),
    new Paragraph({ children: [run(doc.verdict.text, { bold: true, size: 26 })] }),
    muted(doc.verdict.reason),
    new Paragraph({ children: [run(`${doc.verdict.confidence} · ${doc.verdict.basis}`, { muted: true, size: 18 })] }),

    heading(SECTION_TITLES.headline),
    headlineTable(doc),

    heading(SECTION_TITLES.split),
    ...splitBlock(doc),

    heading(SECTION_TITLES.groups),
    ...groupsTable(doc),

    ...(doc.findings.length
      ? [
          heading(SECTION_TITLES.findings),
          ...doc.findings.flatMap((finding) => [
            new Paragraph({
              numbering: { reference: NUMBERED, level: 0, instance: 1 },
              keepNext: !!finding.quote,
              children: [run(finding.title, { bold: true }), run(` ${finding.detail}`)],
            }),
            ...(finding.quote
              ? [
                  quote([
                    run(`“${finding.quote.text}”`, { muted: true }),
                    new TextRun({ text: finding.quote.name, break: 1, size: 18, color: MUTED }),
                  ]),
                ]
              : []),
          ]),
        ]
      : []),

    heading(SECTION_TITLES.risks),
    new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [run('Risks')] }),
    ...(doc.risks.length ? doc.risks.map((item) => bullet([run(item)])) : [muted(NONE_RAISED)]),
    new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [run('Opportunities')] }),
    ...(doc.opportunities.length ? doc.opportunities.map((item) => bullet([run(item)])) : [muted(NONE_RAISED)]),

    heading(SECTION_TITLES.participants),
    ...doc.participants.map(
      (p) =>
        new Paragraph({
          keepLines: true,
          spacing: { after: 120 },
          children: [
            run(p.name, { bold: true }),
            run(
              [p.details, p.stance]
                .filter(Boolean)
                .map((part) => ` · ${part}`)
                .join(''),
              { muted: true },
            ),
            ...(p.opinion || p.quote ? [new TextRun({ text: '', break: 1 })] : []),
            ...(p.opinion ? [run(p.opinion)] : []),
            ...(p.quote ? [run(`${p.opinion ? ' ' : ''}“${p.quote}”`, { muted: true })] : []),
          ],
        }),
    ),

    heading(SECTION_TITLES.sources),
    ...(doc.sources.length
      ? doc.sources.map(
          (source) =>
            new Paragraph({
              numbering: { reference: NUMBERED, level: 0, instance: 2 },
              children: [
                source.link
                  ? new ExternalHyperlink({
                      link: source.url,
                      children: [new TextRun({ text: source.title, style: 'Hyperlink' })],
                    })
                  : run(source.title),
                new TextRun({ text: source.host, break: 1, size: 18, color: MUTED }),
              ],
            }),
        )
      : [muted(doc.sourcesEmpty)]),

    heading(SECTION_TITLES.method),
    new Paragraph({ children: [run(doc.method)] }),

    heading(SECTION_TITLES.writeup),
    ...(doc.writeupEmpty ? [muted(doc.writeupEmpty)] : markdown(doc.writeup)),
  ]
}

const headingStyle = (id: string, name: string, size: number, before: number) => ({
  id,
  name,
  basedOn: 'Normal',
  next: 'Normal',
  quickFormat: true,
  run: { font: FONT, size, bold: true, color: INK },
  paragraph: { spacing: { before, after: 100 } },
})

export async function exportDocx(summary: ReportSummary, meta: ExportMeta): Promise<Blob> {
  const doc = reportDocument(summary, meta)
  const file = new Document({
    creator: 'Xenet Opinions',
    title: doc.title,
    description: doc.metaLine,
    styles: {
      default: {
        document: { run: { font: FONT, size: 21, color: INK }, paragraph: { spacing: { after: 80, line: 276 } } },
      },
      paragraphStyles: [
        { ...headingStyle('Title', 'Title', 36, 0), paragraph: { spacing: { after: 60 } } },
        headingStyle('Heading1', 'Heading 1', 26, 320),
        headingStyle('Heading2', 'Heading 2', 22, 200),
        headingStyle('Heading3', 'Heading 3', 21, 160),
        headingStyle('Heading4', 'Heading 4', 21, 120),
      ],
    },
    numbering: {
      config: [
        {
          reference: NUMBERED,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 360, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Xenet Opinions · Simulated focus group, not real respondents',
                    size: 16,
                    color: MUTED,
                  }),
                  new TextRun({
                    children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                    size: 16,
                    color: MUTED,
                  }),
                ],
                tabStops: [{ type: 'right', position: CONTENT_WIDTH }],
              }),
            ],
          }),
        },
        children: body(doc),
      },
    ],
  })
  return new Blob([await Packer.toArrayBuffer(file)], { type: MIME_TYPES.docx })
}
