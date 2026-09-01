import Foundation

// MARK: - Micronutrient Enum

enum Micronutrient: String, CaseIterable, Identifiable {
    // Vitamins
    case vitaminA, vitaminC, vitaminD, vitaminE, vitaminK
    case vitaminB1, vitaminB2, vitaminB3, vitaminB5, vitaminB6
    case vitaminB7, vitaminB9, vitaminB12
    // Minerals
    case calcium, iron, magnesium, zinc, potassium
    case sodium, phosphorus, selenium, copper, manganese
    // Fatty Acids
    case omega3
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .vitaminA: return "Vitamin A"
        case .vitaminC: return "Vitamin C"
        case .vitaminD: return "Vitamin D"
        case .vitaminE: return "Vitamin E"
        case .vitaminK: return "Vitamin K"
        case .vitaminB1: return "B1 (Thiamin)"
        case .vitaminB2: return "B2 (Riboflavin)"
        case .vitaminB3: return "B3 (Niacin)"
        case .vitaminB5: return "B5 (Pantothenic)"
        case .vitaminB6: return "Vitamin B6"
        case .vitaminB7: return "B7 (Biotin)"
        case .vitaminB9: return "B9 (Folate)"
        case .vitaminB12: return "Vitamin B12"
        case .calcium: return "Calcium"
        case .iron: return "Iron"
        case .magnesium: return "Magnesium"
        case .zinc: return "Zinc"
        case .potassium: return "Potassium"
        case .sodium: return "Sodium"
        case .phosphorus: return "Phosphorus"
        case .selenium: return "Selenium"
        case .copper: return "Copper"
        case .manganese: return "Manganese"
        case .omega3: return "Omega-3 (EPA+DHA)"
        }
    }
    
    var icon: String {
        switch category {
        case .vitamins: return "pill.fill"
        case .minerals: return "atom"
        case .fattyAcids: return "drop.fill"
        }
    }
    
    var unit: String {
        switch self {
        case .vitaminA, .vitaminD, .vitaminK, .vitaminB7, .vitaminB9, .vitaminB12, .selenium:
            return "µg"
        case .vitaminC, .vitaminE, .vitaminB1, .vitaminB2, .vitaminB3, .vitaminB5, .vitaminB6,
             .calcium, .iron, .magnesium, .zinc, .potassium, .sodium, .phosphorus, .copper, .manganese:
            return "mg"
        case .omega3:
            return "g"
        }
    }
    
    var category: NutrientCategory {
        switch self {
        case .vitaminA, .vitaminC, .vitaminD, .vitaminE, .vitaminK,
             .vitaminB1, .vitaminB2, .vitaminB3, .vitaminB5, .vitaminB6,
             .vitaminB7, .vitaminB9, .vitaminB12:
            return .vitamins
        case .calcium, .iron, .magnesium, .zinc, .potassium,
             .sodium, .phosphorus, .selenium, .copper, .manganese:
            return .minerals
        case .omega3:
            return .fattyAcids
        }
    }
    
    var usdaNutrientId: Int {
        switch self {
        case .vitaminA: return 1106
        case .vitaminC: return 1162
        case .vitaminD: return 1110
        case .vitaminE: return 1109
        case .vitaminK: return 1185
        case .vitaminB1: return 1165
        case .vitaminB2: return 1166
        case .vitaminB3: return 1167
        case .vitaminB5: return 1170
        case .vitaminB6: return 1175
        case .vitaminB7: return 1176
        case .vitaminB9: return 1177
        case .vitaminB12: return 1178
        case .calcium: return 1087
        case .iron: return 1089
        case .magnesium: return 1090
        case .zinc: return 1095
        case .potassium: return 1092
        case .sodium: return 1093
        case .phosphorus: return 1091
        case .selenium: return 1103
        case .copper: return 1098
        case .manganese: return 1101
        case .omega3: return 1278
        }
    }
    
    func rda(gender: String, age: Int) -> Double {
        let isMale = gender.lowercased() == "male"
        switch self {
        case .vitaminA: return isMale ? 900 : 700
        case .vitaminC: return isMale ? 90 : 75
        case .vitaminD: return age > 50 ? 20 : 15
        case .vitaminE: return 15
        case .vitaminK: return isMale ? 120 : 90
        case .vitaminB1: return isMale ? 1.2 : 1.1
        case .vitaminB2: return isMale ? 1.3 : 1.1
        case .vitaminB3: return isMale ? 16 : 14
        case .vitaminB5: return 5
        case .vitaminB6: return age > 50 ? (isMale ? 1.7 : 1.5) : 1.3
        case .vitaminB7: return 30
        case .vitaminB9: return 400
        case .vitaminB12: return 2.4
        case .calcium: return (age > 50 && !isMale) ? 1200 : 1000
        case .iron: return isMale ? 8 : (age > 50 ? 8 : 18)
        case .magnesium: return isMale ? 420 : 320
        case .zinc: return isMale ? 11 : 8
        case .potassium: return isMale ? 3400 : 2600
        case .sodium: return 2300
        case .phosphorus: return 700
        case .selenium: return 55
        case .copper: return 0.9
        case .manganese: return isMale ? 2.3 : 1.8
        case .omega3: return 0.25
        }
    }
}

// MARK: - Supporting Types

enum NutrientCategory: String, CaseIterable {
    case vitamins = "Vitamins"
    case minerals = "Minerals"
    case fattyAcids = "Fatty Acids"
}

enum DeficiencyLevel: String {
    case adequate
    case low
    case deficient
    case excess
}

struct MicronutrientStatus: Identifiable {
    let id = UUID()
    let nutrient: Micronutrient
    let currentIntake: Double
    let rdaTarget: Double
    
    var percentage: Double {
        rdaTarget > 0 ? (currentIntake / rdaTarget) * 100 : 0
    }
    
    var level: DeficiencyLevel {
        if nutrient == .sodium && currentIntake > rdaTarget {
            return .excess
        }
        let pct = percentage
        if pct >= 80 { return .adequate }
        else if pct >= 50 { return .low }
        else { return .deficient }
    }
}

struct FoodSuggestion: Identifiable {
    let id = UUID()
    let foodName: String
    let servingDescription: String
    let nutrientAmount: Double
    let percentRDA: Int
}

// MARK: - Analyzer

struct MicronutrientAnalyzer {
    
    /// Analyze micronutrient intake from a DailyLog (SwiftData model)
    static func analyze(dailyLog: DailyLog, gender: String, age: Int) -> [MicronutrientStatus] {
        // Sum micronutrients from all meals → entries
        var statuses: [MicronutrientStatus] = []
        
        for nutrient in Micronutrient.allCases {
            let intake = intakeFor(nutrient: nutrient, from: dailyLog)
            let target = nutrient.rda(gender: gender, age: age)
            statuses.append(MicronutrientStatus(nutrient: nutrient, currentIntake: intake, rdaTarget: target))
        }
        
        return statuses
    }
    
    /// Extract total intake of a specific micronutrient from DailyLog
    private static func intakeFor(nutrient: Micronutrient, from dailyLog: DailyLog) -> Double {
        switch nutrient {
        case .vitaminA: return dailyLog.totalVitaminA
        case .vitaminC: return dailyLog.totalVitaminC
        case .vitaminD: return dailyLog.totalVitaminD
        case .vitaminE: return dailyLog.totalVitaminE
        case .vitaminK: return dailyLog.totalVitaminK
        case .vitaminB1: return dailyLog.totalVitaminB1
        case .vitaminB2: return dailyLog.totalVitaminB2
        case .vitaminB3: return dailyLog.totalVitaminB3
        case .vitaminB5: return dailyLog.totalVitaminB5
        case .vitaminB6: return dailyLog.totalVitaminB6
        case .vitaminB7: return dailyLog.totalVitaminB7
        case .vitaminB9: return dailyLog.totalVitaminB9
        case .vitaminB12: return dailyLog.totalVitaminB12
        case .calcium: return dailyLog.totalCalcium
        case .iron: return dailyLog.totalIron
        case .magnesium: return dailyLog.totalMagnesium
        case .zinc: return dailyLog.totalZinc
        case .potassium: return dailyLog.totalPotassium
        case .sodium: return dailyLog.totalSodium
        case .phosphorus: return dailyLog.totalPhosphorus
        case .selenium: return dailyLog.totalSelenium
        case .copper: return dailyLog.totalCopper
        case .manganese: return dailyLog.totalManganese
        case .omega3: return dailyLog.totalOmega3
        }
    }
    
    static func summary(statuses: [MicronutrientStatus]) -> (adequate: Int, low: Int, deficient: Int) {
        var adequate = 0, low = 0, deficient = 0
        for status in statuses {
            switch status.level {
            case .adequate, .excess: adequate += 1
            case .low: low += 1
            case .deficient: deficient += 1
            }
        }
        return (adequate, low, deficient)
    }
    
    // MARK: - Food Suggestions Database
    
    static func suggestFoods(for nutrient: Micronutrient) -> [FoodSuggestion] {
        switch nutrient {
        case .vitaminA:
            return [
                FoodSuggestion(foodName: "Beef Liver", servingDescription: "3 oz cooked", nutrientAmount: 6500, percentRDA: 720),
                FoodSuggestion(foodName: "Sweet Potato", servingDescription: "1 medium baked", nutrientAmount: 1100, percentRDA: 122),
                FoodSuggestion(foodName: "Spinach", servingDescription: "1 cup cooked", nutrientAmount: 940, percentRDA: 104),
                FoodSuggestion(foodName: "Carrots", servingDescription: "1 cup chopped", nutrientAmount: 1060, percentRDA: 118),
            ]
        case .vitaminC:
            return [
                FoodSuggestion(foodName: "Red Bell Pepper", servingDescription: "1 cup sliced", nutrientAmount: 190, percentRDA: 210),
                FoodSuggestion(foodName: "Guava", servingDescription: "1 fruit", nutrientAmount: 125, percentRDA: 140),
                FoodSuggestion(foodName: "Kiwi", servingDescription: "2 medium", nutrientAmount: 135, percentRDA: 150),
                FoodSuggestion(foodName: "Broccoli", servingDescription: "1 cup cooked", nutrientAmount: 100, percentRDA: 110),
                FoodSuggestion(foodName: "Strawberries", servingDescription: "1 cup sliced", nutrientAmount: 90, percentRDA: 100),
            ]
        case .vitaminD:
            return [
                FoodSuggestion(foodName: "Wild Salmon", servingDescription: "3 oz cooked", nutrientAmount: 14.2, percentRDA: 95),
                FoodSuggestion(foodName: "Cod Liver Oil", servingDescription: "1 tsp", nutrientAmount: 11.3, percentRDA: 75),
                FoodSuggestion(foodName: "UV Mushrooms", servingDescription: "½ cup", nutrientAmount: 9.0, percentRDA: 60),
                FoodSuggestion(foodName: "Fortified Milk", servingDescription: "1 cup", nutrientAmount: 3.0, percentRDA: 20),
            ]
        case .vitaminE:
            return [
                FoodSuggestion(foodName: "Sunflower Seeds", servingDescription: "1 oz", nutrientAmount: 7.4, percentRDA: 50),
                FoodSuggestion(foodName: "Almonds", servingDescription: "1 oz (23 nuts)", nutrientAmount: 7.3, percentRDA: 49),
                FoodSuggestion(foodName: "Avocado", servingDescription: "1 whole", nutrientAmount: 4.2, percentRDA: 28),
                FoodSuggestion(foodName: "Spinach", servingDescription: "1 cup cooked", nutrientAmount: 3.7, percentRDA: 25),
            ]
        case .vitaminK:
            return [
                FoodSuggestion(foodName: "Kale", servingDescription: "1 cup cooked", nutrientAmount: 530, percentRDA: 440),
                FoodSuggestion(foodName: "Swiss Chard", servingDescription: "1 cup cooked", nutrientAmount: 570, percentRDA: 475),
                FoodSuggestion(foodName: "Brussels Sprouts", servingDescription: "1 cup", nutrientAmount: 160, percentRDA: 130),
                FoodSuggestion(foodName: "Broccoli", servingDescription: "1 cup", nutrientAmount: 110, percentRDA: 90),
            ]
        case .vitaminB1:
            return [
                FoodSuggestion(foodName: "Pork Chops", servingDescription: "3 oz lean", nutrientAmount: 0.8, percentRDA: 67),
                FoodSuggestion(foodName: "Sunflower Seeds", servingDescription: "1 oz", nutrientAmount: 0.4, percentRDA: 33),
                FoodSuggestion(foodName: "Black Beans", servingDescription: "1 cup cooked", nutrientAmount: 0.4, percentRDA: 33),
                FoodSuggestion(foodName: "Oatmeal", servingDescription: "1 cup cooked", nutrientAmount: 0.5, percentRDA: 42),
            ]
        case .vitaminB2:
            return [
                FoodSuggestion(foodName: "Beef Liver", servingDescription: "3 oz", nutrientAmount: 3.0, percentRDA: 230),
                FoodSuggestion(foodName: "Greek Yogurt", servingDescription: "1 cup", nutrientAmount: 0.6, percentRDA: 46),
                FoodSuggestion(foodName: "Eggs", servingDescription: "2 large", nutrientAmount: 0.5, percentRDA: 38),
                FoodSuggestion(foodName: "Mushrooms", servingDescription: "1 cup sliced", nutrientAmount: 0.4, percentRDA: 31),
            ]
        case .vitaminB3:
            return [
                FoodSuggestion(foodName: "Chicken Breast", servingDescription: "3 oz grilled", nutrientAmount: 10.3, percentRDA: 65),
                FoodSuggestion(foodName: "Tuna", servingDescription: "3 oz canned", nutrientAmount: 8.6, percentRDA: 54),
                FoodSuggestion(foodName: "Turkey Breast", servingDescription: "3 oz", nutrientAmount: 8.5, percentRDA: 53),
                FoodSuggestion(foodName: "Salmon", servingDescription: "3 oz", nutrientAmount: 7.4, percentRDA: 46),
            ]
        case .vitaminB5:
            return [
                FoodSuggestion(foodName: "Chicken Liver", servingDescription: "3 oz", nutrientAmount: 6.0, percentRDA: 120),
                FoodSuggestion(foodName: "Shiitake Mushrooms", servingDescription: "1 cup cooked", nutrientAmount: 5.2, percentRDA: 104),
                FoodSuggestion(foodName: "Avocado", servingDescription: "1 whole", nutrientAmount: 2.0, percentRDA: 40),
                FoodSuggestion(foodName: "Sunflower Seeds", servingDescription: "1 oz", nutrientAmount: 2.0, percentRDA: 40),
            ]
        case .vitaminB6:
            return [
                FoodSuggestion(foodName: "Chickpeas", servingDescription: "1 cup canned", nutrientAmount: 1.1, percentRDA: 65),
                FoodSuggestion(foodName: "Yellowfin Tuna", servingDescription: "3 oz", nutrientAmount: 0.9, percentRDA: 53),
                FoodSuggestion(foodName: "Chicken Breast", servingDescription: "3 oz", nutrientAmount: 0.5, percentRDA: 30),
                FoodSuggestion(foodName: "Banana", servingDescription: "1 medium", nutrientAmount: 0.4, percentRDA: 25),
            ]
        case .vitaminB7:
            return [
                FoodSuggestion(foodName: "Eggs", servingDescription: "1 cooked", nutrientAmount: 10, percentRDA: 33),
                FoodSuggestion(foodName: "Salmon", servingDescription: "3 oz", nutrientAmount: 5, percentRDA: 17),
                FoodSuggestion(foodName: "Sweet Potato", servingDescription: "½ cup cooked", nutrientAmount: 2.4, percentRDA: 8),
                FoodSuggestion(foodName: "Almonds", servingDescription: "1 oz", nutrientAmount: 1.5, percentRDA: 5),
            ]
        case .vitaminB9:
            return [
                FoodSuggestion(foodName: "Lentils", servingDescription: "1 cup cooked", nutrientAmount: 360, percentRDA: 90),
                FoodSuggestion(foodName: "Spinach", servingDescription: "1 cup cooked", nutrientAmount: 260, percentRDA: 65),
                FoodSuggestion(foodName: "Asparagus", servingDescription: "1 cup cooked", nutrientAmount: 270, percentRDA: 68),
                FoodSuggestion(foodName: "Black Beans", servingDescription: "1 cup", nutrientAmount: 250, percentRDA: 63),
            ]
        case .vitaminB12:
            return [
                FoodSuggestion(foodName: "Clams", servingDescription: "3 oz cooked", nutrientAmount: 84, percentRDA: 3500),
                FoodSuggestion(foodName: "Beef Liver", servingDescription: "3 oz", nutrientAmount: 70, percentRDA: 2900),
                FoodSuggestion(foodName: "Salmon", servingDescription: "3 oz", nutrientAmount: 4.8, percentRDA: 200),
                FoodSuggestion(foodName: "Ground Beef", servingDescription: "3 oz 90/10", nutrientAmount: 2.2, percentRDA: 92),
            ]
        case .calcium:
            return [
                FoodSuggestion(foodName: "Tofu (calcium set)", servingDescription: "½ cup firm", nutrientAmount: 430, percentRDA: 43),
                FoodSuggestion(foodName: "Greek Yogurt", servingDescription: "1 cup", nutrientAmount: 415, percentRDA: 42),
                FoodSuggestion(foodName: "Sardines", servingDescription: "3 oz canned", nutrientAmount: 325, percentRDA: 33),
                FoodSuggestion(foodName: "Cheddar Cheese", servingDescription: "1.5 oz", nutrientAmount: 300, percentRDA: 30),
            ]
        case .iron:
            return [
                FoodSuggestion(foodName: "Oysters", servingDescription: "3 oz cooked", nutrientAmount: 8.0, percentRDA: 100),
                FoodSuggestion(foodName: "Lentils", servingDescription: "1 cup cooked", nutrientAmount: 6.6, percentRDA: 82),
                FoodSuggestion(foodName: "Spinach", servingDescription: "1 cup cooked", nutrientAmount: 6.4, percentRDA: 80),
                FoodSuggestion(foodName: "Dark Chocolate", servingDescription: "1 oz (85%)", nutrientAmount: 3.4, percentRDA: 42),
            ]
        case .magnesium:
            return [
                FoodSuggestion(foodName: "Pumpkin Seeds", servingDescription: "1 oz", nutrientAmount: 156, percentRDA: 37),
                FoodSuggestion(foodName: "Spinach", servingDescription: "1 cup cooked", nutrientAmount: 157, percentRDA: 38),
                FoodSuggestion(foodName: "Chia Seeds", servingDescription: "1 oz", nutrientAmount: 111, percentRDA: 26),
                FoodSuggestion(foodName: "Black Beans", servingDescription: "1 cup cooked", nutrientAmount: 120, percentRDA: 30),
            ]
        case .zinc:
            return [
                FoodSuggestion(foodName: "Oysters", servingDescription: "3 oz cooked", nutrientAmount: 50, percentRDA: 450),
                FoodSuggestion(foodName: "Beef Steak", servingDescription: "3 oz", nutrientAmount: 7.0, percentRDA: 64),
                FoodSuggestion(foodName: "Crab", servingDescription: "3 oz", nutrientAmount: 3.5, percentRDA: 32),
                FoodSuggestion(foodName: "Pumpkin Seeds", servingDescription: "1 oz", nutrientAmount: 2.2, percentRDA: 20),
            ]
        case .potassium:
            return [
                FoodSuggestion(foodName: "White Beans", servingDescription: "1 cup cooked", nutrientAmount: 1000, percentRDA: 30),
                FoodSuggestion(foodName: "Baked Potato", servingDescription: "1 medium w/ skin", nutrientAmount: 925, percentRDA: 27),
                FoodSuggestion(foodName: "Avocado", servingDescription: "1 whole", nutrientAmount: 700, percentRDA: 21),
                FoodSuggestion(foodName: "Banana", servingDescription: "1 large", nutrientAmount: 450, percentRDA: 13),
            ]
        case .sodium:
            return [
                FoodSuggestion(foodName: "Celery", servingDescription: "Natural source", nutrientAmount: 80, percentRDA: 3),
                FoodSuggestion(foodName: "Eggs", servingDescription: "2 large", nutrientAmount: 140, percentRDA: 6),
                FoodSuggestion(foodName: "Milk", servingDescription: "1 cup", nutrientAmount: 105, percentRDA: 5),
            ]
        case .phosphorus:
            return [
                FoodSuggestion(foodName: "Lentils", servingDescription: "1 cup", nutrientAmount: 350, percentRDA: 50),
                FoodSuggestion(foodName: "Pumpkin Seeds", servingDescription: "1 oz", nutrientAmount: 330, percentRDA: 47),
                FoodSuggestion(foodName: "Greek Yogurt", servingDescription: "1 cup", nutrientAmount: 300, percentRDA: 43),
                FoodSuggestion(foodName: "Salmon", servingDescription: "3 oz", nutrientAmount: 250, percentRDA: 36),
            ]
        case .selenium:
            return [
                FoodSuggestion(foodName: "Brazil Nuts", servingDescription: "1 nut (5g)", nutrientAmount: 95, percentRDA: 170),
                FoodSuggestion(foodName: "Yellowfin Tuna", servingDescription: "3 oz", nutrientAmount: 92, percentRDA: 167),
                FoodSuggestion(foodName: "Halibut", servingDescription: "3 oz", nutrientAmount: 45, percentRDA: 82),
                FoodSuggestion(foodName: "Eggs", servingDescription: "2 large", nutrientAmount: 30, percentRDA: 55),
            ]
        case .copper:
            return [
                FoodSuggestion(foodName: "Oysters", servingDescription: "3 oz", nutrientAmount: 4.4, percentRDA: 490),
                FoodSuggestion(foodName: "Cashews", servingDescription: "1 oz", nutrientAmount: 0.63, percentRDA: 70),
                FoodSuggestion(foodName: "Dark Chocolate", servingDescription: "1 oz (85%)", nutrientAmount: 0.5, percentRDA: 55),
                FoodSuggestion(foodName: "Sunflower Seeds", servingDescription: "1 oz", nutrientAmount: 0.52, percentRDA: 58),
            ]
        case .manganese:
            return [
                FoodSuggestion(foodName: "Mussels", servingDescription: "3 oz cooked", nutrientAmount: 5.8, percentRDA: 250),
                FoodSuggestion(foodName: "Brown Rice", servingDescription: "1 cup cooked", nutrientAmount: 1.8, percentRDA: 78),
                FoodSuggestion(foodName: "Spinach", servingDescription: "1 cup cooked", nutrientAmount: 1.7, percentRDA: 74),
                FoodSuggestion(foodName: "Hazelnuts", servingDescription: "1 oz", nutrientAmount: 1.6, percentRDA: 70),
            ]
        case .omega3:
            return [
                FoodSuggestion(foodName: "Atlantic Mackerel", servingDescription: "3 oz", nutrientAmount: 2.1, percentRDA: 840),
                FoodSuggestion(foodName: "Wild Salmon", servingDescription: "3 oz", nutrientAmount: 1.95, percentRDA: 780),
                FoodSuggestion(foodName: "Sardines", servingDescription: "1 can (3.75 oz)", nutrientAmount: 1.2, percentRDA: 480),
                FoodSuggestion(foodName: "Anchovies", servingDescription: "2 oz", nutrientAmount: 0.9, percentRDA: 360),
            ]
        }
    }
}
