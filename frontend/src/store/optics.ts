import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ExperimentId = 'double' | 'single' | 'newton'
export type ParamKey = 'wavelength' | 'slitWidth' | 'slitSeparation' | 'screenDistance'

export interface ParamSpec {
  key: ParamKey
  min: number
  max: number
  step: number
  default: number
  unit: string
}

export interface ExperimentConfig {
  id: ExperimentId
  name: string
  /** 当前实验生效的参数及其口径（范围、步长、默认值），顺序即面板展示顺序 */
  params: ParamSpec[]
}

export interface ExperimentResult {
  fringe?: number
  centralWidth?: number
}

/** 明确默认：实验非法 / 历史失效时一律回落至此 */
export const DEFAULT_EXPERIMENT_ID: ExperimentId = 'double'

/**
 * 唯一口径：参数范围、步长与默认值全部在这里定义，
 * 面板滑块与物理计算共用同一份 ParamSpec，不再各写一份硬编码。
 */
export const PARAM_SPECS: Record<ParamKey, ParamSpec> = {
  wavelength: { key: 'wavelength', min: 380, max: 780, step: 5, default: 550, unit: 'nm' },
  slitWidth: { key: 'slitWidth', min: 10, max: 200, step: 5, default: 50, unit: 'μm' },
  slitSeparation: { key: 'slitSeparation', min: 50, max: 500, step: 10, default: 200, unit: 'μm' },
  screenDistance: { key: 'screenDistance', min: 100, max: 2000, step: 50, default: 1000, unit: 'mm' },
}

export const EXPERIMENTS: Record<ExperimentId, ExperimentConfig> = {
  double: {
    id: 'double',
    name: '双缝干涉 (Young实验)',
    params: [PARAM_SPECS.wavelength, PARAM_SPECS.slitWidth, PARAM_SPECS.slitSeparation, PARAM_SPECS.screenDistance],
  },
  single: {
    id: 'single',
    name: '单缝衍射 (Fraunhofer)',
    params: [PARAM_SPECS.wavelength, PARAM_SPECS.slitWidth, PARAM_SPECS.screenDistance],
  },
  newton: {
    id: 'newton',
    name: '牛顿环干涉',
    params: [PARAM_SPECS.wavelength, PARAM_SPECS.screenDistance],
  },
}

export const EXPERIMENT_LIST: ExperimentConfig[] = [EXPERIMENTS.double, EXPERIMENTS.single, EXPERIMENTS.newton]

export function isExperimentId(id: unknown): id is ExperimentId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPERIMENTS, id)
}

/** 默认参数全集（每个参数的默认值也是全局面统一的） */
function defaultParams(): Record<ParamKey, number> {
  const out = {} as Record<ParamKey, number>
  ;(Object.keys(PARAM_SPECS) as ParamKey[]).forEach((key) => {
    out[key] = PARAM_SPECS[key].default
  })
  return out
}

/** 按 spec 口径清洗单个值：非法值回默认，越界值收敛到步长网格内 */
function sanitizeValue(spec: ParamSpec, raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return spec.default
  const snapped = spec.min + Math.round((raw - spec.min) / spec.step) * spec.step
  return Math.min(spec.max, Math.max(spec.min, snapped))
}

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref<ExperimentId>(DEFAULT_EXPERIMENT_ID)
  const params = ref<Record<ParamKey, number>>(defaultParams())
  const intensityData = ref<number[]>([])
  const result = ref<ExperimentResult>({})

  const activeConfig = computed<ExperimentConfig>(() => EXPERIMENTS[currentExperiment.value])

  /** 当前实验下某参数的口径；不属于该实验时返回 undefined（面板据此决定显隐） */
  function paramSpec(key: ParamKey): ParamSpec | undefined {
    return activeConfig.value.params.find((p) => p.key === key)
  }

  /** 按当前实验口径清洗参数：非法/越界值不允许保留，就地回写为合法值 */
  function sanitizeParams(id: ExperimentId) {
    const next = { ...params.value }
    for (const spec of EXPERIMENTS[id].params) {
      next[spec.key] = sanitizeValue(spec, next[spec.key])
    }
    params.value = next
  }

  /**
   * 唯一入口：任何实验切换（按钮、历史恢复、连点）都走这里。
   * 非法 id / 失效历史一律拒绝保存，回落明确默认实验与默认参数。
   */
  function setExperiment(id: unknown) {
    if (!isExperimentId(id)) {
      currentExperiment.value = DEFAULT_EXPERIMENT_ID
      params.value = defaultParams()
      compute()
      return
    }
    currentExperiment.value = id
    // 沿用原效果：跨实验仍生效的参数（波长、屏距等）保留用户值，但必须通过新实验的口径校验
    sanitizeParams(id)
    compute()
  }

  function compute() {
    // 自愈：即使 state 被异常写入，计算也只认合法实验，杜绝面板与结果各算各的
    if (!isExperimentId(currentExperiment.value)) {
      currentExperiment.value = DEFAULT_EXPERIMENT_ID
    }
    const id = currentExperiment.value

    // 切换实验先清掉上一实验的结论，避免 fringe / centralWidth 残留串台
    result.value = {}
    sanitizeParams(id)

    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    const lambda = lam * 1e-9
    const aM = a * 1e-6
    const dM = d * 1e-6
    const LM = L * 1e-3
    const N = 800
    const data: number[] = []
    const xMax = 20e-3

    if (id === 'double') {
      result.value.fringe = Math.round(lambda * LM / dM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const delta = Math.PI * dM * x / (lambda * LM)
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const single = Math.sin(beta) / beta
        const intensity = Math.cos(delta) ** 2 * single ** 2
        data.push(Math.max(0, intensity))
      }
    } else if (id === 'single') {
      result.value.centralWidth = Math.round(2 * lambda * LM / aM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const intensity = (Math.sin(beta) / beta) ** 2
        data.push(Math.max(0, intensity))
      }
    } else { // newton
      const R = 1.0
      for (let i = 0; i < N; i++) {
        const r = (i / N) * 5e-3
        const path = r * r / (2 * R)
        const phi = 2 * Math.PI * path / lambda + Math.PI
        const intensity = 0.5 * (1 - Math.cos(phi))
        data.push(Math.max(0, intensity))
      }
    }

    // 空数据不允许残留上一实验结论
    if (!data.length) result.value = {}
    intensityData.value = data
  }

  return {
    experiments: EXPERIMENT_LIST,
    currentExperiment,
    activeConfig,
    params,
    intensityData,
    result,
    paramSpec,
    setExperiment,
    compute,
  }
})
