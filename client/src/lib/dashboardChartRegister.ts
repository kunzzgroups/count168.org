import { Chart, registerables } from 'chart.js'

let done = false

export function registerDashboardCharts() {
  if (done) return
  Chart.register(...registerables)
  done = true
}
