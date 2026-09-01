import SwiftUI
import SwiftData

struct DiaryView: View {
    @Environment(\.modelContext) private var context
    @Environment(FoodRepository.self) private var repository
    @State private var viewModel = DiaryViewModel()
    
    @State private var appearAnimation = false
    @State private var selectedMealForSearch: MealLog?
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.background.ignoresSafeArea()
                
                VStack(spacing: 0) {
                    dateNavigationHeader
                    
                    summaryBar
                    
                    ScrollView {
                        VStack(spacing: 16) {
                            ForEach(viewModel.sortedMeals, id: \.id) { meal in
                                MealSectionView(
                                    meal: meal,
                                    viewModel: viewModel,
                                    repository: repository,
                                    onAddFood: { mealLog in
                                        selectedMealForSearch = mealLog
                                    }
                                )
                            }
                        }
                        .padding()
                        .padding(.bottom, 100)
                    }
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                viewModel.loadDailyLog(context: context, repository: repository)
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8)) {
                    appearAnimation = true
                }
            }
            .sheet(isPresented: $viewModel.showingQuickAdd) {
                if let dailyLog = viewModel.dailyLog,
                   let meal = dailyLog.meals.first(where: { $0.mealType == viewModel.quickAddMealType }) {
                    QuickAddView(targetMeal: meal)
                        .presentationDetents([.medium, .large])
                }
            }
            .sheet(item: $selectedMealForSearch) { meal in
                FoodSearchView(targetMeal: meal)
                    .presentationDetents([.large])
            }
        }
    }
    
    private var dateNavigationHeader: some View {
        HStack {
            Button {
                withAnimation { viewModel.goToPreviousDay(context: context, repository: repository) }
            } label: {
                Image(systemName: "chevron.left")
                    .padding()
                    .foregroundColor(AppTheme.accent)
            }
            
            Spacer()
            
            VStack {
                Text(dateString)
                    .font(.headline)
                    .foregroundColor(.white)
                if !Calendar.current.isDateInToday(viewModel.selectedDate) {
                    Button("Today") {
                        withAnimation { 
                            viewModel.selectedDate = Date()
                            viewModel.loadDailyLog(context: context, repository: repository)
                        }
                    }
                    .font(.caption)
                    .foregroundColor(AppTheme.accent)
                }
            }
            
            Spacer()
            
            Button {
                withAnimation { viewModel.goToNextDay(context: context, repository: repository) }
            } label: {
                Image(systemName: "chevron.right")
                    .padding()
                    .foregroundColor(AppTheme.accent)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(AppTheme.surface.ignoresSafeArea(edges: .top))
    }
    
    private var dateString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        if Calendar.current.isDateInToday(viewModel.selectedDate) {
            return "Today, " + formatter.string(from: viewModel.selectedDate)
        }
        return formatter.string(from: viewModel.selectedDate)
    }
    
    private var summaryBar: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Consumed")
                    .font(.caption)
                    .foregroundColor(.gray)
                Text("\(Int(viewModel.dailyLog?.totalCalories ?? 0))")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
            }
            
            Spacer()
            
            Text(" / ")
                .foregroundColor(.gray)
            
            Spacer()
            
            VStack(alignment: .trailing) {
                Text("Target")
                    .font(.caption)
                    .foregroundColor(.gray)
                Text("\(Int(viewModel.userProfile?.targetCalories ?? 0))")
                    .font(.title3)
                    .fontWeight(.bold)
                    .foregroundColor(.white)
            }
        }
        .padding()
        .background(AppTheme.surface)
    }
}
