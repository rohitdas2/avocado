import SwiftUI

struct MicronutrientDashboardView: View {
    var viewModel: InsightsViewModel
    @State private var selectedTab: Int = 0
    
    let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]
    
    var filteredStatuses: [MicronutrientStatus] {
        switch selectedTab {
        case 1:
            return viewModel.micronutrientStatuses.filter { $0.nutrient.category == .vitamins }
        case 2:
            return viewModel.micronutrientStatuses.filter { $0.nutrient.category == .minerals }
        default:
            return viewModel.micronutrientStatuses
        }
    }
    
    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Micronutrients")
                            .font(.title3.bold())
                        
                        Text("\(viewModel.adequateCount) of 25 Adequate")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    
                    Spacer()
                    
                    HStack(spacing: 8) {
                        StatusDot(count: viewModel.adequateCount, color: AppTheme.adequate)
                        StatusDot(count: viewModel.lowCount, color: AppTheme.low)
                        StatusDot(count: viewModel.deficientCount, color: AppTheme.deficient)
                    }
                }
                
                Picker("Category", selection: $selectedTab) {
                    Text("All").tag(0)
                    Text("Vitamins").tag(1)
                    Text("Minerals").tag(2)
                }
                .pickerStyle(.segmented)
                .onAppear {
                    UISegmentedControl.appearance().selectedSegmentTintColor = UIColor(AppTheme.surfaceLight)
                    UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor.white], for: .selected)
                    UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor.gray], for: .normal)
                }
                
                if viewModel.micronutrientStatuses.isEmpty {
                    VStack {
                        Image(systemName: "leaf")
                            .font(.largeTitle)
                            .foregroundStyle(AppTheme.accent)
                            .padding(.bottom, 8)
                        Text("Log food to see micronutrient insights")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(filteredStatuses) { status in
                            NutrientMiniCard(status: status)
                                .onTapGesture {
                                    HapticFeedback.play(style: .light)
                                    viewModel.selectedNutrient = status.nutrient
                                    viewModel.showingNutrientDetail = true
                                }
                        }
                    }
                }
            }
            .padding()
        }
    }
}

struct StatusDot: View {
    let count: Int
    let color: Color
    
    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text("\(count)")
                .font(.caption2.bold())
                .foregroundStyle(.secondary)
        }
    }
}

struct NutrientMiniCard: View {
    let status: MicronutrientStatus
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(status.nutrient.displayName)
                    .font(.caption.bold())
                    .lineLimit(1)
                
                Spacer()
                
                Text("\(Int(status.percentage))%")
                    .font(.caption2.bold())
                    .foregroundStyle(colorForStatus(status.level))
            }
            
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(AppTheme.surfaceLight)
                        .frame(height: 6)
                    
                    Capsule()
                        .fill(colorForStatus(status.level))
                        .frame(width: min(CGFloat(status.percentage / 100.0) * geometry.size.width, geometry.size.width), height: 6)
                }
            }
            .frame(height: 6)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(AppTheme.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(AppTheme.surfaceLight, lineWidth: 1)
                )
        )
    }
    
    private func colorForStatus(_ level: DeficiencyLevel) -> Color {
        switch level {
        case .adequate: return AppTheme.adequate
        case .low: return AppTheme.low
        case .deficient: return AppTheme.deficient
        case .excess: return AppTheme.excess
        }
    }
}
