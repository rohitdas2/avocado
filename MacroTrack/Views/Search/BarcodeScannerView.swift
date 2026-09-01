import SwiftUI
import VisionKit

struct BarcodeScannerView: UIViewControllerRepresentable {
    var onBarcodeScanned: (String) -> Void
    
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8, .upce, .code128])],
            qualityLevel: .fast,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        
        // Auto-start scanning
        try? scanner.startScanning()
        return scanner
    }
    
    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcodeScanned: onBarcodeScanned)
    }
    
    class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onBarcodeScanned: (String) -> Void
        
        init(onBarcodeScanned: @escaping (String) -> Void) {
            self.onBarcodeScanned = onBarcodeScanned
        }
        
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard let item = addedItems.first else { return }
            
            switch item {
            case .barcode(let barcode):
                if let payloadString = barcode.payloadStringValue {
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(.success)
                    
                    dataScanner.stopScanning()
                    onBarcodeScanned(payloadString)
                }
            default:
                break
            }
        }
    }
}

// Fallback for unsupported devices (like Simulator)
struct BarcodeScannerContainer: View {
    let onScanned: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var manualBarcode: String = ""
    
    var body: some View {
        ZStack {
            AppTheme.background.ignoresSafeArea()
            
            if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                BarcodeScannerView(onBarcodeScanned: onScanned)
                    .ignoresSafeArea()
                
                VStack {
                    HStack {
                        Spacer()
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title)
                                .foregroundColor(.white)
                                .padding()
                        }
                    }
                    Spacer()
                    // Pulsing overlay
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(AppTheme.accent, lineWidth: 2)
                        .frame(width: 250, height: 150)
                        .opacity(0.8)
                    Spacer()
                }
            } else {
                VStack(spacing: 20) {
                    Text("Scanner not available")
                        .font(.headline)
                    TextField("Enter barcode manually", text: $manualBarcode)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                        .padding()
                    
                    Button("Submit") {
                        if !manualBarcode.isEmpty {
                            onScanned(manualBarcode)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    
                    Button("Cancel") { dismiss() }
                }
                .padding()
            }
        }
    }
}
