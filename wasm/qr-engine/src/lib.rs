use qrcodegen::{QrCode, QrCodeEcc};
use wasm_bindgen::prelude::*;

#[derive(Debug)]
#[wasm_bindgen]
pub struct QrCodeResult {
    size: u32,
    modules: Vec<u8>,
}

#[wasm_bindgen]
impl QrCodeResult {
    #[wasm_bindgen(getter)]
    pub fn size(&self) -> u32 {
        self.size
    }

    pub fn modules(&self) -> Vec<u8> {
        self.modules.clone()
    }
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn generate_qr(content: &str, error_correction: &str) -> Result<QrCodeResult, JsValue> {
    generate_qr_inner(content, error_correction).map_err(JsValue::from_str)
}

fn generate_qr_inner(content: &str, error_correction: &str) -> Result<QrCodeResult, &'static str> {
    let input = content.trim();

    if input.is_empty() {
        return Err("Enter some text, a URL, or a Wi-Fi string to generate a QR code.");
    }

    let ecc = parse_error_correction(error_correction)?;
    let qr_code = QrCode::encode_text(input, ecc)
        .map_err(|_| "This payload is too large for the selected error correction level.")?;

    let size = u32::try_from(qr_code.size())
        .map_err(|_| "The QR engine returned an unexpected size.")?;
    let side = usize::try_from(size).map_err(|_| "The QR engine returned an unexpected size.")?;
    let mut modules = Vec::with_capacity(side * side);

    for y in 0..qr_code.size() {
        for x in 0..qr_code.size() {
            modules.push(u8::from(qr_code.get_module(x, y)));
        }
    }

    Ok(QrCodeResult { size, modules })
}

fn parse_error_correction(value: &str) -> Result<QrCodeEcc, &'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "low" | "l" => Ok(QrCodeEcc::Low),
        "medium" | "m" => Ok(QrCodeEcc::Medium),
        "quartile" | "q" => Ok(QrCodeEcc::Quartile),
        "high" | "h" => Ok(QrCodeEcc::High),
        _ => Err("Unknown error correction level. Use low, medium, quartile, or high."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_non_empty_matrix() {
        let result = generate_qr_inner("https://example.com", "medium")
            .expect("expected the QR code to be generated");

        assert!(result.size > 0);
        assert_eq!(result.modules.len(), result.size as usize * result.size as usize);
    }

    #[test]
    fn rejects_empty_content() {
        let error = generate_qr_inner("   ", "medium").expect_err("expected empty content to fail");
        assert!(error.contains("Enter some text"));
    }

    #[test]
    fn parses_common_error_correction_aliases() {
        assert!(matches!(parse_error_correction("l"), Ok(QrCodeEcc::Low)));
        assert!(matches!(parse_error_correction("medium"), Ok(QrCodeEcc::Medium)));
        assert!(matches!(parse_error_correction("Q"), Ok(QrCodeEcc::Quartile)));
        assert!(matches!(parse_error_correction("HIGH"), Ok(QrCodeEcc::High)));
    }
}
