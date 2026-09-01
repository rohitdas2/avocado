import SwiftUI
import Charts

struct WeightTrendChart: View {
    let rawWeights: [(date: Date, weightKg: Double)]
    let trendWeights: [(date: Date, weightKg: Double)]
    let goalWeight: Double?
    
    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                Text("Weight Trend")
                    .font(.headline)
                    .foregroundStyle(.secondary)
                
                if rawWeights.isEmpty {
                    Text("No weight data available")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 40)
                } else {
                    Chart {
                        if let goal = goalWeight {
                            RuleMark(y: .value("Goal", goal))
                                .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 5]))
                                .foregroundStyle(.gray)
                                .annotation(position: .top, alignment: .leading) {
                                    Text("Goal")
                                        .font(.caption2)
                                        .foregroundStyle(.gray)
                                }
                        }
                        
                        ForEach(rawWeights, id: \.date) { item in
                            PointMark(
                                x: .value("Date", item.date),
                                y: .value("Weight", item.weightKg)
                            )
                            .foregroundStyle(.secondary.opacity(0.5))
                            .symbolSize(30)
                        }
                        
                        ForEach(trendWeights, id: \.date) { item in
                            LineMark(
                                x: .value("Date", item.date),
                                y: .value("Trend", item.weightKg)
                            )
                            .foregroundStyle(AppTheme.accent)
                            .lineStyle(StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                            .interpolationMethod(.monotone)
                        }
                    }
                    .chartYScale(domain: yDomain)
                    .chartXAxis {
                        AxisMarks(values: .stride(by: .day, count: 7)) { value in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 2]))
                                .foregroundStyle(AppTheme.surfaceLight)
                            AxisValueLabel(format: .dateTime.month().day())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading) { value in
                            AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 2]))
                                .foregroundStyle(AppTheme.surfaceLight)
                            AxisValueLabel()
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(height: 200)
                }
            }
            .padding()
        }
    }
    
    private var yDomain: ClosedRange<Double> {
        let minRaw = rawWeights.map(\.weightKg).min() ?? 0
        let maxRaw = rawWeights.map(\.weightKg).max() ?? 0
        let minTrend = trendWeights.map(\.weightKg).min() ?? 0
        let maxTrend = trendWeights.map(\.weightKg).max() ?? 0
        
        var minVal = min(minRaw, minTrend)
        var maxVal = max(maxRaw, maxTrend)
        
        if let goal = goalWeight {
            minVal = min(minVal, goal)
            maxVal = max(maxVal, goal)
        }
        
        if minVal == maxVal {
            return (minVal - 5)...(maxVal + 5)
        }
        
        let padding = (maxVal - minVal) * 0.2
        return (minVal - padding)...(maxVal + padding)
    }
}
