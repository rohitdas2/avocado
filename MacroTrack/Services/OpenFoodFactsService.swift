import Foundation

struct OFFProductResponse: Codable {
    let code: String
    let product: OFFProduct?
    let status: Int
}

struct OFFProduct: Codable {
    let productName: String?
    let brands: String?
    let servingSize: String?
    let servingQuantity: Double?
    let nutriments: OFFNutriments?
    
    enum CodingKeys: String, CodingKey {
        case productName = "product_name"
        case brands
        case servingSize = "serving_size"
        case servingQuantity = "serving_quantity"
        case nutriments
    }
}

struct OFFNutriments: Codable {
    let energyKcal100g: Double?
    let proteins100g: Double?
    let carbohydrates100g: Double?
    let fat100g: Double?
    let fiber100g: Double?
    
    enum CodingKeys: String, CodingKey {
        case energyKcal100g = "energy-kcal_100g"
        case proteins100g = "proteins_100g"
        case carbohydrates100g = "carbohydrates_100g"
        case fat100g = "fat_100g"
        case fiber100g = "fiber_100g"
    }
}

actor OpenFoodFactsService {
    private let baseURL = "https://world.openfoodfacts.org/api/v0/product"
    private let userAgent = "MacroTrackApp/1.0 (rohitdas@example.com)"
    
    enum OFFError: Error {
        case invalidURL
        case networkError(Error)
        case decodingError(Error)
        case invalidResponse
    }
    
    func fetchProduct(barcode: String) async throws -> OFFProduct? {
        let urlString = "\(baseURL)/\(barcode).json"
        guard let url = URL(string: urlString) else { throw OFFError.invalidURL }
        
        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OFFError.invalidResponse
        }
        
        do {
            let res = try JSONDecoder().decode(OFFProductResponse.self, from: data)
            if res.status == 1 {
                return res.product
            }
            return nil
        } catch {
            throw OFFError.decodingError(error)
        }
    }
}
