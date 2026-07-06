#!/usr/bin/env python3
"""
ResearchMind OCR Pipeline
Uses PaddleOCR to extract text from images.

Usage:
    python ocr_pipeline.py --input <image_path> --output <output_path>
"""

import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="ResearchMind OCR Pipeline")
    parser.add_argument("--input", required=True, help="Input image path or directory")
    parser.add_argument("--output", required=True, help="Output JSON file path")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input path does not exist: {args.input}", file=sys.stderr)
        sys.exit(1)

    # PaddleOCR integration placeholder
    # from paddleocr import PaddleOCR
    # ocr = PaddleOCR(use_angle_cls=True, lang='vi')
    #
    # if os.path.isfile(args.input):
    #     files = [args.input]
    # else:
    #     files = [os.path.join(args.input, f) for f in os.listdir(args.input)
    #              if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    #
    # results = []
    # for file in files:
    #     result = ocr.ocr(file, cls=True)
    #     texts = []
    #     for line in result[0]:
    #         texts.append({
    #             'text': line[1][0],
    #             'confidence': line[1][1],
    #             'bbox': line[0]
    #         })
    #     results.append({'file': file, 'texts': texts})
    #
    # with open(args.output, 'w', encoding='utf-8') as f:
    #     json.dump(results, f, ensure_ascii=False, indent=2)

    # Placeholder: return empty result
    result = {"status": "pending", "message": "PaddleOCR not yet integrated"}
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"OCR pipeline placeholder: {args.input} -> {args.output}")


if __name__ == "__main__":
    main()
