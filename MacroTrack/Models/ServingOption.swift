import Foundation
import SwiftData

@Model
final class ServingOption {
    @Attribute(.unique) var id: UUID
    var unitName: String
    var gramWeight: Double // Weight in grams of ONE unit
    
    var foodItem: FoodItem?
    
    init(id: UUID = UUID(), unitName: String, gramWeight: Double) {
        self.id = id
        self.unitName = unitName
        self.gramWeight = gramWeight
    }
}
