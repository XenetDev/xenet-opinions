import { Document, Font, Link, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReportSummary } from '@xo/engine/parts'
import type { ReactNode } from 'react'
import { GROUP_COLUMNS, NO_GROUPS, NONE_RAISED, type ReportDocument, reportDocument, SECTION_TITLES } from './content'
import type { Block, Span } from './markdown'
import { type ExportMeta, MIME_TYPES } from './meta'

const SANS = 'NotoSans'
const CJK = 'NotoSansSC'
const BOLD = { fontWeight: 'bold' } as const
const ITALIC = { fontStyle: 'italic' } as const
const FONT_FILES = [
  { file: 'NotoSans-Regular.ttf', fontWeight: 400, fontStyle: 'normal' },
  { file: 'NotoSans-Bold.ttf', fontWeight: 700, fontStyle: 'normal' },
  { file: 'NotoSans-Italic.ttf', fontWeight: 400, fontStyle: 'italic' },
  { file: 'NotoSans-BoldItalic.ttf', fontWeight: 700, fontStyle: 'italic' },
] as const
const CJK_FILE = 'NotoSansSC-Regular.otf'
const CJK_TEXT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/
const LONG_WORD = 30
const INK = '#111827'
const MUTED = '#6b7280'
const LINE = '#e5e7eb'
const PANEL = '#f9fafb'
const SPLIT_COLOURS = { positive: '#16a34a', neutral: '#9ca3af', negative: '#dc2626' } as const
const GROUP_WIDTHS = ['19%', '9%', '12%', '17%', '43%']

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 60, paddingHorizontal: 52, fontSize: 10, color: INK },
  title: { fontSize: 18, fontWeight: 'bold', lineHeight: 1.25 },
  meta: { marginTop: 4, fontSize: 9, color: MUTED },
  section: { marginTop: 18 },
  h2: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  muted: { color: MUTED },
  small: { fontSize: 9, color: MUTED },
  box: { borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10, backgroundColor: PANEL },
  verdict: { fontSize: 12, fontWeight: 'bold', lineHeight: 1.35, marginBottom: 4 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  tileValue: { fontSize: 13, fontWeight: 'bold', marginVertical: 2 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: LINE, marginBottom: 6 },
  legend: { flexDirection: 'row', gap: 14, fontSize: 9, color: MUTED },
  swatch: { width: 7, height: 7, borderRadius: 3.5, marginRight: 4, marginTop: 2 },
  row: { flexDirection: 'row', borderTopWidth: 1, borderColor: LINE },
  headRow: { flexDirection: 'row', backgroundColor: PANEL },
  cell: { paddingVertical: 5, paddingHorizontal: 6 },
  headCell: { paddingVertical: 5, paddingHorizontal: 6, fontSize: 9, color: MUTED, fontWeight: 'bold' },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  item: { flexDirection: 'row', marginBottom: 4 },
  marker: { width: 16 },
  itemBody: { flex: 1 },
  quote: { marginTop: 4, borderLeftWidth: 2, borderColor: LINE, paddingLeft: 8, color: MUTED },
  columns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  h3: { fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  participant: { marginBottom: 6 },
  link: { color: INK, textDecoration: 'underline' },
  md1: { fontSize: 13, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  md2: { fontSize: 11.5, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  md3: { fontSize: 10.5, fontWeight: 'bold', marginTop: 8, marginBottom: 3 },
  para: { marginBottom: 6 },
  code: { marginBottom: 6, padding: 6, backgroundColor: PANEL, borderRadius: 3, fontSize: 9 },
  mdTable: { borderWidth: 1, borderColor: LINE, borderRadius: 3, marginBottom: 6 },
  mdCell: { flex: 1, paddingVertical: 3, paddingHorizontal: 5 },
  footer: { position: 'absolute', bottom: 28, fontSize: 8, color: MUTED },
})

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2} minPresenceAhead={40}>
        {title}
      </Text>
      {children}
    </View>
  )
}

function Item({ marker, children }: { marker: string; children: ReactNode }) {
  return (
    <View style={s.item}>
      <Text style={s.marker}>{marker}</Text>
      <View style={s.itemBody}>{children}</View>
    </View>
  )
}

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((span, i) => (
    <Text
      // biome-ignore lint/suspicious/noArrayIndexKey: spans keep their order
      key={i}
      style={{ ...(span.bold ? BOLD : {}), ...(span.italic ? ITALIC : {}) }}
    >
      {span.text}
    </Text>
  ))
}

function Markdown({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, i) => {
    const key = `${block.type}-${i}`
    if (block.type === 'heading')
      return (
        <Text key={key} style={s[`md${block.level}`]} minPresenceAhead={30}>
          <Spans spans={block.inline} />
        </Text>
      )
    if (block.type === 'quote')
      return (
        <Text key={key} style={[s.quote, s.para]}>
          <Spans spans={block.inline} />
        </Text>
      )
    if (block.type === 'list')
      return (
        <View key={key} style={s.para}>
          {block.items.map((item, n) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items keep their order
            <Item key={n} marker={block.ordered ? `${block.start + n}.` : '•'}>
              <Text>
                <Spans spans={item} />
              </Text>
            </Item>
          ))}
        </View>
      )
    if (block.type === 'code')
      return (
        <View key={key} style={s.code}>
          {block.lines.map((line, n) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: code lines keep their order
            <Text key={n}>{line || ' '}</Text>
          ))}
        </View>
      )
    if (block.type === 'table')
      return (
        <View key={key} style={s.mdTable}>
          {[block.header, ...block.rows].map((row, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: table rows keep their order
            <View key={r} style={r ? s.row : s.headRow}>
              {row.map((cell, c) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: table cells keep their order
                <Text key={c} style={[s.mdCell, r ? {} : BOLD]}>
                  <Spans spans={cell} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      )
    return (
      <Text key={key} style={s.para}>
        <Spans spans={block.inline} />
      </Text>
    )
  })
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={s.column}>
      <Text style={s.h3}>{title}</Text>
      {items.length ? (
        items.map((item) => (
          <Item key={item} marker="•">
            <Text>{item}</Text>
          </Item>
        ))
      ) : (
        <Text style={s.muted}>{NONE_RAISED}</Text>
      )}
    </View>
  )
}

function ReportPdf({ doc, cjk }: { doc: ReportDocument; cjk: boolean }) {
  return (
    <Document
      title={doc.title}
      author="Xenet Opinions"
      subject={doc.metaLine}
      creator="Xenet Opinions"
      producer="Xenet Opinions"
    >
      <Page size="A4" style={[s.page, { fontFamily: cjk ? [SANS, CJK] : SANS }]}>
        <Text style={s.title}>{doc.title}</Text>
        <Text style={s.meta}>{doc.metaLine}</Text>

        <Section title={SECTION_TITLES.verdict}>
          <View style={s.box}>
            <Text style={s.verdict}>{doc.verdict.text}</Text>
            <Text style={s.muted}>{doc.verdict.reason}</Text>
            <Text style={[s.small, { marginTop: 4 }]}>{`${doc.verdict.confidence} · ${doc.verdict.basis}`}</Text>
          </View>
        </Section>

        <Section title={SECTION_TITLES.headline}>
          <View style={s.tiles} wrap={false}>
            {doc.headline.map((tile) => (
              <View key={tile.label} style={s.tile}>
                <Text style={s.small}>{tile.label}</Text>
                <Text style={s.tileValue}>{tile.value}</Text>
                {tile.note && <Text style={s.small}>{tile.note}</Text>}
              </View>
            ))}
          </View>
        </Section>

        <Section title={SECTION_TITLES.split}>
          <View wrap={false}>
            <View style={s.bar}>
              {doc.split.segments
                .filter((seg) => seg.count > 0)
                .map((seg) => (
                  <View
                    key={seg.key}
                    style={{ flexGrow: seg.count, flexBasis: 0, backgroundColor: SPLIT_COLOURS[seg.key] }}
                  />
                ))}
            </View>
            {doc.split.total > 0 ? (
              <View style={s.legend}>
                {doc.split.segments.map((seg) => (
                  <View key={seg.key} style={{ flexDirection: 'row' }}>
                    <View style={[s.swatch, { backgroundColor: SPLIT_COLOURS[seg.key] }]} />
                    <Text>{seg.legend}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.muted}>{doc.split.label}</Text>
            )}
          </View>
        </Section>

        <Section title={SECTION_TITLES.groups}>
          {doc.groups.length ? (
            <View style={s.table}>
              <View style={s.headRow} fixed>
                {GROUP_COLUMNS.map((column, i) => (
                  <Text key={column} style={[s.headCell, { width: GROUP_WIDTHS[i] }]}>
                    {column}
                  </Text>
                ))}
              </View>
              {doc.groups.map((group) => (
                <View key={group.id} style={s.row}>
                  {group.cells.map((cell, i) => (
                    <Text
                      key={GROUP_COLUMNS[i]}
                      style={[
                        s.cell,
                        { width: GROUP_WIDTHS[i] },
                        i === 0 ? { fontWeight: 'bold' } : {},
                        i === 4 ? s.muted : {},
                      ]}
                    >
                      {cell}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.muted}>{NO_GROUPS}</Text>
          )}
        </Section>

        {doc.findings.length > 0 && (
          <Section title={SECTION_TITLES.findings}>
            {doc.findings.map((finding, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: findings have no id and keep their order
              <Item key={i} marker={`${i + 1}.`}>
                <Text>
                  <Text style={{ fontWeight: 'bold' }}>{finding.title}</Text> {finding.detail}
                </Text>
                {finding.quote && (
                  <View style={s.quote}>
                    <Text>{`“${finding.quote.text}”`}</Text>
                    <Text style={s.small}>{finding.quote.name}</Text>
                  </View>
                )}
              </Item>
            ))}
          </Section>
        )}

        <Section title={SECTION_TITLES.risks}>
          <View style={s.columns}>
            <Bullets title="Risks" items={doc.risks} />
            <Bullets title="Opportunities" items={doc.opportunities} />
          </View>
        </Section>

        <Section title={SECTION_TITLES.participants}>
          {doc.participants.map((p) => (
            <View key={p.id} style={s.participant}>
              <Text>
                <Text style={{ fontWeight: 'bold' }}>{p.name}</Text>
                {p.details && <Text style={s.muted}>{` · ${p.details}`}</Text>}
                <Text style={s.muted}>{` · ${p.stance}`}</Text>
              </Text>
              {(p.opinion || p.quote) && (
                <Text>
                  {p.opinion}
                  {p.quote && <Text style={s.muted}>{`${p.opinion ? ' ' : ''}“${p.quote}”`}</Text>}
                </Text>
              )}
            </View>
          ))}
        </Section>

        <Section title={SECTION_TITLES.sources}>
          {doc.sources.length ? (
            doc.sources.map((source, i) => (
              <Item key={source.url} marker={`${i + 1}.`}>
                {source.link ? (
                  <Link src={source.url} style={s.link}>
                    {source.title}
                  </Link>
                ) : (
                  <Text>{source.title}</Text>
                )}
                <Text style={s.small}>{source.host}</Text>
              </Item>
            ))
          ) : (
            <Text style={s.muted}>{doc.sourcesEmpty}</Text>
          )}
        </Section>

        <Section title={SECTION_TITLES.method}>
          <Text>{doc.method}</Text>
        </Section>

        <Section title={SECTION_TITLES.writeup}>
          {doc.writeupEmpty ? <Text style={s.muted}>{doc.writeupEmpty}</Text> : <Markdown blocks={doc.writeup} />}
        </Section>

        <Text style={[s.footer, { left: 52 }]} fixed>
          Xenet Opinions · Simulated focus group, not real respondents
        </Text>
        <Text
          style={[s.footer, { left: 52, right: 52, textAlign: 'right' }]}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  )
}

const SYMBOLS: Record<string, string> = {
  '\u2192': '->',
  '\u2190': '<-',
  '\u2194': '<->',
  '\u21d2': '=>',
  '\u21d0': '<=',
  '\u2191': '^',
  '\u2193': 'v',
  '\u2265': '>=',
  '\u2264': '<=',
  '\u2248': '~',
  '\u2260': '!=',
  '\u2713': '(yes)',
  '\u2714': '(yes)',
  '\u2717': '(no)',
  '\u2718': '(no)',
  '\u2605': '*',
  '\u2606': '*',
}
const SYMBOL = new RegExp(`[${Object.keys(SYMBOLS).join('')}]`, 'g')
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[\u{1F000}-\u{1FAFF}]|\uFE0F|\u200D/gu

export const pdfText = (text: string) => text.replace(SYMBOL, (c) => SYMBOLS[c] ?? c).replace(EMOJI, '')

const mapStrings = <T,>(value: T): T => {
  if (typeof value === 'string') return pdfText(value) as T
  if (Array.isArray(value)) return value.map(mapStrings) as T
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v)])) as T
  return value
}

const chunk = (word: string) => {
  if (word.length <= LONG_WORD) return [word]
  const parts: string[] = []
  for (let i = 0; i < word.length; i += LONG_WORD) parts.push(word.slice(i, i + LONG_WORD))
  return parts
}

const registered = new Set<string>()

function registerFonts(base: string, cjk: boolean) {
  if (!registered.has(SANS)) {
    Font.register({
      family: SANS,
      fonts: FONT_FILES.map(({ file, ...style }) => ({ src: `${base}${file}`, ...style })),
    })
    registered.add(SANS)
  }
  if (cjk && !registered.has(CJK)) {
    Font.register({
      family: CJK,
      fonts: [
        { src: `${base}${CJK_FILE}`, fontWeight: 400, fontStyle: 'normal' },
        { src: `${base}${CJK_FILE}`, fontWeight: 400, fontStyle: 'italic' },
      ],
    })
    registered.add(CJK)
  }
  Font.registerHyphenationCallback(chunk)
}

export async function exportPdf(
  summary: ReportSummary,
  meta: ExportMeta,
  options: { fontBase?: string } = {},
): Promise<Blob> {
  const doc = mapStrings(reportDocument(summary, meta))
  const cjk = CJK_TEXT.test(JSON.stringify(doc))
  registerFonts(options.fontBase ?? '/fonts/', cjk)
  const blob = await pdf(<ReportPdf doc={doc} cjk={cjk} />).toBlob()
  return blob.type === MIME_TYPES.pdf ? blob : new Blob([blob], { type: MIME_TYPES.pdf })
}
