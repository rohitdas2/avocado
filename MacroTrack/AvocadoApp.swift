import SwiftUI
import SwiftData

@main
struct AvocadoApp: App {
    let container: ModelContainer
    @State private var repository = FoodRepository()
    @State private var healthKitManager = HealthKitManager.shared
    
    init() {
        do {
            let schema = Schema([
                UserProfile.self,
                DailyLog.self,
                MealLog.self,
                FoodEntry.self,
                FoodItem.self,
                ServingOption.self
            ])
            let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
            container = try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }
    
    var body: some Scene {
        WindowGroup {
            MainTabView()
                .environment(repository)
                .environment(healthKitManager)
                .preferredColorScheme(.dark)
                .onAppear {
                    setupDefaultProfile(context: container.mainContext)
                }
        }
        .modelContainer(container)
    }
    
    private func setupDefaultProfile(context: ModelContext) {
        let descriptor = FetchDescriptor<UserProfile>()
        if let count = try? context.fetchCount(descriptor), count == 0 {
            let profile = UserProfile(
                name: "User",
                targetCalories: 2000,
                targetProteinGrams: 150,
                targetCarbsGrams: 200,
                targetFatGrams: 65,
                currentWeightKg: 70,
                targetWeightKg: 70,
                heightCm: 175,
                birthDate: Calendar.current.date(byAdding: .year, value: -25, to: Date())!,
                gender: "male",
                activityLevel: "moderate",
                useMetricUnits: true
            )
            context.insert(profile)
            try? context.save()
        }
    }
}
