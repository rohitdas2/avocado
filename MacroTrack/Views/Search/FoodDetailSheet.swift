import SwiftUI
import SwiftData
import Charts

struct FoodDetailSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(FoodRepository.self) private var repository
    @Environment(\.dismiss) private var dismiss
    
    let food: FoodItem
    let targetMeal: MealLog
    
    @State private var quantity: Double = 1.0
    @State private var selectedOptionId: String = "default"
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    Text(food.name)
                        .font(.largeTitle.bold())
                    
                    if let brand = food.brand {
                        Text(brand)
                            .font(.title3)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.top)
                
                // Serving Selection
                GlassCard {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Serving Size")
                                .font(.headline)
                            Picker("Serving Unit", selection: $selectedOptionId) {
                                Text("Grams (100g)").tag("default")
                                ForEach(food.servingOptions) { option in
                                    Text(option.unitName).tag(option.id.uuidString)
                                }
                            }
                            .pickerStyle(.menu)
                            .labelsHidden()
                        }
                        
                        Spacer()
                        
                        VStack(alignment: .trailing) {
                            Text("Quantity")
                                .font(.headline)
                            HStack {
                                TextField("1.0", value: $quantity, format: .number)
                                    .keyboardType(.decimalPad)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 60)
                                    .multilineTextAlignment(.center)
                                
                                Stepper("", value: $quantity, in: 0.1...100, step: 0.5)
                                    .labelsHidden()
                            }
                        }
                    }
                    .padding()
                }
                
                // Calculate current macros
                let multiplier = calculateMultiplier()
                let currentCals = food.caloriesPer100g * multiplier
                let currentProtein = food.proteinPer100g * multiplier
                let currentCarbs = food.carbsPer100g * multiplier
                let currentFat = food.fatPer100g * multiplier
                
                // Charts and Facts
                HStack(alignment: .top, spacing: 20) {
                    // Macro Donut
                    VStack {
                        Chart {
                            SectorMark(
                                angle: .value("Protein", currentProtein),
                                innerRadius: .ratio(0.65),
                                angularInset: 1.5
                            )
                            .foregroundStyle(AppTheme.protein)
                            
                            SectorMark(
                                angle: .value("Carbs", currentCarbs),
                                innerRadius: .ratio(0.65),
                                angularInset: 1.5
                            )
                            .foregroundStyle(AppTheme.carbs)
                            
                            SectorMark(
                                angle: .value("Fat", currentFat),
                                innerRadius: .ratio(0.65),
                                angularInset: 1.5
                            )
                            .foregroundStyle(AppTheme.fat)
                        }
                        .frame(height: 120)
                        .chartBackground { chartProxy in
                            GeometryReader { geometry in
                                let frame = geometry[chartProxy.plotFrame!]
                                VStack(spacing: 0) {
                                    Text("\(Int(currentCals))")
                                        .font(.title3.bold())
                                    Text("kcal")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .position(x: frame.midX, y: frame.midY)
                            }
                        }
                        
                        HStack {
                            Circle().fill(AppTheme.protein).frame(width: 8, height: 8)
                            Text("P").font(.caption)
                            Circle().fill(AppTheme.carbs).frame(width: 8, height: 8)
                            Text("C").font(.caption)
                            Circle().fill(AppTheme.fat).frame(width: 8, height: 8)
                            Text("F").font(.caption)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    
                    // Nutrition Facts Panel
                    NutritionFactsPanel(
                        calories: currentCals,
                        protein: currentProtein,
                        carbs: currentCarbs,
                        fat: currentFat,
                        fiber: (food.fiberPer100g ?? 0) * multiplier,
                        sodium: 0,
                        servingSize: "\(String(format: "%.1f", quantity)) serving(s)"
                    )
                    .frame(maxWidth: .infinity)
                }
                
                Spacer(minLength: 40)
                
                // Log Button
                Button {
                    let unit = selectedOptionId == "default" ? "g" : (food.servingOptions.first(where: { $0.id.uuidString == selectedOptionId })?.unitName ?? "serving")
                    let weight = multiplier * 100 // Gram weight total
                    repository.logFood(
                        foodItem: food,
                        servingAmount: quantity,
                        servingUnit: unit,
                        gramWeight: weight,
                        to: targetMeal,
                        context: modelContext
                    )
                    dismiss()
                } label: {
                    Text("Log to \(targetMeal.mealType.rawValue)")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(AppTheme.accent)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
            .padding()
        }
        .background(AppTheme.background.ignoresSafeArea())
    }
    
    private func calculateMultiplier() -> Double {
        if selectedOptionId == "default" {
            // quantity represents how many 100g chunks
            return quantity
        } else if let option = food.servingOptions.first(where: { $0.id.uuidString == selectedOptionId }) {
            return (option.gramWeight / 100.0) * quantity
        }
        return quantity
    }
}
