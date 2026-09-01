import Foundation
import SwiftData

enum MealType: String, Codable, CaseIterable, Hashable {
    case breakfast = "Breakfast"
    case lunch = "Lunch"
    case dinner = "Dinner"
    case snacks = "Snacks"
}

@Model
final class MealLog {
    @Attribute(.unique) var id: UUID
    var mealTypeRawValue: String
    
    var mealType: MealType {
        get { MealType(rawValue: mealTypeRawValue) ?? .snacks }
        set { mealTypeRawValue = newValue.rawValue }
    }
    
    var dailyLog: DailyLog?
    
    @Relationship(deleteRule: .cascade, inverse: \FoodEntry.mealLog)
    var entries: [FoodEntry] = []
    
    var totalCalories: Double {
        entries.reduce(0) { $0 + $1.calories }
    }
    var totalProtein: Double {
        entries.reduce(0) { $0 + $1.protein }
    }
    var totalCarbs: Double {
        entries.reduce(0) { $0 + $1.carbs }
    }
    var totalFat: Double {
        entries.reduce(0) { $0 + $1.fat }
    }
    
    var totalVitaminA: Double { entries.reduce(0) { $0 + $1.vitaminA } }
    var totalVitaminC: Double { entries.reduce(0) { $0 + $1.vitaminC } }
    var totalVitaminD: Double { entries.reduce(0) { $0 + $1.vitaminD } }
    var totalVitaminE: Double { entries.reduce(0) { $0 + $1.vitaminE } }
    var totalVitaminK: Double { entries.reduce(0) { $0 + $1.vitaminK } }
    var totalVitaminB1: Double { entries.reduce(0) { $0 + $1.vitaminB1 } }
    var totalVitaminB2: Double { entries.reduce(0) { $0 + $1.vitaminB2 } }
    var totalVitaminB3: Double { entries.reduce(0) { $0 + $1.vitaminB3 } }
    var totalVitaminB5: Double { entries.reduce(0) { $0 + $1.vitaminB5 } }
    var totalVitaminB6: Double { entries.reduce(0) { $0 + $1.vitaminB6 } }
    var totalVitaminB7: Double { entries.reduce(0) { $0 + $1.vitaminB7 } }
    var totalVitaminB9: Double { entries.reduce(0) { $0 + $1.vitaminB9 } }
    var totalVitaminB12: Double { entries.reduce(0) { $0 + $1.vitaminB12 } }
    var totalCalcium: Double { entries.reduce(0) { $0 + $1.calcium } }
    var totalIron: Double { entries.reduce(0) { $0 + $1.iron } }
    var totalMagnesium: Double { entries.reduce(0) { $0 + $1.magnesium } }
    var totalZinc: Double { entries.reduce(0) { $0 + $1.zinc } }
    var totalPotassium: Double { entries.reduce(0) { $0 + $1.potassium } }
    var totalSodium: Double { entries.reduce(0) { $0 + $1.sodium } }
    var totalPhosphorus: Double { entries.reduce(0) { $0 + $1.phosphorus } }
    var totalSelenium: Double { entries.reduce(0) { $0 + $1.selenium } }
    var totalCopper: Double { entries.reduce(0) { $0 + $1.copper } }
    var totalManganese: Double { entries.reduce(0) { $0 + $1.manganese } }
    var totalOmega3: Double { entries.reduce(0) { $0 + $1.omega3 } }
    
    init(id: UUID = UUID(), mealType: MealType) {
        self.id = id
        self.mealTypeRawValue = mealType.rawValue
    }
}
