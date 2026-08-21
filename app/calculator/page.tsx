import type { Metadata } from "next"
import ScoreCalculator from "@/components/score-calculator"

export const metadata: Metadata = {
  title: "Duplicate Score Calculator | Bridge by Vimal Advani",
  description: "Calculate duplicate bridge scores, matchpoints, Cross-IMPs, and datum IMPs.",
}

export default function CalculatorPage() {
  return <ScoreCalculator />
}
