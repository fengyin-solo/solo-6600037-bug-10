import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useOpticsStore = defineStore('optics', () => {
  const currentExperiment = ref('double')
  const params = ref({ wavelength: 550, slitWidth: 50, slitSeparation: 200, screenDistance: 1000 })
  const intensityData = ref<number[]>([])
  const result = ref<{ fringe?: number; centralWidth?: number }>({})

  function setExperiment(id: string) { currentExperiment.value = id; compute() }

  function compute() {
    const { wavelength: lam, slitWidth: a, slitSeparation: d, screenDistance: L } = params.value
    const lambda = lam * 1e-9
    const aM = a * 1e-6
    const dM = d * 1e-6
    const LM = L * 1e-3
    const N = 800
    const data: number[] = []
    const xMax = 20e-3

    if (currentExperiment.value === 'double') {
      result.value.fringe = Math.round(lambda * LM / dM * 1e3 * 100) / 100
      for (let i = 0; i < N; i++) {
        const x = (i / N - 0.5) * xMax * 2
        const delta = Math.PI * dM * x / (lambda * LM)
        const beta = Math.PI * aM * x / (lambda * LM) || 1e-10
        const single = Math.sin(beta) / beta
        const intensity = Math.cos(delta) ** 2 * single ** 2
        data.push(Math.max(0, intensity))
      }
    } else if (currentExperiment.value === 'single') {
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

    intensityData.value = data
  }

  return { currentExperiment, params, intensityData, result, setExperiment, compute }
})
