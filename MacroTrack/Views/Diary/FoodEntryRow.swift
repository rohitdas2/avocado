import SwiftUI

struct FoodEntryRow: View {
    let entry: FoodEntry
    
    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                if entry.isQuickAdd {
                    Text("Quick Add")
                        .font(.headline)
                        .foregroundColor(.white)
                } else if let foodItem = entry.foodItem {
                    Text(foodItem.name)
                        .font(.headline)
                        .foregroundColor(.white)
                    if let brand = foodItem.brand, !brand.isEmpty {
                        Text(brand)
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                } else {
                    Text("Unknown Food")
                        .font(.headline)
                        .foregroundColor(.white)
                }
                
                if !entry.isQuickAdd {
                    Text("\(String(format: "%.1f", entry.servingAmount)) \(entry.unitName)")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                HStack(spacing: 8) {
                    MacroPill(label: "P", value: Int(entry.protein), color: AppTheme.protein)
                    MacroPill(label: "C", value: Int(entry.carbs), color: AppTheme.carbs)
                    MacroPill(label: "F", value: Int(entry.fat), color: AppTheme.fat)
                }
                .padding(.top, 2)
            }
            
            Spacer()
            
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(Int(entry.calories))")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Text("kcal")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(Color.clear)
    }
}

// Renamed to MacroPill to avoid conflict with MacroBadge in FoodSearchView
struct MacroPill: View {
    let label: String
    let value: Int
    let color: Color
    
    var body: some View {
        HStack(spacing: 2) {
            Text("\(label):")
                .fontWeight(.medium)
            Text("\(value)g")
        }
        .font(.system(size: 10))
        .foregroundColor(color)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(color.opacity(0.15))
        .cornerRadius(4)
    }
}
