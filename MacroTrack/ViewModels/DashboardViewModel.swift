import Foundation
import SwiftData
import SwiftUI

@Observable
class DashboardViewModel {
    var selectedDate: Date = Date()
    var dailyLog: DailyLog?
    var userProfile: UserProfile?
    
    var isToday: Bool {
        Calendar.current.isDateInToday(selectedDate)
    }
    
    var calorieProgress: Double {
        guard let target = userProfile?.targetCalories, target > 0 else { return 0 }
        let consumed = dailyLog?.totalCalories ?? 0
        return min(consumed / target, 1.0)
    }
    
    var remainingCalories: Int {
        guard let target = userProfile?.targetCalories else { return 0 }
        let consumed = dailyLog?.totalCalories ?? 0
        return max(Int(target - consumed), 0)
    }
    
    var proteinProgress: Double {
        guard let target = userProfile?.targetProteinGrams, target > 0 else { return 0 }
        let consumed = dailyLog?.totalProtein ?? 0
        return min(consumed / target, 1.0)
    }
    
    var carbsProgress: Double {
        guard let target = userProfile?.targetCarbsGrams, target > 0 else { return 0 }
        let consumed = dailyLog?.totalCarbs ?? 0
        return min(consumed / target, 1.0)
    }
    
    var fatProgress: Double {
        guard let target = userProfile?.targetFatGrams, target > 0 else { return 0 }
        let consumed = dailyLog?.totalFat ?? 0
        return min(consumed / target, 1.0)
    }
    
    func fetchDailyLog(context: ModelContext, repository: FoodRepository) {
        let descriptor = FetchDescriptor<UserProfile>()
        let users = try? context.fetch(descriptor)
        guard let user = users?.first else { return }
        self.userProfile = user
        self.dailyLog = repository.getOrCreateDailyLog(for: selectedDate, user: user, context: context)
    }
    
    func goToNextDay(context: ModelContext, repository: FoodRepository) {
        selectedDate = Calendar.current.date(byAdding: .day, value: 1, to: selectedDate) ?? Date()
        fetchDailyLog(context: context, repository: repository)
    }
    
    func goToPreviousDay(context: ModelContext, repository: FoodRepository) {
        selectedDate = Calendar.current.date(byAdding: .day, value: -1, to: selectedDate) ?? Date()
        fetchDailyLog(context: context, repository: repository)
    }
}
