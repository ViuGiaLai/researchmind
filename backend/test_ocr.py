import sys
from pathlib import Path
from loguru import logger
from PIL import Image, ImageDraw
import io

def test_ocr_import():
    try:
        logger.info("Attempting to import rapidocr_onnxruntime...")
        from rapidocr_onnxruntime import RapidOCR
        logger.info("Import successful! Initializing RapidOCR engine...")
        ocr = RapidOCR()
        logger.info("RapidOCR engine initialized successfully!")
        
        # Create a mock image with text to test OCR
        img = Image.new('RGB', (400, 100), color = (255, 255, 255))
        d = ImageDraw.Draw(img)
        d.text((10,10), "TESTING OCR PIPELINE", fill=(0,0,0))
        
        # Save to bytes
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        img_bytes = img_bytes.getvalue()
        
        logger.info("Running OCR on mock image...")
        results, elapse = ocr(img_bytes)
        logger.info(f"OCR execution finished in {elapse:.4f}s")
        logger.info(f"OCR results: {results}")
        
        return True
    except Exception as e:
        logger.exception(f"OCR test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_ocr_import()
    sys.exit(0 if success else 1)
