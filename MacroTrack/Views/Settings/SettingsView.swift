import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @Query private var profiles: [UserProfile]
    
    @State private var showingResetAlert = false
    
    var profile: UserProfile? {
        profiles.first
    }
    
    var body: some View {
        NavigationStack {
            Form {
                if let profile = profile {
                    Section("Daily Goals") {
                        GoalStepper(title: "Calories", value: Binding(
                            get: { profile.targetCalories },
                            set: { profile.targetCalories = $0 }
                        ), step: 50, suffix: "kcal")
                        
                        GoalStepper(title: "Protein", value: Binding(
                            get: { profile.targetProteinGrams },
                            set: { profile.targetProteinGrams = $0 }
                        ), step: 5, suffix: "g")
                        
                        GoalStepper(title: "Carbs", value: Binding(
                            get: { profile.targetCarbsGrams },
                            set: { profile.targetCarbsGrams = $0 }
                        ), step: 5, suffix: "g")
                        
                        GoalStepper(title: "Fat", value: Binding(
                            get: { profile.targetFatGrams },
                            set: { profile.targetFatGrams = $0 }
                        ), step: 5, suffix: "g")
                    }
                    
                    Section("TDEE Calculator") {
                        let bmr = NutritionCalculator.calculateBMR(
                            weightKg: profile.currentWeightKg,
                            heightCm: profile.heightCm,
                            age: calculateAge(birthDate: profile.birthDate),
                            gender: profile.gender
                        )
                        let tdee = NutritionCalculator.calculateTDEE(
                            bmr: bmr,
                            activityLevel: profile.activityLevel
                        )
                        
                        HStack {
                            Text("Basal Metabolic Rate (BMR)")
                            Spacer()
                            Text("\(Int(bmr)) kcal").foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Total Daily Energy Exp. (TDEE)")
                            Spacer()
                            Text("\(Int(tdee)) kcal").foregroundColor(.secondary)
                        }
                        
                        Button("Set Calorie Goal from TDEE") {
                            profile.targetCalories = tdee
                        }
                        .foregroundColor(AppTheme.accent)
                    }
                    
                    Section("Profile") {
                        HStack {
                            Text("Height (cm)")
                            Spacer()
                            TextField("175", value: Binding(
                                get: { profile.heightCm },
                                set: { profile.heightCm = $0 }
                            ), format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        }
                        
                        HStack {
                            Text("Weight (kg)")
                            Spacer()
                            TextField("70", value: Binding(
                                get: { profile.currentWeightKg },
                                set: { profile.currentWeightKg = $0 }
                            ), format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        }
                        
                        DatePicker("Birth Date", selection: Binding(
                            get: { profile.birthDate },
                            set: { profile.birthDate = $0 }
                        ), displayedComponents: .date)
                        
                        Picker("Gender", selection: Binding(
                            get: { profile.gender },
                            set: { profile.gender = $0 }
                        )) {
                            Text("Male").tag("Male")
                            Text("Female").tag("Female")
                            Text("Other").tag("Other")
                        }
                        
                        Picker("Activity Level", selection: Binding(
                            get: { profile.activityLevel },
                            set: { profile.activityLevel = $0 }
                        )) {
                            Text("Sedentary").tag("Sedentary")
                            Text("Lightly Active").tag("Lightly Active")
                            Text("Moderately Active").tag("Moderately Active")
                            Text("Very Active").tag("Very Active")
                            Text("Extra Active").tag("Extra Active")
                        }
                    }
                    
                    Section("Units") {
                        Toggle("Use Metric Units", isOn: Binding(
                            get: { profile.useMetricUnits },
                            set: { profile.useMetricUnits = $0 }
                        ))
                    }
                } else {
                    Text("No Profile Found")
                }
                
                Section("Data") {
                    Button(role: .destructive) {
                        showingResetAlert = true
                    } label: {
                        Text("Clear All Data")
                    }
                }
                
                Section("About") {
                    HStack {
                        Text("App Version")
                        Spacer()
                        Text("1.0.0").foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Settings")
            .alert("Clear All Data?", isPresented: $showingResetAlert) {
                Button("Cancel", role: .cancel) { }
                Button("Clear", role: .destructive) {
                    clearData()
                }
            } message: {
                Text("This will permanently delete all your logged meals and custom foods. This cannot be undone.")
            }
        }
    }
    
    private func calculateAge(birthDate: Date) -> Int {
        Calendar.current.dateComponents([.year], from: birthDate, to: Date()).year ?? 25
    }
    
    private func clearData() {
        try? modelContext.delete(model: DailyLog.self)
        try? modelContext.delete(model: FoodItem.self)
        try? modelContext.save()
    }
}

struct GoalStepper: View {
    let title: String
    @Binding var value: Double
    let step: Double
    let suffix: String
    
    var body: some View {
        Stepper(value: $value, in: 0...10000, step: step) {
            HStack {
                Text(title)
                Spacer()
                Text("\(Int(value)) \(suffix)")
                    .foregroundColor(.secondary)
            }
        }
    }
}
