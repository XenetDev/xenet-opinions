import { describe, expect, it } from 'vitest'
import { englishMessage } from './messages'

describe('englishMessage', () => {
  it.each([
    [
      '没有找到符合条件的实体，请检查图谱是否正确构建',
      'MiroFish found no people or groups in the knowledge graph to simulate. Add more detail about who is involved and retry.',
    ],
    ['  LLM_API_KEY 未配置  ', 'The MiroFish LLM API key is not configured.'],
    ['ZEP_API_KEY 未配置', 'The MiroFish Zep API key is not configured.'],
    ['ZEP_API_KEY未配置', 'The MiroFish Zep API key is not configured.'],
    ['启用图谱记忆更新时必须提供 graph_id', 'MiroFish needs a graph id to enable graph memory updates.'],
    ['需要安装PyMuPDF: pip install PyMuPDF', 'MiroFish cannot read PDFs: PyMuPDF is not installed on the backend.'],
  ])('translates %j exactly', (input, output) => {
    expect(englishMessage(input)).toBe(output)
  })

  it.each([
    ['模拟不存在: sim_123', 'Simulation not found: sim_123'],
    ['文件不存在：/tmp/a.pdf', 'File not found: /tmp/a.pdf'],
    ['模拟配置不存在，请先调用 /prepare 接口', 'The simulation has not been prepared yet'],
    ['模拟配置不存在: sim_1', 'Simulation configuration not found: sim_1'],
    ['不支持的文件格式: .exe', 'Unsupported file format: .exe'],
    ['等待命令响应超时: cmd_1', 'Timed out waiting for the simulation to respond: cmd_1'],
  ])('translates the prefix of %j and keeps the detail', (input, output) => {
    expect(englishMessage(input)).toBe(output)
  })

  it('falls back to a generic message when Chinese remains', () => {
    expect(englishMessage('未知错误')).toBe('MiroFish reported an error that was not translated.')
    expect(englishMessage('模拟不存在: 测试')).toBe('MiroFish reported an error that was not translated.')
  })

  it('passes English through unchanged', () => {
    expect(englishMessage('Project not found: proj_1')).toBe('Project not found: proj_1')
  })
})
