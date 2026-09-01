import SwiftUI

public enum AppTheme {
    // MARK: - Avocado Color Palette 🥑
    
    // Macro Colors
    public static let protein = Color(red: 1.0, green: 0.49, blue: 0.49)   // #FF7D7D — warm coral
    public static let carbs = Color(red: 0.96, green: 0.73, blue: 0.26)    // #F4B942 — golden amber (pit)
    public static let fat = Color(red: 0.91, green: 0.84, blue: 0.64)      // #E8D5A3 — creamy butter
    
    // App Chrome
    public static let background = Color(red: 0.043, green: 0.102, blue: 0.071)   // #0B1A12 — deep forest
    public static let surface = Color(red: 0.075, green: 0.165, blue: 0.118)      // #132A1E — dark forest
    public static let surfaceLight = Color(red: 0.114, green: 0.239, blue: 0.169) // #1D3D2B — medium forest
    public static let accent = Color(red: 0.71, green: 0.85, blue: 0.23)          // #B5D93B — avocado flesh
    
    // Semantic
    public static let success = Color(red: 0.49, green: 0.76, blue: 0.26)  // #7CC342
    public static let warning = Color(red: 0.96, green: 0.73, blue: 0.26)  // #F4B942
    public static let danger = Color(red: 1.0, green: 0.42, blue: 0.42)    // #FF6B6B
    
    // Micronutrient Status Colors
    public static let adequate = Color(red: 0.49, green: 0.76, blue: 0.26)   // green — ≥80% RDA
    public static let low = Color(red: 0.96, green: 0.73, blue: 0.26)        // yellow — 50-80% RDA
    public static let deficient = Color(red: 1.0, green: 0.42, blue: 0.42)   // red — <50% RDA
    public static let excess = Color(red: 0.65, green: 0.45, blue: 0.85)     // purple — >UL
    
    // MARK: - Gradients
    
    public static let caloriesGradient = LinearGradient(
        colors: [Color(red: 0.49, green: 0.70, blue: 0.26), accent],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    public static let proteinGradient = LinearGradient(
        colors: [protein.opacity(0.7), protein],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    public static let carbsGradient = LinearGradient(
        colors: [carbs.opacity(0.7), carbs],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    public static let fatGradient = LinearGradient(
        colors: [fat.opacity(0.7), fat],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    public static let cardGradient = LinearGradient(
        colors: [surfaceLight.opacity(0.5), surface.opacity(0.5)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    public static let insightsGradient = LinearGradient(
        colors: [accent.opacity(0.3), Color(red: 0.49, green: 0.70, blue: 0.26).opacity(0.1)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
    
    // MARK: - Typography
    
    public static func fontRounded(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        return Font.system(size: size, weight: weight, design: .rounded)
    }
}

// MARK: - Macro Color Enum

public enum MacroColor {
    case protein
    case carbs
    case fat
    case calories
    
    public var color: Color {
        switch self {
        case .protein: return AppTheme.protein
        case .carbs: return AppTheme.carbs
        case .fat: return AppTheme.fat
        case .calories: return AppTheme.accent
        }
    }
    
    public var gradient: LinearGradient {
        switch self {
        case .protein: return AppTheme.proteinGradient
        case .carbs: return AppTheme.carbsGradient
        case .fat: return AppTheme.fatGradient
        case .calories: return AppTheme.caloriesGradient
        }
    }
}

// MARK: - View Modifiers

public struct CardStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .background(AppTheme.surface)
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.3), radius: 8, x: 0, y: 4)
    }
}

public struct GlassStyle: ViewModifier {
    public func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.2), radius: 10, x: 0, y: 5)
    }
}

public extension View {
    func cardStyle() -> some View {
        self.modifier(CardStyle())
    }
    
    func glassStyle() -> some View {
        self.modifier(GlassStyle())
    }
}

// MARK: - Haptic Feedback

public class HapticFeedback {
    public static func play(style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let generator = UIImpactFeedbackGenerator(style: style)
        generator.prepare()
        generator.impactOccurred()
    }
    
    public static func success() {
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
    }
}
