import SwiftUI

struct MaintenanceCard: View {
    var tdeeResult: TDEEResult?
    
    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text("Your Maintenance")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    
                    Spacer()
                    
                    if let result = tdeeResult {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(result.dataSource == "adaptive" ? AppTheme.adequate : AppTheme.low)
                                .frame(width: 8, height: 8)
                            Text(result.dataSource.capitalized)
                                .font(.caption.bold())
                                .foregroundStyle(result.dataSource == "adaptive" ? AppTheme.adequate : AppTheme.low)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule().fill((result.dataSource == "adaptive" ? AppTheme.adequate : AppTheme.low).opacity(0.2))
                        )
                    }
                }
                
                if let result = tdeeResult {
                    HStack(alignment: .bottom, spacing: 4) {
                        Text("\(Int(result.currentTDEE))")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [AppTheme.accent, AppTheme.protein],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .shadow(color: AppTheme.accent.opacity(0.3), radius: 10, x: 0, y: 5)
                        
                        Text("kcal/day")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                            .padding(.bottom, 8)
                    }
                    
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Weight Trend")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
                            HStack(spacing: 4) {
                                Image(systemName: trendIcon(for: result.weeklyWeightChangeKg))
                                Text(trendText(for: result.weeklyWeightChangeKg))
                            }
                            .font(.subheadline.bold())
                            .foregroundStyle(trendColor(for: result.weeklyWeightChangeKg))
                        }
                        
                        Spacer()
                        
                        VStack(alignment: .trailing, spacing: 4) {
                            Text("Confidence")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
                            HStack(spacing: 6) {
                                Text("\(Int(result.confidenceScore * 100))%")
                                    .font(.subheadline.bold())
                                
                                MacroRingView(
                                    progress: result.confidenceScore,
                                    lineWidth: 4,
                                    gradient: LinearGradient(colors: [AppTheme.low, AppTheme.adequate], startPoint: .leading, endPoint: .trailing),
                                    size: 24
                                ) {
                                    EmptyView()
                                }
                            }
                        }
                    }
                } else {
                    VStack(alignment: .center, spacing: 12) {
                        Image(systemName: "lock.shield")
                            .font(.system(size: 32))
                            .foregroundStyle(AppTheme.accent)
                        
                        Text("Log food for 14 days to unlock adaptive calculation")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                }
            }
            .padding()
        }
    }
    
    private func trendIcon(for change: Double) -> String {
        if change < -0.1 { return "arrow.down.right" }
        if change > 0.1 { return "arrow.up.right" }
        return "arrow.right"
    }
    
    private func trendText(for change: Double) -> String {
        if change < -0.1 { return "\(String(format: "%.1f", abs(change))) kg/week" }
        if change > 0.1 { return "\(String(format: "%.1f", change)) kg/week" }
        return "Maintaining"
    }
    
    private func trendColor(for change: Double) -> Color {
        if change < -0.1 { return AppTheme.adequate } // Assuming weight loss is good/green
        if change > 0.1 { return AppTheme.deficient } // Assuming weight gain is bad/red
        return AppTheme.carbs // Maintaining is yellow/amber
    }
}
