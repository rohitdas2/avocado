import SwiftUI
import SwiftData

struct QuickAddView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(FoodRepository.self) private var repository
    @Environment(\.dismiss) private var dismiss
    
    let targetMeal: MealLog
    
    @State private var calories: String = ""
    @State private var protein: String = ""
    @State private var carbs: String = ""
    @State private var fat: String = ""
    @State private var autoCalculate: Bool = true
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Text("Adding to \(targetMeal.mealType.rawValue)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    Toggle("Auto-calculate calories from macros", isOn: $autoCalculate)
                        .tint(AppTheme.accent)
                        .padding(.horizontal)
                    
                    GlassCard {
                        VStack(spacing: 16) {
                            MacroInputField(
                                icon: "flame.fill",
                                title: "Calories",
                                value: $calories,
                                color: .orange,
                                suffix: "kcal",
                                disabled: autoCalculate
                            )
                            
                            Divider()
                            
                            MacroInputField(
                                icon: "p.circle.fill",
                                title: "Protein",
                                value: $protein,
                                color: AppTheme.protein,
                                suffix: "g",
                                disabled: false
                            )
                            
                            Divider()
                            
                            MacroInputField(
                                icon: "c.circle.fill",
                                title: "Carbs",
                                value: $carbs,
                                color: AppTheme.carbs,
                                suffix: "g",
                                disabled: false
                            )
                            
                            Divider()
                            
                            MacroInputField(
                                icon: "f.circle.fill",
                                title: "Fat",
                                value: $fat,
                                color: AppTheme.fat,
                                suffix: "g",
                                disabled: false
                            )
                        }
                        .padding()
                    }
                    .padding(.horizontal)
                    
                    Button {
                        logQuickAdd()
                    } label: {
                        Text("Add")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(AppTheme.accent)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)
                }
                .padding(.vertical)
            }
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("Quick Add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: protein) { updateCalories() }
            .onChange(of: carbs) { updateCalories() }
            .onChange(of: fat) { updateCalories() }
            .onChange(of: autoCalculate) { updateCalories() }
        }
    }
    
    private func updateCalories() {
        guard autoCalculate else { return }
        let p = Double(protein) ?? 0
        let c = Double(carbs) ?? 0
        let f = Double(fat) ?? 0
        let calculated = (p * 4) + (c * 4) + (f * 9)
        calories = String(Int(calculated))
    }
    
    private func logQuickAdd() {
        let p = Double(protein) ?? 0
        let c = Double(carbs) ?? 0
        let f = Double(fat) ?? 0
        let cal = autoCalculate ? ((p * 4) + (c * 4) + (f * 9)) : (Double(calories) ?? 0)
        
        repository.quickAdd(
            calories: cal,
            protein: p,
            carbs: c,
            fat: f,
            to: targetMeal,
            context: modelContext
        )
        dismiss()
    }
}

struct MacroInputField: View {
    let icon: String
    let title: String
    @Binding var value: String
    let color: Color
    let suffix: String
    let disabled: Bool
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(color)
                .font(.title2)
                .frame(width: 32)
            
            Text(title)
                .font(.body.bold())
            
            Spacer()
            
            TextField("0", text: $value)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .disabled(disabled)
                .foregroundColor(disabled ? .secondary : .primary)
                .frame(width: 80)
            
            Text(suffix)
                .foregroundColor(.secondary)
                .frame(width: 32, alignment: .leading)
        }
    }
}
