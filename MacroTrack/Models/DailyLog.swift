import Foundation
import SwiftData

@Model
final class DailyLog {
    @Attribute(.unique) var id: UUID
    var date: Date
    var waterIntakeMl: Double
    var morningWeightKg: Double?
    var notes: String?
    var stepCount: Double?
    
    var user: UserProfile?
    
    @Relationship(deleteRule: .cascade, inverse: \MealLog.dailyLog)
    var meals: [MealLog] = []
    
    var totalCalories: Double {
        meals.reduce(0) { $0 + $1.totalCalories }
    }
    var totalProtein: Double {
        meals.reduce(0) { $0 + $1.totalProtein }
    }
    var totalCarbs: Double {
        meals.reduce(0) { $0 + $1.totalCarbs }
    }
    var totalFat: Double {
        meals.reduce(0) { $0 + $1.totalFat }
    }
    
    var totalVitaminA: Double { meals.reduce(0) { $0 + $1.totalVitaminA } }
    var totalVitaminC: Double { meals.reduce(0) { $0 + $1.totalVitaminC } }
    var totalVitaminD: Double { meals.reduce(0) { $0 + $1.totalVitaminD } }
    var totalVitaminE: Double { meals.reduce(0) { $0 + $1.totalVitaminE } }
    var totalVitaminK: Double { meals.reduce(0) { $0 + $1.totalVitaminK } }
    var totalVitaminB1: Double { meals.reduce(0) { $0 + $1.totalVitaminB1 } }
    var totalVitaminB2: Double { meals.reduce(0) { $0 + $1.totalVitaminB2 } }
    var totalVitaminB3: Double { meals.reduce(0) { $0 + $1.totalVitaminB3 } }
    var totalVitaminB5: Double { meals.reduce(0) { $0 + $1.totalVitaminB5 } }
    var totalVitaminB6: Double { meals.reduce(0) { $0 + $1.totalVitaminB6 } }
    var totalVitaminB7: Double { meals.reduce(0) { $0 + $1.totalVitaminB7 } }
    var totalVitaminB9: Double { meals.reduce(0) { $0 + $1.totalVitaminB9 } }
    var totalVitaminB12: Double { meals.reduce(0) { $0 + $1.totalVitaminB12 } }
    var totalCalcium: Double { meals.reduce(0) { $0 + $1.totalCalcium } }
    var totalIron: Double { meals.reduce(0) { $0 + $1.totalIron } }
    var totalMagnesium: Double { meals.reduce(0) { $0 + $1.totalMagnesium } }
    var totalZinc: Double { meals.reduce(0) { $0 + $1.totalZinc } }
    var totalPotassium: Double { meals.reduce(0) { $0 + $1.totalPotassium } }
    var totalSodium: Double { meals.reduce(0) { $0 + $1.totalSodium } }
    var totalPhosphorus: Double { meals.reduce(0) { $0 + $1.totalPhosphorus } }
    var totalSelenium: Double { meals.reduce(0) { $0 + $1.totalSelenium } }
    var totalCopper: Double { meals.reduce(0) { $0 + $1.totalCopper } }
    var totalManganese: Double { meals.reduce(0) { $0 + $1.totalManganese } }
    var totalOmega3: Double { meals.reduce(0) { $0 + $1.totalOmega3 } }
    
    var remainingCalories: Double {
        guard let user = user else { return 0 }
        return user.targetCalories - totalCalories
    }
    
    init(id: UUID = UUID(), date: Date = Calendar.current.startOfDay(for: Date()), waterIntakeMl: Double = 0, morningWeightKg: Double? = nil, notes: String? = nil, stepCount: Double? = nil) {
        self.id = id
        self.date = Calendar.current.startOfDay(for: date)
        self.waterIntakeMl = waterIntakeMl
        self.morningWeightKg = morningWeightKg
        self.notes = notes
        self.stepCount = stepCount
    }
}
