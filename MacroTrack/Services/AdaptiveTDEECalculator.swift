import Foundation

struct DailySnapshot {
    let date: Date
    let scaleWeightKg: Double?
    let caloriesConsumed: Double?
    let stepCount: Double?
}

struct TDEEResult {
    let currentTDEE: Double
    let trendWeightKg: Double
    let weeklyWeightChangeKg: Double
    let confidenceScore: Double  // 0.0 to 1.0
    let dataSource: String  // "adaptive" or "formula"
}

struct AdaptiveTDEECalculator {
    
    static func calculateInitialTDEE(weightKg: Double, heightCm: Double, age: Int, gender: String, activityLevel: Double = 1.2) -> Double {
        // Mifflin-St Jeor Equation
        var bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * Double(age))
        if gender.lowercased() == "male" {
            bmr += 5
        } else {
            bmr -= 161
        }
        return bmr * activityLevel
    }
    
    static func calculateAdaptiveTDEE(snapshots: [DailySnapshot], previousTDEE: Double, fallbackTDEE: Double) -> TDEEResult {
        let sortedSnapshots = snapshots.sorted { $0.date < $1.date }
        let alpha = 0.10
        
        var trendWeight: Double? = nil
        var validWeightCount = 0
        var validCalorieCount = 0
        var totalCalories: Double = 0
        
        var trendWeights: [Double] = []
        var validCaloriesList: [Double] = []
        
        // 1. Weight Smoothing (EMA) and data collection
        for snapshot in sortedSnapshots {
            if let w = snapshot.scaleWeightKg {
                if let ptw = trendWeight {
                    trendWeight = (alpha * w) + ((1 - alpha) * ptw)
                } else {
                    trendWeight = w // Initialize with first weight
                }
                validWeightCount += 1
                trendWeights.append(trendWeight!)
            }
            
            if let cal = snapshot.caloriesConsumed, cal >= 600 {
                validCalorieCount += 1
                totalCalories += cal
                validCaloriesList.append(cal)
            }
        }
        
        // 5. Fallback if not enough data (< 14 valid data points approximation)
        if validWeightCount < 14 || validCalorieCount < 14 || trendWeights.count < 14 {
            let finalTrendWeight = trendWeight ?? (snapshots.compactMap { $0.scaleWeightKg }.last ?? 0.0)
            return TDEEResult(
                currentTDEE: fallbackTDEE,
                trendWeightKg: finalTrendWeight,
                weeklyWeightChangeKg: 0,
                confidenceScore: 0.1,
                dataSource: "formula"
            )
        }
        
        // 2. Energy Balance
        let firstTrendWeight = trendWeights.first!
        let lastTrendWeight = trendWeights.last!
        let daysBetween = Double(validWeightCount)
        
        let deltaWeightKg = lastTrendWeight - firstTrendWeight
        let averageCaloriesIn = totalCalories / Double(validCalorieCount)
        
        // TDEE = avgCaloriesIn - (ΔtrendWeight_kg × 7700 / days)
        var calculatedTDEE = averageCaloriesIn - (deltaWeightKg * 7700.0 / daysBetween)
        
        // 3. Step Adjustment
        if let latestSteps = sortedSnapshots.last?.stepCount, let currentWeight = trendWeight {
            let stepAdjustment = (latestSteps - 7500.0) * currentWeight * 0.00057
            calculatedTDEE += stepAdjustment
        }
        
        // 4. Guardrails: Max ±25 kcal/day TDEE change
        let maxChange = 25.0
        let newTDEE = max(previousTDEE - maxChange, min(previousTDEE + maxChange, calculatedTDEE))
        
        // Confidence weighting by logging adherence
        let expectedDays = Double(snapshots.count)
        let adherenceRate = Double(validCalorieCount) / max(1.0, expectedDays)
        let confidenceScore = min(1.0, max(0.0, adherenceRate))
        
        // Weekly weight change
        let weeklyWeightChange = (deltaWeightKg / daysBetween) * 7.0
        
        return TDEEResult(
            currentTDEE: newTDEE,
            trendWeightKg: trendWeight ?? 0.0,
            weeklyWeightChangeKg: weeklyWeightChange,
            confidenceScore: confidenceScore,
            dataSource: "adaptive"
        )
    }
}
