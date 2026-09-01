import SwiftUI
import SwiftData

enum TimeRange: String, CaseIterable, Identifiable {
    case week = "Week"
    case month = "Month"
    var id: String { self.rawValue }
}

struct DailyCalorieRecord: Identifiable {
    let id = UUID()
    let date: Date
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
}

@Observable
class AnalyticsViewModel {
    var selectedTimeRange: TimeRange = .week
    var dailyRecords: [DailyCalorieRecord] = []
    var calorieGoal: Double = 2000
    
    var averageCalories: Double {
        guard !dailyRecords.isEmpty else { return 0 }
        return dailyRecords.map(\.calories).reduce(0, +) / Double(dailyRecords.count)
    }
    
    var averageProtein: Double {
        guard !dailyRecords.isEmpty else { return 0 }
        return dailyRecords.map(\.protein).reduce(0, +) / Double(dailyRecords.count)
    }
    
    var averageCarbs: Double {
        guard !dailyRecords.isEmpty else { return 0 }
        return dailyRecords.map(\.carbs).reduce(0, +) / Double(dailyRecords.count)
    }
    
    var averageFat: Double {
        guard !dailyRecords.isEmpty else { return 0 }
        return dailyRecords.map(\.fat).reduce(0, +) / Double(dailyRecords.count)
    }
    
    var totalProteinGrams: Double {
        dailyRecords.map(\.protein).reduce(0, +)
    }
    
    var totalCarbsGrams: Double {
        dailyRecords.map(\.carbs).reduce(0, +)
    }
    
    var totalFatGrams: Double {
        dailyRecords.map(\.fat).reduce(0, +)
    }
    
    func loadData(context: ModelContext) {
        // Fetch User Profile for goal
        let profileDescriptor = FetchDescriptor<UserProfile>()
        if let profile = try? context.fetch(profileDescriptor).first {
            self.calorieGoal = profile.targetCalories
        }
        
        // Determine date limit
        let calendar = Calendar.current
        let daysAgo = selectedTimeRange == .week ? 7 : 30
        guard let startDate = calendar.date(byAdding: .day, value: -daysAgo, to: Date()) else { return }
        
        let descriptor = FetchDescriptor<DailyLog>(
            predicate: #Predicate<DailyLog> { log in
                log.date >= startDate
            },
            sortBy: [SortDescriptor(\.date, order: .forward)]
        )
        
        if let logs = try? context.fetch(descriptor) {
            self.dailyRecords = logs.map { log in
                DailyCalorieRecord(
                    date: log.date,
                    calories: log.totalCalories,
                    protein: log.totalProtein,
                    carbs: log.totalCarbs,
                    fat: log.totalFat
                )
            }
        }
    }
}
