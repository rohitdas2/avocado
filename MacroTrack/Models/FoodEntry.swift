import Foundation
import SwiftData

@Model
final class FoodEntry {
    @Attribute(.unique) var id: UUID
    var servingAmount: Double
    var unitName: String
    var gramWeight: Double // Total weight of this entry in grams
    var loggedAt: Date
    
    var mealLog: MealLog?
    
    // Linked item, if any
    var foodItem: FoodItem?
    
    // Quick Add Properties
    var isQuickAdd: Bool
    var quickAddCalories: Double
    var quickAddProtein: Double
    var quickAddCarbs: Double
    var quickAddFat: Double
    
    var calories: Double {
        if isQuickAdd { return quickAddCalories }
        guard let foodItem = foodItem else { return 0 }
        return (foodItem.caloriesPer100g / 100) * gramWeight
    }
    
    var protein: Double {
        if isQuickAdd { return quickAddProtein }
        guard let foodItem = foodItem else { return 0 }
        return (foodItem.proteinPer100g / 100) * gramWeight
    }
    
    var carbs: Double {
        if isQuickAdd { return quickAddCarbs }
        guard let foodItem = foodItem else { return 0 }
        return (foodItem.carbsPer100g / 100) * gramWeight
    }
    
    var fat: Double {
        if isQuickAdd { return quickAddFat }
        guard let foodItem = foodItem else { return 0 }
        return (foodItem.fatPer100g / 100) * gramWeight
    }
    
    var vitaminA: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminAPer100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminC: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminCPer100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminD: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminDPer100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminE: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminEPer100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminK: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminKPer100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB1: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB1Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB2: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB2Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB3: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB3Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB5: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB5Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB6: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB6Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB7: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB7Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB9: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB9Per100g ?? 0) / 100) * gramWeight
    }
    
    var vitaminB12: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.vitaminB12Per100g ?? 0) / 100) * gramWeight
    }
    
    var calcium: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.calciumPer100g ?? 0) / 100) * gramWeight
    }
    
    var iron: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.ironPer100g ?? 0) / 100) * gramWeight
    }
    
    var magnesium: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.magnesiumPer100g ?? 0) / 100) * gramWeight
    }
    
    var zinc: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.zincPer100g ?? 0) / 100) * gramWeight
    }
    
    var potassium: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.potassiumPer100g ?? 0) / 100) * gramWeight
    }
    
    var sodium: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.sodiumPer100g ?? 0) / 100) * gramWeight
    }
    
    var phosphorus: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.phosphorusPer100g ?? 0) / 100) * gramWeight
    }
    
    var selenium: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.seleniumPer100g ?? 0) / 100) * gramWeight
    }
    
    var copper: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.copperPer100g ?? 0) / 100) * gramWeight
    }
    
    var manganese: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.manganesePer100g ?? 0) / 100) * gramWeight
    }
    
    var omega3: Double {
        if isQuickAdd { return 0 }
        guard let foodItem = foodItem else { return 0 }
        return ((foodItem.omega3Per100g ?? 0) / 100) * gramWeight
    }
    
    init(
        id: UUID = UUID(),
        servingAmount: Double = 1.0,
        unitName: String = "serving",
        gramWeight: Double = 0.0,
        loggedAt: Date = Date(),
        foodItem: FoodItem? = nil,
        isQuickAdd: Bool = false,
        quickAddCalories: Double = 0,
        quickAddProtein: Double = 0,
        quickAddCarbs: Double = 0,
        quickAddFat: Double = 0
    ) {
        self.id = id
        self.servingAmount = servingAmount
        self.unitName = unitName
        self.gramWeight = gramWeight
        self.loggedAt = loggedAt
        self.foodItem = foodItem
        self.isQuickAdd = isQuickAdd
        self.quickAddCalories = quickAddCalories
        self.quickAddProtein = quickAddProtein
        self.quickAddCarbs = quickAddCarbs
        self.quickAddFat = quickAddFat
    }
}
