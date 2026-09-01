import SwiftUI

struct NutrientDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let status: MicronutrientStatus
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.surface.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Header Ring
                        VStack(spacing: 16) {
                            MacroRingView(
                                progress: min(status.percentage / 100.0, 1.0),
                                lineWidth: 16,
                                gradient: LinearGradient(colors: [colorForStatus(status.level), colorForStatus(status.level).opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing),
                                size: 160
                            ) {
                                VStack {
                                    Text("\(Int(status.percentage))%")
                                        .font(.system(size: 32, weight: .bold, design: .rounded))
                                        .foregroundStyle(.primary)
                                    
                                    Text(status.level.rawValue.capitalized)
                                        .font(.caption.bold())
                                        .foregroundStyle(colorForStatus(status.level))
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(Capsule().fill(colorForStatus(status.level).opacity(0.2)))
                                }
                            }
                            
                            HStack(spacing: 40) {
                                VStack {
                                    Text("Current Intake")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text("\(status.currentIntake, specifier: "%.1f") \(status.nutrient.unit)")
                                        .font(.headline)
                                }
                                
                                VStack {
                                    Text("Daily Target")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    Text("\(status.rdaTarget, specifier: "%.1f") \(status.nutrient.unit)")
                                        .font(.headline)
                                }
                            }
                        }
                        .padding(.top, 20)
                        
                        // Foods Section
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Top Foods to Boost \(status.nutrient.displayName)")
                                .font(.title3.bold())
                                .padding(.horizontal)
                            
                            let suggestions = MicronutrientAnalyzer.suggestFoods(for: status.nutrient)
                            
                            if suggestions.isEmpty {
                                Text("No specific suggestions available.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal)
                            } else {
                                ForEach(suggestions) { food in
                                    FoodSuggestionCard(suggestion: food)
                                        .padding(.horizontal)
                                }
                            }
                        }
                    }
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle(status.nutrient.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .font(.title3)
                    }
                }
            }
            .toolbarBackground(AppTheme.surface, for: .navigationBar)
        }
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

struct FoodSuggestionCard: View {
    let suggestion: FoodSuggestion
    
    var body: some View {
        HStack(spacing: 16) {
            // Placeholder emoji based on name or generic
            Text(foodEmoji(for: suggestion.foodName))
                .font(.system(size: 32))
                .frame(width: 50, height: 50)
                .background(Circle().fill(AppTheme.surfaceLight))
            
            VStack(alignment: .leading, spacing: 4) {
                Text(suggestion.foodName)
                    .font(.headline)
                
                Text(suggestion.servingDescription)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            VStack(alignment: .trailing, spacing: 4) {
                Text("\(suggestion.percentRDA)% RDA")
                    .font(.subheadline.bold())
                    .foregroundStyle(AppTheme.accent)
                
                Text("\(suggestion.nutrientAmount, specifier: "%.1f") unit") // Needs actual unit
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(AppTheme.surfaceLight.opacity(0.5))
        )
    }
    
    private func foodEmoji(for name: String) -> String {
        let name = name.lowercased()
        if name.contains("salmon") || name.contains("fish") { return "🐟" }
        if name.contains("egg") { return "🥚" }
        if name.contains("spinach") || name.contains("kale") { return "🥬" }
        if name.contains("beef") || name.contains("meat") { return "🥩" }
        if name.contains("chicken") || name.contains("poultry") { return "🍗" }
        if name.contains("milk") || name.contains("cheese") { return "🥛" }
        if name.contains("nut") || name.contains("almond") { return "🥜" }
        if name.contains("orange") || name.contains("citrus") { return "🍊" }
        if name.contains("carrot") { return "🥕" }
        if name.contains("avocado") { return "🥑" }
        if name.contains("bean") || name.contains("lentil") { return "🫘" }
        return "🥗"
    }
}
