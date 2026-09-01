import Foundation
import HealthKit
import Observation

enum HealthKitError: Error, LocalizedError {
    case notAvailableOnDevice
    case dataTypeNotAvailable
    case unauthorized
    
    var errorDescription: String? {
        switch self {
        case .notAvailableOnDevice: return "HealthKit is not available on this device."
        case .dataTypeNotAvailable: return "Requested data type is unavailable."
        case .unauthorized: return "HealthKit access was denied."
        }
    }
}

@Observable
final class HealthKitManager {
    static let shared = HealthKitManager()
    
    let healthStore = HKHealthStore()
    var isAuthorized: Bool = false
    var todaySteps: Double = 0
    var todayActiveEnergy: Double = 0
    var weeklySteps: [DailyMetric] = []
    
    struct DailyMetric: Identifiable {
        let id = UUID()
        let date: Date
        let value: Double
    }
    
    struct EnergyBreakdown: Identifiable {
        let id = UUID()
        let date: Date
        let activeKcal: Double
        let basalKcal: Double
        var totalKcal: Double { activeKcal + basalKcal }
    }
    
    var isHealthKitAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }
    
    // MARK: - Authorization
    
    func requestAuthorization() async throws {
        guard isHealthKitAvailable else {
            throw HealthKitError.notAvailableOnDevice
        }
        
        guard let stepCount = HKQuantityType.quantityType(forIdentifier: .stepCount),
              let activeEnergy = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
              let basalEnergy = HKQuantityType.quantityType(forIdentifier: .basalEnergyBurned),
              let bodyMass = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            throw HealthKitError.dataTypeNotAvailable
        }
        
        let typesToRead: Set<HKObjectType> = [stepCount, activeEnergy, basalEnergy, bodyMass]
        
        do {
            try await healthStore.requestAuthorization(toShare: [], read: typesToRead)
            await MainActor.run { self.isAuthorized = true }
        } catch {
            throw HealthKitError.unauthorized
        }
    }
    
    // MARK: - Steps
    
    @MainActor
    func fetchTodaySteps() async throws -> Double {
        guard isHealthKitAvailable else { return 0 }
        
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            throw HealthKitError.dataTypeNotAvailable
        }
        
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        
        let samplePredicate = HKSamplePredicate.quantitySample(type: stepType, predicate: predicate)
        let descriptor = HKStatisticsQueryDescriptor(predicate: samplePredicate, options: .cumulativeSum)
        
        let statistics = try await descriptor.result(for: healthStore)
        let steps = statistics?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
        self.todaySteps = steps
        return steps
    }
    
    @MainActor
    func fetchDailySteps(days: Int = 7) async throws -> [DailyMetric] {
        guard isHealthKitAvailable else { return [] }
        
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            throw HealthKitError.dataTypeNotAvailable
        }
        
        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: calendar.startOfDay(for: endDate)) else {
            return []
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        let samplePredicate = HKSamplePredicate.quantitySample(type: stepType, predicate: predicate)
        let anchorDate = calendar.startOfDay(for: endDate)
        
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: samplePredicate,
            options: .cumulativeSum,
            anchorDate: anchorDate,
            intervalComponents: DateComponents(day: 1)
        )
        
        let results = try await descriptor.result(for: healthStore)
        var metrics: [DailyMetric] = []
        
        results.enumerateStatistics(from: startDate, to: endDate) { statistics, _ in
            let count = statistics.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
            metrics.append(DailyMetric(date: statistics.startDate, value: count))
        }
        
        self.weeklySteps = metrics
        return metrics
    }
    
    // MARK: - Active Energy
    
    @MainActor
    func fetchTodayActiveEnergy() async throws -> Double {
        guard isHealthKitAvailable else { return 0 }
        
        guard let activeType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) else {
            throw HealthKitError.dataTypeNotAvailable
        }
        
        let calendar = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)
        
        let samplePredicate = HKSamplePredicate.quantitySample(type: activeType, predicate: predicate)
        let descriptor = HKStatisticsQueryDescriptor(predicate: samplePredicate, options: .cumulativeSum)
        
        let statistics = try await descriptor.result(for: healthStore)
        let energy = statistics?.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) ?? 0
        self.todayActiveEnergy = energy
        return energy
    }
    
    // MARK: - Energy Breakdown
    
    func fetchDailyEnergyBreakdown(days: Int = 14) async throws -> [EnergyBreakdown] {
        guard isHealthKitAvailable else { return [] }
        
        guard let activeType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
              let basalType = HKQuantityType.quantityType(forIdentifier: .basalEnergyBurned) else {
            throw HealthKitError.dataTypeNotAvailable
        }
        
        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: calendar.startOfDay(for: endDate)) else {
            return []
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        let anchorDate = calendar.startOfDay(for: endDate)
        let interval = DateComponents(day: 1)
        
        let activePredicate = HKSamplePredicate.quantitySample(type: activeType, predicate: predicate)
        let basalPredicate = HKSamplePredicate.quantitySample(type: basalType, predicate: predicate)
        
        let activeDescriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: activePredicate, options: .cumulativeSum,
            anchorDate: anchorDate, intervalComponents: interval
        )
        let basalDescriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: basalPredicate, options: .cumulativeSum,
            anchorDate: anchorDate, intervalComponents: interval
        )
        
        async let activeResults = activeDescriptor.result(for: healthStore)
        async let basalResults = basalDescriptor.result(for: healthStore)
        let (activeStats, basalStats) = try await (activeResults, basalResults)
        
        var breakdownDict: [Date: (active: Double, basal: Double)] = [:]
        
        activeStats.enumerateStatistics(from: startDate, to: endDate) { statistics, _ in
            let energy = statistics.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) ?? 0
            let day = calendar.startOfDay(for: statistics.startDate)
            breakdownDict[day, default: (0, 0)].active = energy
        }
        
        basalStats.enumerateStatistics(from: startDate, to: endDate) { statistics, _ in
            let energy = statistics.sumQuantity()?.doubleValue(for: HKUnit.kilocalorie()) ?? 0
            let day = calendar.startOfDay(for: statistics.startDate)
            breakdownDict[day, default: (0, 0)].basal = energy
        }
        
        return breakdownDict
            .map { EnergyBreakdown(date: $0.key, activeKcal: $0.value.active, basalKcal: $0.value.basal) }
            .sorted { $0.date < $1.date }
    }
    
    // MARK: - Weight
    
    func fetchRecentWeights(days: Int = 30) async throws -> [(date: Date, weightKg: Double)] {
        guard isHealthKitAvailable else { return [] }
        
        guard let bodyMassType = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            throw HealthKitError.dataTypeNotAvailable
        }
        
        let calendar = Calendar.current
        let endDate = Date()
        guard let startDate = calendar.date(byAdding: .day, value: -days, to: endDate) else {
            return []
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate, options: .strictStartDate)
        let samplePredicate = HKSamplePredicate.quantitySample(type: bodyMassType, predicate: predicate)
        
        let descriptor = HKSampleQueryDescriptor(
            predicates: [samplePredicate],
            sortDescriptors: [SortDescriptor(\.endDate, order: .forward)]
        )
        
        let samples = try await descriptor.result(for: healthStore)
        
        return samples.map { sample in
            let weight = sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo))
            return (date: sample.endDate, weightKg: weight)
        }
    }
}
