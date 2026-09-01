import Foundation
import SwiftData
import Observation

@Observable
@MainActor
class FoodRepository {
    private let usdaService = USDAService()
    private let offService = OpenFoodFactsService()
    
    func searchFood(query: String, context: ModelContext) async -> [FoodItem] {
        // 1. Search locally in SwiftData
        let localDescriptor = FetchDescriptor<FoodItem>(predicate: #Predicate {
            $0.name.localizedStandardContains(query)
        })
        
        var results = (try? context.fetch(localDescriptor)) ?? []
        
        // 2. If short on local results, query USDA
        if results.count < 5 {
            do {
                let usdaResponse = try await usdaService.searchFoods(query: query)
                let newItems = usdaResponse.foods.compactMap { usdaFood -> FoodItem? in
                    let item = FoodItem(
                        name: usdaFood.description,
                        brand: usdaFood.brandOwner,
                        fdcId: String(usdaFood.fdcId),
                        caloriesPer100g: usdaFood.calories,
                        proteinPer100g: usdaFood.protein,
                        carbsPer100g: usdaFood.carbs,
                        fatPer100g: usdaFood.fat,
                        fiberPer100g: usdaFood.fiber,
                        vitaminAPer100g: usdaFood.vitaminA,
                        vitaminCPer100g: usdaFood.vitaminC,
                        vitaminDPer100g: usdaFood.vitaminD,
                        vitaminEPer100g: usdaFood.vitaminE,
                        vitaminKPer100g: usdaFood.vitaminK,
                        vitaminB1Per100g: usdaFood.vitaminB1,
                        vitaminB2Per100g: usdaFood.vitaminB2,
                        vitaminB3Per100g: usdaFood.vitaminB3,
                        vitaminB5Per100g: usdaFood.vitaminB5,
                        vitaminB6Per100g: usdaFood.vitaminB6,
                        vitaminB7Per100g: usdaFood.vitaminB7,
                        vitaminB9Per100g: usdaFood.vitaminB9,
                        vitaminB12Per100g: usdaFood.vitaminB12,
                        calciumPer100g: usdaFood.calcium,
                        ironPer100g: usdaFood.iron,
                        magnesiumPer100g: usdaFood.magnesium,
                        zincPer100g: usdaFood.zinc,
                        potassiumPer100g: usdaFood.potassium,
                        sodiumPer100g: usdaFood.sodium,
                        phosphorusPer100g: usdaFood.phosphorus,
                        seleniumPer100g: usdaFood.selenium,
                        copperPer100g: usdaFood.copper,
                        manganesePer100g: usdaFood.manganese,
                        omega3Per100g: usdaFood.omega3
                    )
                    
                    let servingOption = ServingOption(unitName: "g", gramWeight: 1.0)
                    item.servingOptions.append(servingOption)
                    
                    if let portions = usdaFood.foodPortions {
                        for portion in portions {
                            if let modifier = portion.modifier {
                                let portionOpt = ServingOption(unitName: modifier, gramWeight: portion.gramWeight)
                                item.servingOptions.append(portionOpt)
                            }
                        }
                    }
                    
                    return item
                }
                
                for item in newItems {
                    context.insert(item)
                    results.append(item)
                }
                try? context.save()
            } catch {
                // Network error — return local results only
            }
        }
        
        return results
    }
    
    func lookupBarcode(code: String, context: ModelContext) async -> FoodItem? {
        // 1. Check local
        let descriptor = FetchDescriptor<FoodItem>(predicate: #Predicate { $0.barcode == code })
        if let local = try? context.fetch(descriptor).first {
            return local
        }
        
        // 2. Check OpenFoodFacts
        do {
            if let product = try await offService.fetchProduct(barcode: code) {
                let item = FoodItem(
                    name: product.productName ?? "Unknown Product",
                    brand: product.brands,
                    barcode: code,
                    caloriesPer100g: product.nutriments?.energyKcal100g ?? 0,
                    proteinPer100g: product.nutriments?.proteins100g ?? 0,
                    carbsPer100g: product.nutriments?.carbohydrates100g ?? 0,
                    fatPer100g: product.nutriments?.fat100g ?? 0,
                    fiberPer100g: product.nutriments?.fiber100g
                )
                
                let servingOption = ServingOption(unitName: "g", gramWeight: 1.0)
                item.servingOptions.append(servingOption)
                
                if let servingSize = product.servingQuantity, servingSize > 0 {
                    let servingOpt = ServingOption(unitName: product.servingSize ?? "serving", gramWeight: servingSize)
                    item.servingOptions.append(servingOpt)
                }
                
                context.insert(item)
                try? context.save()
                return item
            }
        } catch {
            // Network error
        }
        
        return nil
    }
    
    func getOrCreateDailyLog(for date: Date, user: UserProfile, context: ModelContext) -> DailyLog {
        let startOfDay = Calendar.current.startOfDay(for: date)
        let descriptor = FetchDescriptor<DailyLog>(predicate: #Predicate {
            $0.date == startOfDay
        })
        
        if let existing = try? context.fetch(descriptor).first(where: { $0.user?.id == user.id }) {
            return existing
        }
        
        let newLog = DailyLog(date: startOfDay)
        newLog.user = user
        
        let breakfast = MealLog(mealType: .breakfast)
        let lunch = MealLog(mealType: .lunch)
        let dinner = MealLog(mealType: .dinner)
        let snacks = MealLog(mealType: .snacks)
        
        newLog.meals = [breakfast, lunch, dinner, snacks]
        
        context.insert(newLog)
        try? context.save()
        
        return newLog
    }
    
    func logFood(foodItem: FoodItem, servingAmount: Double, servingUnit: String, gramWeight: Double, to mealLog: MealLog, context: ModelContext) {
        let entry = FoodEntry(
            servingAmount: servingAmount,
            unitName: servingUnit,
            gramWeight: gramWeight,
            foodItem: foodItem
        )
        entry.mealLog = mealLog
        mealLog.entries.append(entry)
        try? context.save()
    }
    
    func quickAdd(calories: Double, protein: Double, carbs: Double, fat: Double, to mealLog: MealLog, context: ModelContext) {
        let entry = FoodEntry(
            isQuickAdd: true,
            quickAddCalories: calories,
            quickAddProtein: protein,
            quickAddCarbs: carbs,
            quickAddFat: fat
        )
        entry.mealLog = mealLog
        mealLog.entries.append(entry)
        try? context.save()
    }
    
    func deleteFoodEntry(_ entry: FoodEntry, context: ModelContext) {
        if let mealLog = entry.mealLog {
            mealLog.entries.removeAll(where: { $0.id == entry.id })
        }
        context.delete(entry)
        try? context.save()
    }
}
