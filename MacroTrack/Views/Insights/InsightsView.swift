import SwiftUI
import SwiftData

struct InsightsView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(HealthKitManager.self) private var healthKit
    
    @State private var viewModel = InsightsViewModel()
    @State private var animateItems = false
    
    var body: some View {
        NavigationStack {
            ZStack {
                AppTheme.background.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 20) {
                        MaintenanceCard(tdeeResult: viewModel.tdeeResult)
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 20)
                            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.1), value: animateItems)
                        
                        StepsActivityCard()
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 20)
                            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.2), value: animateItems)
                        
                        MicronutrientDashboardView(viewModel: viewModel)
                            .opacity(animateItems ? 1 : 0)
                            .offset(y: animateItems ? 0 : 20)
                            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.3), value: animateItems)
                        
                        Spacer(minLength: 40)
                    }
                    .padding(.horizontal)
                    .padding(.top, 10)
                }
            }
            .navigationTitle("Insights 🥑")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(AppTheme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .onAppear {
                animateItems = true
                Task {
                    await viewModel.loadData(context: modelContext, healthKit: healthKit)
                }
            }
            .sheet(isPresented: $viewModel.showingNutrientDetail) {
                if let selected = viewModel.selectedNutrient,
                   let status = viewModel.micronutrientStatuses.first(where: { $0.nutrient == selected }) {
                    NutrientDetailSheet(status: status)
                        .presentationDetents([.medium, .large])
                        .presentationCornerRadius(30)
                }
            }
        }
    }
}

#Preview {
    InsightsView()
        .environment(HealthKitManager.shared)
}
