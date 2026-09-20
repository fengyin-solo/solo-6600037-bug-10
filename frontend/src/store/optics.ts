import { defineStore } from 'pinia'
import { ref } from 'vue'

// 单一口径：实验清单、参数范围、有效阈值、默认值集中定义，
// 入口高亮 / 参数面板 / 结果区 / 计算逻辑全部以此为唯一判定标准。
export const EXPERIMENTS = [
  { id: 'double', name: '双缝干涉 (Young实验)' },
  { id: 'single', name: '单缝衍射 (Fraunhofer)' },
  { id: 'newton', name: '牛顿环干涉' },
] as const

export type ExperimentId = (typeof EXPERIMENTS)[number]['id']

export const DEFAULT_EXPERIMENT: ExperimentId = 'double'

// 参数范围与有效阈值：合法 = 有限数值且落在 [min, max] 内，否则回到明确默认
export const PARAM_RANGES = {
  wavelength: { min: 380, max: 780, default: 550 },       // nm
  slitWidth: { min: 10, max: 200, default: 50 },          // μm（缝宽 a）
  slitSeparation: { min: 50, max: 500, default: 200 },    // μm（缝间距 d）
  screenDistance: { min: 100, max: 2000, default: 1000 }, // mm
} as const

export type OpticsParams = { -readonly [K in keyof typeof PARAM_RANGES]: number }

export interface ExperimentResult {
  fringe?: number
  centralWidth?: number
}

function isExperimentId(id: unknown): id is ExperimentId {
  return typeof id === 'string' && (EXPERIMENTS as readonly { id: string }[]).some(e => e.id === id)
}

function sanitizeParams(raw: Partial<Record<keyof OpticsParams, unknown>>): OpticsParams {
  const clean = {} as OpticsParams
  for (const key of Object.keys(PARAM_RANGES) as (keyof OpticsParams)[]) {
    const { min, max, default: def } = PARAM_RANGES[key]
    const value = Number(raw?.[key])
    // 非法值（非有限数 / 超出有效阈值）不允许保存，回到明确默认
    clean[key] = Number.isFinite(value) && value >= min && value <= max ? value : def
  }
  return clean
}

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref<ExperimentId>(DEFAULT_EXPERIMENT)
  const params = ref<OpticsParams>(sanitizeParams({}))
  const intensityData = ref<number[]>([])
  const result = ref<ExperimentResult>({})

  function setExperiment(id: unknown) {
    // 非法实验 id 不保存，回到明确默认；合法 id 才允许生效
    currentExperiment.value = isExperimentId(id) ? id : DEFAULT_EXPERIMENT
    compute()
  }

  function compute() {
    // 同一口径兜底：无论状态从哪个入口被改写，计算前统一校验
    if (!isExperimentId(currentExperiment.value)) currentExperiment.value = DEFAULT_EXPERIMENT
    params.value = sanitizeParams(params.value)

    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    const lambda = lam * 1e-9
    const aM = a * 1e-6
    const dM = d * 1e-6
    const LM = L * 1e-3
    const N = 800
    const data: number[] = []
    const xMax = 20e-3
    // 失效历史不残留：结果区每次从空对象按当前实验重新判定
    const nextResult: ExperimentResult = {}
    const push = (v: number) => data.push(Number.isFinite(v) ? Math.max(0, v) : 0)

    if (currentExperiment.value === 'double') {
      nextResult.fringe = Math.round(lambda * LM / dM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const delta = Math.PI * dM * x / (lambda * LM)
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const single = Math.sin(beta) / beta
        push(Math.cos(delta) ** 2 * single ** 2)
      }
    } else if (currentExperiment.value === 'single') {
      nextResult.centralWidth = Math.round(2 * lambda * LM / aM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        push((Math.sin(beta) / beta) ** 2)
      }
    } else { // newton
      const R = 1.0
      for (let i = 0; i < N; i++) {
        const r = (i / N) * 5e-3
        const path = r * r / (2 * R)
        const phi = 2 * Math.PI * path / lambda + Math.PI
        push(0.5 * (1 - Math.cos(phi)))
      }
    }

    result.value = nextResult
    intensityData.value = data
  }

  return { currentExperiment, params, intensityData, result, setExperiment, compute }
})
