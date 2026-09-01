import SwiftUI
import SwiftData

@Observable
final class InsightsViewModel {
    var tdeeResult: TDEEResult?
    var micronutrientStatuses: [MicronutrientStatus] = []
    var isLoadingHealthKit: Bool = false
    var healthKitError: String?
    var selectedNutrient: Micronutrient?
    var showingNutrientDetail: Bool = false
    
    var adequateCount: Int { micronutrientStatuses.filter { $0.level == .adequate }.count }
    var lowCount: Int { micronutrientStatuses.filter { $0.level == .low }.count }
    var deficientCount: Int { micronutrientStatuses.filter { $0.level == .deficient }.count }
    var excessCount: Int { micronutrientStatuses.filter { $0.level == .excess }.count }
    var totalTracked: Int { micronutrientStatuses.count }
    
    @MainActor
    func loadData(context: ModelContext, healthKit: HealthKitManager) async {
        isLoadingHealthKit = true
        healthKitError = nil
        
        // Try HealthKit but don't block on failure
        do {
            try await healthKit.requestAuthorization()
            _ = try await healthKit.fetchTodaySteps()
            _ = try await healthKit.fetchDailySteps(days: 7)
            _ = try await healthKit.fetchTodayActiveEnergy()
        } catch {
            healthKitError = error.localizedDescription
        }
        
        calculateAdaptiveTDEE(context: context, healthKit: healthKit)
        analyzeMicronutrients(context: context)
        isLoadingHealthKit = false
    }
    
    @MainActor
    func calculateAdaptiveTDEE(context: ModelContext, healthKit: HealthKitManager) {
        let descriptor = FetchDescriptor<UserProfile>()
        guard let profile = try? context.fetch(descriptor).first else { return }
        
        let age = Calendar.current.dateComponents([.year], from: profile.birthDate, to: Date()).year ?? 30
        
        // Convert string activity level to multiplier
        let activityMultiplier = NutritionCalculator.activityMultiplier(level: profile.activityLevel)
        
        let initialTDEE = AdaptiveTDEECalculator.calculateInitialTDEE(
            weightKg: profile.currentWeightKg,
            heightCm: profile.heightCm,
            age: age,
            gender: profile.gender,
            activityLevel: activityMultiplier
        )
        
        // Fetch recent logs
        let logDescriptor = FetchDescriptor<DailyLog>()
        let allLogs = (try? context.fetch(logDescriptor)) ?? []
        
        let calendar = Calendar.current
        let fourWeeksAgo = calendar.date(byAdding: .day, value: -28, to: Date())!
        let recentLogs = allLogs
            .filter { $0.date >= fourWeeksAgo }
            .sorted { $0.date < $1.date }
        
        // Build snapshots from daily logs
        var snapshots: [DailySnapshot] = []
        for log in recentLogs {
            snapshots.append(DailySnapshot(
                date: log.date,
                scaleWeightKg: log.morningWeightKg ?? profile.currentWeightKg,
                caloriesConsumed: log.totalCalories > 0 ? log.totalCalories : nil,
                stepCount: log.stepCount
            ))
        }
        
        // Use previous TDEE if available, otherwise use formula
        let previousTDEE = tdeeResult?.currentTDEE ?? initialTDEE
        
        tdeeResult = AdaptiveTDEECalculator.calculateAdaptiveTDEE(
            snapshots: snapshots,
            previousTDEE: previousTDEE,
            fallbackTDEE: initialTDEE
        )
    }
    
    @MainActor
    func analyzeMicronutrients(context: ModelContext) {
        let profileDescriptor = FetchDescriptor<UserProfile>()
        guard let profile = try? context.fetch(profileDescriptor).first else { return }
        
        let age = Calendar.current.dateComponents([.year], from: profile.birthDate, to: Date()).year ?? 30
        
        let today = Calendar.current.startOfDay(for: Date())
        let logDescriptor = FetchDescriptor<DailyLog>()
        let allLogs = (try? context.fetch(logDescriptor)) ?? []
        let todayLog = allLogs.first { Calendar.current.isDate($0.date, inSameDayAs: today) }
        
        if let log = todayLog {
            micronutrientStatuses = MicronutrientAnalyzer.analyze(
                dailyLog: log,
                gender: profile.gender,
                age: age
            )
        } else {
            // Show empty state with zero intake
            micronutrientStatuses = Micronutrient.allCases.map { nutrient in
                MicronutrientStatus(
                    nutrient: nutrient,
                    currentIntake: 0,
                    rdaTarget: nutrient.rda(gender: profile.gender, age: age)
                )
            }
        }
    }
}
