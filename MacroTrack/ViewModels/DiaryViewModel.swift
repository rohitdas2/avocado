import Foundation
import SwiftData
import SwiftUI

@Observable
class DiaryViewModel {
    var selectedDate: Date = Date()
    var dailyLog: DailyLog?
    var userProfile: UserProfile?
    
    var showingQuickAdd: Bool = false
    var quickAddMealType: MealType = .breakfast
    
    var sortedMeals: [MealLog] {
        guard let meals = dailyLog?.meals else { return [] }
        let order: [MealType] = [.breakfast, .lunch, .dinner, .snacks]
        return meals.sorted { meal1, meal2 in
            let idx1 = order.firstIndex(of: meal1.mealType) ?? 99
            let idx2 = order.firstIndex(of: meal2.mealType) ?? 99
            return idx1 < idx2
        }
    }
    
    func loadDailyLog(context: ModelContext, repository: FoodRepository) {
        let descriptor = FetchDescriptor<UserProfile>()
        if let user = try? context.fetch(descriptor).first {
            self.userProfile = user
            self.dailyLog = repository.getOrCreateDailyLog(for: selectedDate, user: user, context: context)
        }
    }
    
    func deleteFoodEntry(_ entry: FoodEntry, context: ModelContext, repository: FoodRepository) {
        repository.deleteFoodEntry(entry, context: context)
        // Refresh log to reflect changes if necessary
        loadDailyLog(context: context, repository: repository)
    }
    
    func goToNextDay(context: ModelContext, repository: FoodRepository) {
        selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? Date()
        loadDailyLog(context: context, repository: repository)
    }
    
    func goToPreviousDay(context: ModelContext, repository: FoodRepository) {
        selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? Date()
        loadDailyLog(context: context, repository: repository)
    }
}
