import SwiftUI
import SwiftData
import Charts

struct AnalyticsView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = AnalyticsViewModel()
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Picker("Time Range", selection: $viewModel.selectedTimeRange) {
                        ForEach(TimeRange.allCases) { range in
                            Text(range.rawValue).tag(range)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .onChange(of: viewModel.selectedTimeRange) {
                        viewModel.loadData(context: modelContext)
                    }
                    
                    // Calorie Trend Chart
                    GlassCard {
                        VStack(alignment: .leading) {
                            Text("Calorie Trend")
                                .font(.headline)
                            
                            Chart {
                                ForEach(viewModel.dailyRecords) { record in
                                    BarMark(
                                        x: .value("Date", record.date, unit: .day),
                                        y: .value("Calories", record.calories)
                                    )
                                    .foregroundStyle(record.calories <= viewModel.calorieGoal ? AnyShapeStyle(AppTheme.calorieGradient) : AnyShapeStyle(Color.orange.gradient))
                                }
                                
                                RuleMark(
                                    y: .value("Goal", viewModel.calorieGoal)
                                )
                                .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 5]))
                                .foregroundStyle(AppTheme.accent)
                                .annotation(position: .top, alignment: .leading) {
                                    Text("Goal: \(Int(viewModel.calorieGoal))")
                                        .font(.caption)
                                        .foregroundColor(AppTheme.accent)
                                }
                            }
                            .frame(height: 200)
                            .chartXAxis {
                                AxisMarks(values: .stride(by: .day)) { value in
                                    AxisValueLabel(format: .dateTime.weekday(.abbreviated))
                                }
                            }
                        }
                        .padding()
                    }
                    .padding(.horizontal)
                    
                    // Macro Distribution Donut
                    GlassCard {
                        VStack {
                            Text("Average Macro Distribution")
                                .font(.headline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            
                            Chart {
                                SectorMark(
                                    angle: .value("Protein", viewModel.totalProteinGrams),
                                    innerRadius: .ratio(0.65),
                                    angularInset: 1.5
                                )
                                .foregroundStyle(AppTheme.protein)
                                
                                SectorMark(
                                    angle: .value("Carbs", viewModel.totalCarbsGrams),
                                    innerRadius: .ratio(0.65),
                                    angularInset: 1.5
                                )
                                .foregroundStyle(AppTheme.carbs)
                                
                                SectorMark(
                                    angle: .value("Fat", viewModel.totalFatGrams),
                                    innerRadius: .ratio(0.65),
                                    angularInset: 1.5
                                )
                                .foregroundStyle(AppTheme.fat)
                            }
                            .frame(height: 180)
                            .chartBackground { chartProxy in
                                GeometryReader { geometry in
                                    let frame = geometry[chartProxy.plotFrame!]
                                    VStack(spacing: 0) {
                                        Text("Macros")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    .position(x: frame.midX, y: frame.midY)
                                }
                            }
                            
                            HStack(spacing: 16) {
                                LegendItem(color: AppTheme.protein, label: "Protein")
                                LegendItem(color: AppTheme.carbs, label: "Carbs")
                                LegendItem(color: AppTheme.fat, label: "Fat")
                            }
                            .padding(.top, 8)
                        }
                        .padding()
                    }
                    .padding(.horizontal)
                    
                    // Averages Card
                    GlassCard {
                        VStack(spacing: 16) {
                            Text("Daily Averages")
                                .font(.headline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            
                            HStack {
                                AverageStatView(title: "Calories", value: viewModel.averageCalories, unit: "kcal", color: .orange)
                                Spacer()
                                AverageStatView(title: "Protein", value: viewModel.averageProtein, unit: "g", color: AppTheme.protein)
                            }
                            Divider()
                            HStack {
                                AverageStatView(title: "Carbs", value: viewModel.averageCarbs, unit: "g", color: AppTheme.carbs)
                                Spacer()
                                AverageStatView(title: "Fat", value: viewModel.averageFat, unit: "g", color: AppTheme.fat)
                            }
                        }
                        .padding()
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("Analytics")
            .onAppear {
                viewModel.loadData(context: modelContext)
            }
        }
    }
}

struct LegendItem: View {
    let color: Color
    let label: String
    
    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}

struct AverageStatView: View {
    let title: String
    let value: Double
    let unit: String
    let color: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(Int(value))")
                    .font(.title2.bold())
                    .foregroundColor(color)
                Text(unit)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .frame(minWidth: 80, alignment: .leading)
    }
}
