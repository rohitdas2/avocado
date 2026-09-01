import SwiftUI
import SwiftData

struct MealSectionView: View {
    @Environment(\.modelContext) private var context
    let meal: MealLog
    var viewModel: DiaryViewModel
    let repository: FoodRepository
    var onAddFood: ((MealLog) -> Void)?
    
    @State private var isExpanded: Bool = true
    
    var mealIcon: String {
        switch meal.mealType {
        case .breakfast: return "sunrise.fill"
        case .lunch: return "sun.max.fill"
        case .dinner: return "moon.stars.fill"
        case .snacks: return "leaf.fill"
        }
    }
    
    var body: some View {
        VStack(spacing: 0) {
            Button(action: {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            }) {
                HStack {
                    Image(systemName: mealIcon)
                        .foregroundColor(AppTheme.accent)
                        .font(.title3)
                    
                    Text(meal.mealType.rawValue)
                        .font(.headline)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    Text("\(Int(meal.totalCalories)) kcal")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.gray)
                    
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .foregroundColor(.gray)
                        .font(.caption)
                        .padding(.leading, 4)
                }
                .padding()
            }
            
            if isExpanded {
                Divider()
                    .background(Color.gray.opacity(0.3))
                
                VStack(spacing: 0) {
                    if meal.entries.isEmpty {
                        Text("No foods logged yet")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                            .padding(.vertical, 20)
                    } else {
                        ForEach(meal.entries, id: \.id) { entry in
                            FoodEntryRow(entry: entry)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        withAnimation {
                                            viewModel.deleteFoodEntry(entry, context: context, repository: repository)
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            
                            if entry.id != meal.entries.last?.id {
                                Divider()
                                    .background(Color.gray.opacity(0.3))
                                    .padding(.leading, 16)
                            }
                        }
                    }
                }
                
                Divider()
                    .background(Color.gray.opacity(0.3))
                
                Button(action: {
                    HapticFeedback.play(style: .light)
                    if let onAddFood = onAddFood {
                        onAddFood(meal)
                    }
                }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("Add Food")
                    }
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(AppTheme.accent)
                    .frame(maxWidth: .infinity)
                    .padding()
                }
            }
        }
        .cardStyle()
    }
}
