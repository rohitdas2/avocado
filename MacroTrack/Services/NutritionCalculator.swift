import Foundation

enum MacroSplit {
    case balanced
    case highProtein
    case lowCarb
}

struct NutritionCalculator {
    // Mifflin-St Jeor formula
    static func calculateBMR(weightKg: Double, heightCm: Double, age: Int, gender: String) -> Double {
        let base = (10 * weightKg) + (6.25 * heightCm) - (5 * Double(age))
        return gender.lowercased() == "female" ? base - 161 : base + 5
    }
    
    static func activityMultiplier(level: String) -> Double {
        switch level.lowercased() {
        case "sedentary": return 1.2
        case "light": return 1.375
        case "moderate": return 1.55
        case "active": return 1.725
        case "veryactive": return 1.9
        default: return 1.2
        }
    }
    
    static func calculateTDEE(bmr: Double, activityLevel: String) -> Double {
        return bmr * activityMultiplier(level: activityLevel)
    }
    
    static func suggestMacros(tdee: Double, split: MacroSplit = .balanced) -> (protein: Double, carbs: Double, fat: Double) {
        let proteinRatio: Double
        let fatRatio: Double
        let carbsRatio: Double
        
        switch split {
        case .balanced:
            proteinRatio = 0.30
            fatRatio = 0.30
            carbsRatio = 0.40
        case .highProtein:
            proteinRatio = 0.40
            fatRatio = 0.30
            carbsRatio = 0.30
        case .lowCarb:
            proteinRatio = 0.35
            fatRatio = 0.45
            carbsRatio = 0.20
        }
        
        // 4 kcal/g for protein and carbs, 9 kcal/g for fat
        let proteinGrams = (tdee * proteinRatio) / 4.0
        let carbsGrams = (tdee * carbsRatio) / 4.0
        let fatGrams = (tdee * fatRatio) / 9.0
        
        return (protein: proteinGrams, carbs: carbsGrams, fat: fatGrams)
    }
}
