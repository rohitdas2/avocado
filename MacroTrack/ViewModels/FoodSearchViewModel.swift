import SwiftUI
import SwiftData

enum SearchScope: String, CaseIterable, Identifiable {
    case all = "All"
    case myFoods = "My Foods"
    case recent = "Recent"
    var id: String { self.rawValue }
}

@Observable
class FoodSearchViewModel {
    var searchText: String = ""
    var searchResults: [FoodItem] = []
    var isSearching: Bool = false
    var selectedFood: FoodItem? = nil
    var showingFoodDetail: Bool = false
    var searchScope: SearchScope = .all
    
    private var searchTask: Task<Void, Never>?
    
    func performSearch(context: ModelContext, repository: FoodRepository) {
        searchTask?.cancel()
        
        guard !searchText.trimmingCharacters(in: .whitespaces).isEmpty else {
            searchResults = []
            return
        }
        
        isSearching = true
        searchTask = Task {
            do {
                try await Task.sleep(nanoseconds: 300_000_000) // 300ms debounce
                if Task.isCancelled { return }
                
                let results = await repository.searchFood(query: searchText, context: context)
                
                await MainActor.run {
                    self.searchResults = results
                    self.isSearching = false
                }
            } catch {
                await MainActor.run { self.isSearching = false }
            }
        }
    }
    
    func handleBarcodeResult(_ barcode: String, context: ModelContext, repository: FoodRepository) async {
        isSearching = true
        let food = await repository.lookupBarcode(code: barcode, context: context)
        await MainActor.run {
            if let food = food {
                self.selectedFood = food
                self.showingFoodDetail = true
            }
            self.isSearching = false
        }
    }
}
