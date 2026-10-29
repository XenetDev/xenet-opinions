export const NO_ACTORS_MESSAGE =
  'MiroFish found no people or groups in the knowledge graph to simulate. Add more detail about who is involved and retry.'

const EXACT: Record<string, string> = {
  '没有找到符合条件的实体，请检查图谱是否正确构建': NO_ACTORS_MESSAGE,
  'LLM_API_KEY 未配置': 'The MiroFish LLM API key is not configured.',
  'ZEP_API_KEY 未配置': 'The MiroFish Zep API key is not configured.',
  ZEP_API_KEY未配置: 'The MiroFish Zep API key is not configured.',
  '启用图谱记忆更新时必须提供 graph_id': 'MiroFish needs a graph id to enable graph memory updates.',
  '需要安装PyMuPDF: pip install PyMuPDF': 'MiroFish cannot read PDFs: PyMuPDF is not installed on the backend.',
}

const PREFIXES: [string, string][] = (
  [
    ['文件不存在', 'File not found'],
    ['不支持的平台', 'Unsupported platform'],
    ['不支持的文件格式', 'Unsupported file format'],
    ['无法处理的文件格式', 'Unprocessable file format'],
    ['模拟不存在', 'Simulation not found'],
    ['模拟已在运行或结束处理中', 'The simulation is already running or shutting down'],
    ['模拟环境未运行或已关闭', 'The simulation environment is not running, so interviews are unavailable'],
    ['模拟配置不存在，请先调用 /prepare 接口', 'The simulation has not been prepared yet'],
    ['模拟配置不存在', 'Simulation configuration not found'],
    ['模拟配置中没有Agent', 'The simulation has no agents'],
    ['部分图谱更新器未完整停止', 'Some graph updaters did not stop cleanly'],
    ['等待命令响应超时', 'Timed out waiting for the simulation to respond'],
    ['Zep图谱写入未完整完成', 'Writing to the Zep graph did not complete'],
    ['Zep图谱更新器初始化失败', 'The Zep graph updater failed to start'],
    ['脚本不存在', 'Script not found'],
  ] as [string, string][]
).sort(([a], [b]) => b.length - a.length)

const UNTRANSLATED = 'MiroFish reported an error that was not translated.'

const translate = (message: string) => {
  const exact = EXACT[message]
  if (exact) return exact
  for (const [zh, en] of PREFIXES) {
    if (!message.startsWith(zh)) continue
    const rest = message.slice(zh.length)
    const colon = rest.search(/[:：]/)
    const detail = colon === -1 ? '' : rest.slice(colon + 1).trim()
    return detail ? `${en}: ${detail}` : en
  }
  return message
}

export function englishMessage(message: string): string {
  const english = translate(message.trim())
  return /\p{Script=Han}/u.test(english) ? UNTRANSLATED : english
}
