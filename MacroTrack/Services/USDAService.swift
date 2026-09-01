import Foundation

// MARK: - Models
struct USDASearchResponse: Codable {
    let foods: [USDAFoodItem]
}

struct USDAFoodItem: Codable {
    let fdcId: Int
    let description: String
    let brandOwner: String?
    let foodNutrients: [USDANutrient]?
    let foodPortions: [USDAFoodPortion]?
    
    var calories: Double { nutrientValue(id: 1008) }
    var protein: Double { nutrientValue(id: 1003) }
    var fat: Double { nutrientValue(id: 1004) }
    var carbs: Double { nutrientValue(id: 1005) }
    var fiber: Double { nutrientValue(id: 1079) }
    
    var vitaminA: Double { nutrientValue(id: 1106) }  // µg RAE
    var vitaminC: Double { nutrientValue(id: 1162) }  // mg
    var vitaminD: Double { nutrientValue(id: 1110) }  // µg
    var vitaminE: Double { nutrientValue(id: 1109) }  // mg
    var vitaminK: Double { nutrientValue(id: 1185) }  // µg
    var vitaminB1: Double { nutrientValue(id: 1165) } // mg
    var vitaminB2: Double { nutrientValue(id: 1166) } // mg
    var vitaminB3: Double { nutrientValue(id: 1167) } // mg
    var vitaminB5: Double { nutrientValue(id: 1170) } // mg
    var vitaminB6: Double { nutrientValue(id: 1175) } // mg
    var vitaminB7: Double { nutrientValue(id: 1176) } // µg
    var vitaminB9: Double { nutrientValue(id: 1177) } // µg
    var vitaminB12: Double { nutrientValue(id: 1178) }// µg
    var calcium: Double { nutrientValue(id: 1087) }   // mg
    var iron: Double { nutrientValue(id: 1089) }       // mg
    var magnesium: Double { nutrientValue(id: 1090) }  // mg
    var zinc: Double { nutrientValue(id: 1095) }       // mg
    var potassium: Double { nutrientValue(id: 1092) }  // mg
    var sodium: Double { nutrientValue(id: 1093) }     // mg
    var phosphorus: Double { nutrientValue(id: 1091) } // mg
    var selenium: Double { nutrientValue(id: 1103) }   // µg
    var copper: Double { nutrientValue(id: 1098) }     // mg
    var manganese: Double { nutrientValue(id: 1101) }  // mg
    var omega3: Double { nutrientValue(id: 1278) + nutrientValue(id: 1272) } // g EPA+DHA
    
    private func nutrientValue(id: Int) -> Double {
        foodNutrients?.first(where: { $0.nutrientId == id })?.value ?? 0.0
    }
}

struct USDANutrient: Codable {
    let nutrientId: Int
    let nutrientName: String
    let value: Double
    let unitName: String
}

struct USDAFoodPortion: Codable {
    let id: Int
    let amount: Double?
    let modifier: String?
    let gramWeight: Double
}

actor USDAService {
    private let apiKey = "DEMO_KEY"
    private let baseURL = "https://api.nal.usda.gov/fdc/v1"
    
    enum USDAError: Error {
        case invalidURL
        case networkError(Error)
        case decodingError(Error)
        case invalidResponse
    }
    
    func searchFoods(query: String, page: Int = 1, pageSize: Int = 20) async throws -> USDASearchResponse {
        var components = URLComponents(string: "\(baseURL)/foods/search")!
        components.queryItems = [
            URLQueryItem(name: "api_key", value: apiKey),
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "pageNumber", value: String(page)),
            URLQueryItem(name: "pageSize", value: String(pageSize))
        ]
        
        guard let url = components.url else { throw USDAError.invalidURL }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse, 
              (200...299).contains(httpResponse.statusCode) else {
            throw USDAError.invalidResponse
        }
        
        do {
            return try JSONDecoder().decode(USDASearchResponse.self, from: data)
        } catch {
            throw USDAError.decodingError(error)
        }
    }
    
    func getFoodDetails(fdcId: String) async throws -> USDAFoodItem {
        var components = URLComponents(string: "\(baseURL)/food/\(fdcId)")!
        components.queryItems = [
            URLQueryItem(name: "api_key", value: apiKey)
        ]
        
        guard let url = components.url else { throw USDAError.invalidURL }
        
        let (data, response) = try await URLSession.shared.data(from: url)
        
        guard let httpResponse = response as? HTTPURLResponse, 
              (200...299).contains(httpResponse.statusCode) else {
            throw USDAError.invalidResponse
        }
        
        do {
            return try JSONDecoder().decode(USDAFoodItem.self, from: data)
        } catch {
            throw USDAError.decodingError(error)
        }
    }
}
