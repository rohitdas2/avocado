import SwiftUI
import Charts
import HealthKit

struct StepsActivityCard: View {
    @Environment(HealthKitManager.self) private var healthKit
    @State private var weeklySteps: [HealthKitManager.DailyMetric] = []
    @State private var todaySteps: Double = 0
    @State private var todayActiveEnergy: Double = 0
    
    let goal: Double = 10000
    
    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Activity")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    
                    Spacer()
                    
                    if !healthKit.isAuthorized {
                        Button {
                            Task {
                                try? await healthKit.requestAuthorization()
                                await loadData()
                            }
                        } label: {
                            Text("Connect Health")
                                .font(.caption.bold())
                                .foregroundStyle(AppTheme.background)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(Capsule().fill(AppTheme.accent))
                        }
                    }
                }
                
                HStack(spacing: 20) {
                    MacroRingView(
                        progress: todaySteps / goal,
                        lineWidth: 12,
                        gradient: LinearGradient(colors: [AppTheme.accent, AppTheme.success], startPoint: .leading, endPoint: .trailing),
                        size: 100
                    ) {
                        VStack(spacing: 2) {
                            Image(systemName: "figure.walk")
                                .foregroundStyle(AppTheme.accent)
                                .font(.system(size: 16, weight: .bold))
                            
                            Text("\(Int(todaySteps))")
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundStyle(.primary)
                        }
                    }
                    
                    VStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Active Energy")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
                            HStack(alignment: .firstTextBaseline, spacing: 2) {
                                Text("\(Int(todayActiveEnergy))")
                                    .font(.title2.bold())
                                    .foregroundStyle(AppTheme.protein)
                                
                                Text("kcal")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        
                        if !weeklySteps.isEmpty {
                            Chart {
                                ForEach(weeklySteps) { metric in
                                    BarMark(
                                        x: .value("Day", metric.date, unit: .day),
                                        y: .value("Steps", metric.value)
                                    )
                                    .foregroundStyle(
                                        Calendar.current.isDateInToday(metric.date) ? AppTheme.accent : AppTheme.surfaceLight
                                    )
                                    .cornerRadius(4)
                                }
                                
                                RuleMark(y: .value("Goal", goal))
                                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 2]))
                                    .foregroundStyle(.gray.opacity(0.5))
                            }
                            .chartXAxis(.hidden)
                            .chartYAxis(.hidden)
                            .frame(height: 50)
                        }
                    }
                }
            }
            .padding()
        }
        .task {
            await loadData()
        }
    }
    
    private func loadData() async {
        if healthKit.isAuthorized {
            todaySteps = (try? await healthKit.fetchTodaySteps()) ?? 0
            todayActiveEnergy = (try? await healthKit.fetchTodayActiveEnergy()) ?? 0
            weeklySteps = (try? await healthKit.fetchDailySteps(days: 7)) ?? []
        }
    }
}
