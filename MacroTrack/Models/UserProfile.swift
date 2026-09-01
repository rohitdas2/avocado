import Foundation
import SwiftData

@Model
final class UserProfile {
    @Attribute(.unique) var id: UUID
    var name: String
    var targetCalories: Double
    var targetProteinGrams: Double
    var targetCarbsGrams: Double
    var targetFatGrams: Double
    var currentWeightKg: Double
    var targetWeightKg: Double
    var heightCm: Double
    var birthDate: Date
    var gender: String // "male", "female", "other"
    var activityLevel: String // "sedentary", "light", "moderate", "active", "veryActive"
    var useMetricUnits: Bool
    var createdAt: Date
    
    @Relationship(deleteRule: .cascade, inverse: \DailyLog.user)
    var dailyLogs: [DailyLog] = []
    
    init(
        id: UUID = UUID(),
        name: String = "User",
        targetCalories: Double = 2000,
        targetProteinGrams: Double = 150,
        targetCarbsGrams: Double = 200,
        targetFatGrams: Double = 65,
        currentWeightKg: Double = 75,
        targetWeightKg: Double = 70,
        heightCm: Double = 175,
        birthDate: Date = Calendar.current.date(byAdding: .year, value: -25, to: Date())!,
        gender: String = "male",
        activityLevel: String = "moderate",
        useMetricUnits: Bool = true
    ) {
        self.id = id
        self.name = name
        self.targetCalories = targetCalories
        self.targetProteinGrams = targetProteinGrams
        self.targetCarbsGrams = targetCarbsGrams
        self.targetFatGrams = targetFatGrams
        self.currentWeightKg = currentWeightKg
        self.targetWeightKg = targetWeightKg
        self.heightCm = heightCm
        self.birthDate = birthDate
        self.gender = gender
        self.activityLevel = activityLevel
        self.useMetricUnits = useMetricUnits
        self.createdAt = Date()
    }
}
