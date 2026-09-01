import SwiftUI

public struct MacroProgressBar: View {
    public let label: String
    public let currentValue: Double
    public let targetValue: Double
    public let color: Color
    public let unit: String
    
    @State private var animatedProgress: Double = 0
    
    public init(
        label: String,
        currentValue: Double,
        targetValue: Double,
        color: Color,
        unit: String = "g"
    ) {
        self.label = label
        self.currentValue = currentValue
        self.targetValue = max(targetValue, 1) // Prevent division by zero
        self.color = color
        self.unit = unit
    }
    
    private var progress: Double {
        return currentValue / targetValue
    }
    
    private var displayColor: Color {
        return progress > 1.0 ? Color.red : color
    }
    
    public var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text(label)
                    .font(AppTheme.fontRounded(size: 14, weight: .medium))
                    .foregroundColor(.white)
                
                Spacer()
                
                Text("\(Int(currentValue)) / \(Int(targetValue)) \(unit)")
                    .font(AppTheme.fontRounded(size: 14, weight: .medium))
                    .foregroundColor(Color.white.opacity(0.7))
            }
            
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Track
                    Capsule()
                        .fill(AppTheme.surfaceLight)
                        .frame(height: 8)
                    
                    // Fill
                    Capsule()
                        .fill(displayColor)
                        .frame(width: min(CGFloat(animatedProgress) * geometry.size.width, geometry.size.width), height: 8)
                        .animation(.spring(response: 0.6, dampingFraction: 0.8), value: animatedProgress)
                }
            }
            .frame(height: 8)
        }
        .onAppear {
            animatedProgress = progress
        }
        .onChange(of: progress) { _, newValue in
            animatedProgress = newValue
        }
    }
}
