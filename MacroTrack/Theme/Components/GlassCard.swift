import SwiftUI

public struct GlassCard<Content: View>: View {
    let content: () -> Content
    let cornerRadius: CGFloat
    let padding: CGFloat
    
    public init(
        cornerRadius: CGFloat = 20,
        padding: CGFloat = 16,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.content = content
    }
    
    public var body: some View {
        content()
            .padding(padding)
            .background(
                ZStack {
                    Rectangle()
                        .fill(.ultraThinMaterial)
                    
                    AppTheme.cardGradient
                }
            )
            .cornerRadius(cornerRadius)
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.2), radius: 10, x: 0, y: 5)
    }
}
