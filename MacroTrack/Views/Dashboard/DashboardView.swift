import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(\.modelContext) private var context
    @Environment(FoodRepository.self) private var repository
    
    @State private var viewModel = DashboardViewModel()
    
    @State private var showingQuickAdd = false
    @State private var showingBarcodeScanner = false
    @State private var showingFoodSearch = false
    
    @State private var appearAnimation = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.background.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        headerView
                        
                        calorieRingView
                        
                        macrosView
                        
                        quickActionsView
                        
                        todayMealsSummary
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 100)
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                viewModel.fetchDailyLog(context: context, repository: repository)
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                    appearAnimation = true
                }
            }
            .sheet(isPresented: $showingQuickAdd) {
                if let dailyLog = viewModel.dailyLog,
                   let meal = dailyLog.meals.first(where: { $0.mealType == .snacks }) {
                    QuickAddView(targetMeal: meal)
                        .presentationDetents([.medium, .large])
                }
            }
            .fullScreenCover(isPresented: $showingBarcodeScanner) {
                if let dailyLog = viewModel.dailyLog,
                   let meal = dailyLog.meals.first(where: { $0.mealType == .snacks }) {
                    NavigationStack {
                        BarcodeScannerView { barcode in
                            showingBarcodeScanner = false
                        }
                        .toolbar {
                            ToolbarItem(placement: .navigationBarLeading) {
                                Button("Cancel") { showingBarcodeScanner = false }
                            }
                        }
                    }
                }
            }
            .sheet(isPresented: $showingFoodSearch) {
                if let dailyLog = viewModel.dailyLog,
                   let meal = dailyLog.meals.first(where: { $0.mealType == .snacks }) {
                    FoodSearchView(targetMeal: meal)
                        .presentationDetents([.large])
                }
            }
        }
    }
    
    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(greetingMessage)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
                Text(dateString)
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            Spacer()
            Circle()
                .fill(AppTheme.surfaceLight)
                .frame(width: 44, height: 44)
                .overlay(
                    Image(systemName: "person.fill")
                        .foregroundColor(AppTheme.accent)
                )
        }
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 20)
    }

    private var greetingMessage: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let name = viewModel.userProfile?.name ?? "User"
        if hour < 12 { return "Good Morning, \(name)" }
        else if hour < 17 { return "Good Afternoon, \(name)" }
        else { return "Good Evening, \(name)" }
    }
    
    private var dateString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: viewModel.selectedDate)
    }

    private var calorieRingView: some View {
        MacroRingView(
            progress: viewModel.calorieProgress,
            lineWidth: 24,
            gradient: AppTheme.caloriesGradient,
            size: 250
        ) {
            VStack(spacing: 8) {
                Text("\(viewModel.remainingCalories)")
                    .font(.system(size: 48, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("Calories Left")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.gray)
                
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .foregroundColor(.orange)
                    Text("\(Int(viewModel.dailyLog?.totalCalories ?? 0)) / \(Int(viewModel.userProfile?.targetCalories ?? 0))")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.gray)
                }
                .padding(.top, 8)
            }
        }
        .padding(.vertical, 16)
        .opacity(appearAnimation ? 1 : 0)
        .scaleEffect(appearAnimation ? 1 : 0.9)
    }
    
    private var macrosView: some View {
        VStack(spacing: 16) {
            MacroProgressBar(
                label: "Protein",
                currentValue: viewModel.dailyLog?.totalProtein ?? 0,
                targetValue: viewModel.userProfile?.targetProteinGrams ?? 1,
                color: AppTheme.protein,
                unit: "g"
            )
            MacroProgressBar(
                label: "Carbs",
                currentValue: viewModel.dailyLog?.totalCarbs ?? 0,
                targetValue: viewModel.userProfile?.targetCarbsGrams ?? 1,
                color: AppTheme.carbs,
                unit: "g"
            )
            MacroProgressBar(
                label: "Fat",
                currentValue: viewModel.dailyLog?.totalFat ?? 0,
                targetValue: viewModel.userProfile?.targetFatGrams ?? 1,
                color: AppTheme.fat,
                unit: "g"
            )
        }
        .padding(20)
        .glassStyle()
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 20)
    }

    private var quickActionsView: some View {
        HStack(spacing: 16) {
            QuickActionButton(icon: "bolt.fill", title: "Quick Add") {
                HapticFeedback.play(style: .light)
                showingQuickAdd = true
            }
            QuickActionButton(icon: "barcode.viewfinder", title: "Scan") {
                HapticFeedback.play(style: .light)
                showingBarcodeScanner = true
            }
            QuickActionButton(icon: "magnifyingglass", title: "Search") {
                HapticFeedback.play(style: .light)
                showingFoodSearch = true
            }
        }
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 20)
    }
    
    private var todayMealsSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Today's Meals")
                .font(.headline)
                .foregroundColor(.white)
            
            if let meals = viewModel.dailyLog?.meals, !meals.isEmpty {
                let order: [MealType] = [.breakfast, .lunch, .dinner, .snacks]
                let sortedMeals = meals.sorted { m1, m2 in
                    (order.firstIndex(of: m1.mealType) ?? 99) < (order.firstIndex(of: m2.mealType) ?? 99)
                }
                
                ForEach(sortedMeals, id: \.id) { meal in
                    HStack {
                        Image(systemName: mealIcon(for: meal.mealType))
                            .foregroundColor(AppTheme.accent)
                            .frame(width: 24)
                        Text(meal.mealType.rawValue)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                        Spacer()
                        Text("\(Int(meal.totalCalories)) kcal")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding()
                    .cardStyle()
                }
            } else {
                Text("No meals logged yet.")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
        }
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 20)
    }
    
    private func mealIcon(for type: MealType) -> String {
        switch type {
        case .breakfast: return "sunrise.fill"
        case .lunch: return "sun.max.fill"
        case .dinner: return "moon.stars.fill"
        case .snacks: return "leaf.fill"
        }
    }
}

struct QuickActionButton: View {
    let icon: String
    let title: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.white)
                    .frame(width: 50, height: 50)
                    .background(
                        Circle()
                            .fill(LinearGradient(colors: [AppTheme.accent, AppTheme.accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing))
                            .shadow(color: AppTheme.accent.opacity(0.3), radius: 8, x: 0, y: 4)
                    )
                
                Text(title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .glassStyle()
        }
    }
}
