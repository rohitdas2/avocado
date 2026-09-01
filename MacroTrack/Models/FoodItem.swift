import Foundation
import SwiftData

@Model
final class FoodItem {
    @Attribute(.unique) var id: UUID
    var name: String
    var brand: String?
    var barcode: String?
    var fdcId: String? // USDA ID if applicable
    
    var caloriesPer100g: Double
    var proteinPer100g: Double
    var carbsPer100g: Double
    var fatPer100g: Double
    var fiberPer100g: Double?
    
    // Vitamins (per 100g)
    var vitaminAPer100g: Double?     // µg RAE
    var vitaminCPer100g: Double?     // mg
    var vitaminDPer100g: Double?     // µg
    var vitaminEPer100g: Double?     // mg
    var vitaminKPer100g: Double?     // µg
    var vitaminB1Per100g: Double?    // mg (Thiamin)
    var vitaminB2Per100g: Double?    // mg (Riboflavin)
    var vitaminB3Per100g: Double?    // mg (Niacin)
    var vitaminB5Per100g: Double?    // mg (Pantothenic acid)
    var vitaminB6Per100g: Double?    // mg
    var vitaminB7Per100g: Double?    // µg (Biotin)
    var vitaminB9Per100g: Double?    // µg (Folate)
    var vitaminB12Per100g: Double?   // µg
    
    // Minerals (per 100g)
    var calciumPer100g: Double?      // mg
    var ironPer100g: Double?         // mg
    var magnesiumPer100g: Double?    // mg
    var zincPer100g: Double?         // mg
    var potassiumPer100g: Double?    // mg
    var sodiumPer100g: Double?       // mg
    var phosphorusPer100g: Double?   // mg
    var seleniumPer100g: Double?     // µg
    var copperPer100g: Double?       // mg
    var manganesePer100g: Double?    // mg
    
    // Fatty Acids (per 100g)
    var omega3Per100g: Double?       // g (EPA + DHA)
    
    var isCustomFood: Bool
    
    @Relationship(deleteRule: .cascade, inverse: \ServingOption.foodItem)
    var servingOptions: [ServingOption] = []
    
    var defaultServingUnit: String
    var defaultServingAmount: Double
    
    init(
        id: UUID = UUID(),
        name: String,
        brand: String? = nil,
        barcode: String? = nil,
        fdcId: String? = nil,
        caloriesPer100g: Double = 0,
        proteinPer100g: Double = 0,
        carbsPer100g: Double = 0,
        fatPer100g: Double = 0,
        fiberPer100g: Double? = nil,
        vitaminAPer100g: Double? = nil,
        vitaminCPer100g: Double? = nil,
        vitaminDPer100g: Double? = nil,
        vitaminEPer100g: Double? = nil,
        vitaminKPer100g: Double? = nil,
        vitaminB1Per100g: Double? = nil,
        vitaminB2Per100g: Double? = nil,
        vitaminB3Per100g: Double? = nil,
        vitaminB5Per100g: Double? = nil,
        vitaminB6Per100g: Double? = nil,
        vitaminB7Per100g: Double? = nil,
        vitaminB9Per100g: Double? = nil,
        vitaminB12Per100g: Double? = nil,
        calciumPer100g: Double? = nil,
        ironPer100g: Double? = nil,
        magnesiumPer100g: Double? = nil,
        zincPer100g: Double? = nil,
        potassiumPer100g: Double? = nil,
        sodiumPer100g: Double? = nil,
        phosphorusPer100g: Double? = nil,
        seleniumPer100g: Double? = nil,
        copperPer100g: Double? = nil,
        manganesePer100g: Double? = nil,
        omega3Per100g: Double? = nil,
        isCustomFood: Bool = false,
        defaultServingUnit: String = "g",
        defaultServingAmount: Double = 100.0
    ) {
        self.id = id
        self.name = name
        self.brand = brand
        self.barcode = barcode
        self.fdcId = fdcId
        self.caloriesPer100g = caloriesPer100g
        self.proteinPer100g = proteinPer100g
        self.carbsPer100g = carbsPer100g
        self.fatPer100g = fatPer100g
        self.fiberPer100g = fiberPer100g
        self.vitaminAPer100g = vitaminAPer100g
        self.vitaminCPer100g = vitaminCPer100g
        self.vitaminDPer100g = vitaminDPer100g
        self.vitaminEPer100g = vitaminEPer100g
        self.vitaminKPer100g = vitaminKPer100g
        self.vitaminB1Per100g = vitaminB1Per100g
        self.vitaminB2Per100g = vitaminB2Per100g
        self.vitaminB3Per100g = vitaminB3Per100g
        self.vitaminB5Per100g = vitaminB5Per100g
        self.vitaminB6Per100g = vitaminB6Per100g
        self.vitaminB7Per100g = vitaminB7Per100g
        self.vitaminB9Per100g = vitaminB9Per100g
        self.vitaminB12Per100g = vitaminB12Per100g
        self.calciumPer100g = calciumPer100g
        self.ironPer100g = ironPer100g
        self.magnesiumPer100g = magnesiumPer100g
        self.zincPer100g = zincPer100g
        self.potassiumPer100g = potassiumPer100g
        self.sodiumPer100g = sodiumPer100g
        self.phosphorusPer100g = phosphorusPer100g
        self.seleniumPer100g = seleniumPer100g
        self.copperPer100g = copperPer100g
        self.manganesePer100g = manganesePer100g
        self.omega3Per100g = omega3Per100g
        self.isCustomFood = isCustomFood
        self.defaultServingUnit = defaultServingUnit
        self.defaultServingAmount = defaultServingAmount
    }
}
