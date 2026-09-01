import SwiftUI

public struct MacroRingView<CenterContent: View>: View {
    let progress: Double
    let lineWidth: CGFloat
    let gradient: LinearGradient
    let size: CGFloat
    let centerContent: () -> CenterContent
    
    @State private var animatedProgress: Double = 0
    
    public init(
        progress: Double,
        lineWidth: CGFloat = 12,
        gradient: LinearGradient = AppTheme.caloriesGradient,
        size: CGFloat = 120,
        @ViewBuilder centerContent: @escaping () -> CenterContent
    ) {
        self.progress = max(0, progress)
        self.lineWidth = lineWidth
        self.gradient = gradient
        self.size = size
        self.centerContent = centerContent
    }
    
    public var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(AppTheme.surfaceLight, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .frame(width: size, height: size)
            
            // Progress ring
            Circle()
                .trim(from: 0, to: min(CGFloat(animatedProgress), 1.0))
                .stroke(gradient, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .frame(width: size, height: size)
                .rotationEffect(.degrees(-90))
                .animation(.spring(response: 0.6, dampingFraction: 0.8), value: animatedProgress)
            
            // Center content
            centerContent()
        }
        .onAppear {
            animatedProgress = progress
        }
        .onChange(of: progress) { _, newValue in
            animatedProgress = newValue
        }
    }
}
