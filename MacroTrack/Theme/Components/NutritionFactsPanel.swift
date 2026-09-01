import SwiftUI

public struct NutritionFactsPanel: View {
    public let calories: Double
    public let protein: Double
    public let carbs: Double
    public let fat: Double
    public let fiber: Double
    public let sodium: Double
    public let servingSize: String?
    
    public init(
        calories: Double,
        protein: Double,
        carbs: Double,
        fat: Double,
        fiber: Double = 0,
        sodium: Double = 0,
        servingSize: String? = nil
    ) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.fiber = fiber
        self.sodium = sodium
        self.servingSize = servingSize
    }
    
    private var dailyValueFat: Int { Int((fat / 78.0) * 100) }
    private var dailyValueCarbs: Int { Int((carbs / 275.0) * 100) }
    private var dailyValueProtein: Int { Int((protein / 50.0) * 100) }
    private var dailyValueFiber: Int { Int((fiber / 28.0) * 100) }
    private var dailyValueSodium: Int { Int((sodium / 2300.0) * 100) }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Nutrition Facts")
                .font(.system(size: 28, weight: .black))
                .foregroundColor(.white)
            
            if let serving = servingSize {
                Text("Serving Size \(serving)")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.8))
            }
            
            Divider().background(Color.white).frame(height: 8)
            
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading) {
                    Text("Amount Per Serving")
                        .font(.system(size: 12, weight: .bold))
                    Text("Calories")
                        .font(.system(size: 24, weight: .black))
                }
                Spacer()
                Text("\(Int(calories))")
                    .font(.system(size: 36, weight: .black))
            }
            .foregroundColor(.white)
            
            Divider().background(Color.white).frame(height: 4)
            
            HStack {
                Spacer()
                Text("% Daily Value*")
                    .font(.system(size: 12, weight: .bold))
            }
            .foregroundColor(.white)
            
            nutrientRow(label: "Total Fat", amount: "\(Int(fat))g", percent: dailyValueFat, isBold: true)
            nutrientRow(label: "Sodium", amount: "\(Int(sodium))mg", percent: dailyValueSodium, isBold: true)
            nutrientRow(label: "Total Carbohydrate", amount: "\(Int(carbs))g", percent: dailyValueCarbs, isBold: true)
            nutrientRow(label: "Dietary Fiber", amount: "\(Int(fiber))g", percent: dailyValueFiber, isBold: false, indent: true)
            nutrientRow(label: "Protein", amount: "\(Int(protein))g", percent: dailyValueProtein, isBold: true)
            
            Divider().background(Color.white).frame(height: 4)
            
            Text("* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.")
                .font(.system(size: 10, weight: .regular))
                .foregroundColor(.white.opacity(0.7))
                .padding(.top, 4)
        }
        .padding(16)
        .background(AppTheme.surface)
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.2), lineWidth: 2)
        )
    }
    
    private func nutrientRow(label: String, amount: String, percent: Int, isBold: Bool, indent: Bool = false) -> some View {
        VStack(spacing: 4) {
            Divider().background(Color.white.opacity(0.5))
            HStack {
                if indent {
                    Text("  ")
                }
                Text(label)
                    .font(.system(size: 14, weight: isBold ? .bold : .regular))
                Text(amount)
                    .font(.system(size: 14, weight: .regular))
                Spacer()
                Text("\(percent)%")
                    .font(.system(size: 14, weight: .bold))
            }
            .foregroundColor(.white)
        }
    }
}
