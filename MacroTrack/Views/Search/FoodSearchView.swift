import SwiftUI
import SwiftData

struct FoodSearchView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(FoodRepository.self) private var repository
    @Environment(\.dismiss) private var dismiss
    
    @State private var viewModel = FoodSearchViewModel()
    @State private var showingScanner = false
    let targetMeal: MealLog
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Search Scope", selection: $viewModel.searchScope) {
                    ForEach(SearchScope.allCases) { scope in
                        Text(scope.rawValue).tag(scope)
                    }
                }
                .pickerStyle(.segmented)
                .padding()
                .background(AppTheme.surface)
                
                if viewModel.isSearching && viewModel.searchResults.isEmpty {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if viewModel.searchResults.isEmpty && !viewModel.searchText.isEmpty {
                    Spacer()
                    Text("No foods found.")
                        .foregroundColor(.secondary)
                    Spacer()
                } else if viewModel.searchResults.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary)
                        Text("Search for foods or scan a barcode")
                            .font(.headline)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                } else {
                    List {
                        ForEach(viewModel.searchResults) { food in
                            Button {
                                viewModel.selectedFood = food
                                viewModel.showingFoodDetail = true
                            } label: {
                                FoodRowView(food: food)
                            }
                            .listRowBackground(AppTheme.surface)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(AppTheme.background.ignoresSafeArea())
            .navigationTitle("Add Food")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $viewModel.searchText, prompt: "Search foods...")
            .onChange(of: viewModel.searchText) { _, _ in
                viewModel.performSearch(context: modelContext, repository: repository)
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingScanner = true
                    } label: {
                        Image(systemName: "barcode.viewfinder")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $viewModel.showingFoodDetail) {
                if let food = viewModel.selectedFood {
                    FoodDetailSheet(food: food, targetMeal: targetMeal)
                        .presentationDetents([.medium, .large])
                }
            }
            .fullScreenCover(isPresented: $showingScanner) {
                BarcodeScannerView { barcode in
                    showingScanner = false
                    Task {
                        await viewModel.handleBarcodeResult(barcode, context: modelContext, repository: repository)
                    }
                }
            }
        }
    }
}

struct FoodRowView: View {
    let food: FoodItem
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(food.name)
                    .font(.headline)
                    .foregroundColor(.primary)
                Spacer()
                Text("\(Int(food.caloriesPer100g)) kcal")
                    .font(.subheadline.bold())
            }
            
            if let brand = food.brand {
                Text(brand)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            HStack(spacing: 12) {
                MacroBadge(label: "P", value: food.proteinPer100g, color: AppTheme.protein)
                MacroBadge(label: "C", value: food.carbsPer100g, color: AppTheme.carbs)
                MacroBadge(label: "F", value: food.fatPer100g, color: AppTheme.fat)
            }
        }
        .padding(.vertical, 4)
    }
}

struct MacroBadge: View {
    let label: String
    let value: Double
    let color: Color
    
    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption2.bold())
                .foregroundColor(color)
            Text("\(Int(value))g")
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }
}
