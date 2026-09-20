<template>
  <div class="min-h-screen bg-slate-900 text-slate-200">
    <header class="border-b border-slate-700 px-6 py-4">
      <h1 class="text-2xl font-bold text-cyan-400">光学干涉衍射仿真实验台</h1>
      <p class="text-sm text-slate-500 mt-1">双缝干涉 · 单缝衍射 · 牛顿环 · 波长调节 · 光强热力图</p>
    </header>
    <div class="flex flex-col lg:flex-row gap-4 p-4">
      <div class="lg:w-1/4 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">实验类型</h3>
          <div class="space-y-1">
            <button v-for="exp in store.experiments" :key="exp.id" @click="store.setExperiment(exp.id)"
              :class="['w-full text-left p-2 rounded border text-sm transition-all', store.currentExperiment === exp.id ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400' : 'border-slate-700 text-slate-300 hover:border-slate-500']">
              {{ exp.name }}
            </button>
          </div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-4">
          <h3 class="text-sm font-bold text-slate-400">参数调节</h3>
          <div>
            <label class="text-xs text-slate-500">波长 λ = {{ store.params.wavelength }} {{ wavelengthSpec.unit }}</label>
            <input type="range" :min="wavelengthSpec.min" :max="wavelengthSpec.max" :step="wavelengthSpec.step" v-model.number="store.params.wavelength" @input="store.compute" class="w-full accent-cyan-500" />
            <div class="flex justify-between text-xs mt-0.5">
              <span style="color:#8b5cf6">380</span><span style="color:#06b6d4">500</span><span style="color:#22c55e">550</span><span style="color:#eab308">600</span><span style="color:#dc2626">780</span>
            </div>
          </div>
          <div v-if="slitWidthSpec">
            <label class="text-xs text-slate-500">缝宽/间距 d = {{ store.params.slitWidth }} {{ slitWidthSpec.unit }}</label>
            <input type="range" :min="slitWidthSpec.min" :max="slitWidthSpec.max" :step="slitWidthSpec.step" v-model.number="store.params.slitWidth" @input="store.compute" class="w-full accent-purple-500" />
          </div>
          <div v-if="slitSeparationSpec">
            <label class="text-xs text-slate-500">缝间距 D = {{ store.params.slitSeparation }} {{ slitSeparationSpec.unit }}</label>
            <input type="range" :min="slitSeparationSpec.min" :max="slitSeparationSpec.max" :step="slitSeparationSpec.step" v-model.number="store.params.slitSeparation" @input="store.compute" class="w-full accent-green-500" />
          </div>
          <div v-if="screenDistanceSpec">
            <label class="text-xs text-slate-500">屏幕距离 L = {{ store.params.screenDistance }} {{ screenDistanceSpec.unit }}</label>
            <input type="range" :min="screenDistanceSpec.min" :max="screenDistanceSpec.max" :step="screenDistanceSpec.step" v-model.number="store.params.screenDistance" @input="store.compute" class="w-full accent-orange-500" />
          </div>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700 text-sm">
          <h3 class="text-sm font-bold text-slate-400 mb-3">理论公式</h3>
          <div class="space-y-2 text-xs text-slate-400">
            <div v-if="store.currentExperiment === 'double'" class="bg-slate-900 rounded p-2">
              <div class="text-cyan-400 font-bold">双缝干涉</div>
              <div>亮纹: y = kλL/d (k=0,±1,±2...)</div>
              <div>条纹间距: Δy = λL/d</div>
              <div class="text-yellow-400 mt-1">Δy = {{ store.result.fringe?.toFixed(2) }} mm</div>
            </div>
            <div v-if="store.currentExperiment === 'single'" class="bg-slate-900 rounded p-2">
              <div class="text-cyan-400 font-bold">单缝衍射</div>
              <div>暗纹: a·sinθ = kλ</div>
              <div>中央亮纹宽: 2λL/a</div>
              <div class="text-yellow-400 mt-1">中央宽 = {{ store.result.centralWidth?.toFixed(2) }} mm</div>
            </div>
            <div v-if="store.currentExperiment === 'newton'" class="bg-slate-900 rounded p-2">
              <div class="text-cyan-400 font-bold">牛顿环</div>
              <div>暗环半径: r = √(nλR)</div>
              <div>R: 曲率半径</div>
            </div>
          </div>
        </div>
      </div>
      <div class="lg:w-3/4 space-y-4">
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">干涉/衍射图样</h3>
          <canvas ref="patternRef" class="w-full rounded" style="height: 200px; background: black;"></canvas>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">光强分布曲线</h3>
          <canvas ref="intensityRef" class="w-full rounded" style="height: 200px; background: #0f172a;"></canvas>
        </div>
        <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
          <h3 class="text-sm font-bold text-slate-400 mb-3">2D 热力图</h3>
          <canvas ref="heatmapRef" class="w-full rounded" style="height: 200px; background: black;"></canvas>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useOpticsStore } from './store/optics'

const store = useOpticsStore()
const patternRef = ref<HTMLCanvasElement | null>(null)
const intensityRef = ref<HTMLCanvasElement | null>(null)
const heatmapRef = ref<HTMLCanvasElement | null>(null)

// 参数范围/显隐与 store 中各实验的 ParamSpec 完全同口径
const wavelengthSpec = computed(() => store.paramSpec('wavelength')!)
const slitWidthSpec = computed(() => store.paramSpec('slitWidth'))
const slitSeparationSpec = computed(() => store.paramSpec('slitSeparation'))
const screenDistanceSpec = computed(() => store.paramSpec('screenDistance'))

function wavelengthToRGB(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0
  if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1.0 }
  else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1.0 }
  else if (nm >= 490 && nm < 510) { g = 1.0; b = -(nm - 510) / 20 }
  else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1.0 }
  else if (nm >= 580 && nm < 645) { r = 1.0; g = -(nm - 645) / 65 }
  else if (nm >= 645 && nm <= 780) { r = 1.0 }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/** 无数据时清空画布并给出占位，杜绝上一实验的画面残留 */
function drawEmpty(canvas: HTMLCanvasElement, bg: string) {
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#475569'
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('暂无数据', canvas.width / 2, canvas.height / 2)
}

function drawPattern() {
  const canvas = patternRef.value
  if (!canvas) return
  const data = store.intensityData
  if (!data.length) { drawEmpty(canvas, 'black'); return }
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, W, H)
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
  for (let x = 0; x < W; x++) {
    const idx = Math.round(x / W * (data.length - 1))
    const intensity = data[idx] || 0
    const alpha = Math.min(1, intensity)
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    ctx.fillRect(x, 0, 1, H)
  }
}

function drawIntensity() {
  const canvas = intensityRef.value
  if (!canvas) return
  const data = store.intensityData
  if (!data.length) { drawEmpty(canvas, '#0f172a'); return }
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, W, H)
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
  ctx.beginPath()
  ctx.strokeStyle = `rgb(${r},${g},${b})`
  ctx.lineWidth = 2
  data.forEach((v, i) => {
    const x = i / (data.length - 1) * W
    const y = H - v * (H - 10) - 5
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke()
  // Fill
  ctx.fillStyle = `rgba(${r},${g},${b},0.15)`
  ctx.lineTo(W, H); ctx.lineTo(0, H)
  ctx.closePath(); ctx.fill()
  // Axes
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('0', W / 2, H - 2); ctx.fillText('光强 I', 30, 12); ctx.fillText('位置 x', W - 20, H - 2)
}

function drawHeatmap() {
  const canvas = heatmapRef.value
  if (!canvas) return
  const data = store.intensityData
  if (!data.length) { drawEmpty(canvas, 'black'); return }
  canvas.width = canvas.clientWidth
  canvas.height = 200
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const [r, g, b] = wavelengthToRGB(store.params.wavelength)
  const imgData = ctx.createImageData(W, H)
  for (let x = 0; x < W; x++) {
    const idx = Math.round(x / W * (data.length - 1))
    const intensity = Math.min(1, data[idx] || 0)
    for (let y = 0; y < H; y++) {
      const dist = Math.abs(y - H / 2) / (H / 2)
      const alpha = intensity * (1 - dist * 0.8) * 255
      const pos = (y * W + x) * 4
      imgData.data[pos] = r; imgData.data[pos + 1] = g; imgData.data[pos + 2] = b; imgData.data[pos + 3] = alpha
    }
  }
  ctx.putImageData(imgData, 0, 0)
}

function renderAll() { drawPattern(); drawIntensity(); drawHeatmap() }

onMounted(() => { store.compute(); setTimeout(renderAll, 100) })
// 实验与数据是同步原子更新；watch 二者保证任何入口切换/连点后画面都与当前实验一致
watch(() => [store.currentExperiment, store.intensityData], () => renderAll())
</script>
