from PIL import Image, ImageEnhance, ImageFilter
import sys


def upscale_image(src: str, dst: str, scale: int = 2) -> None:
    image = Image.open(src)

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    width, height = image.size
    target = (max(width * scale, width + 1), max(height * scale, height + 1))

    # LANCZOS keeps text edges cleaner than nearest-neighbor for OCR readability.
    upscaled = image.resize(target, Image.Resampling.LANCZOS)
    upscaled = upscaled.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))

    contrast = ImageEnhance.Contrast(upscaled).enhance(1.25)
    sharp = ImageEnhance.Sharpness(contrast).enhance(1.35)

    sharp.save(dst, format="JPEG", quality=95, optimize=True)


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python upscale_image.py <input_path> <output_path> [scale]", file=sys.stderr)
        return 1

    src = sys.argv[1]
    dst = sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 2

    try:
        upscale_image(src, dst, scale)
        return 0
    except Exception as exc:
        print(f"Upscale failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
